package main

import (
	"context"
	"crypto/tls"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	requestTimeout  = 30 * time.Second // default; per-request override via SendOptions
	maxResponseSize = 20 << 20         // ponytail: 20 MB hard cap so a huge download can't OOM the webview
)

// App struct
type App struct {
	ctx      context.Context
	jar      http.CookieJar    // silent in-memory cookie jar (ROADMAP: managing/viewing it is future work)
	insecure http.RoundTripper // shared transport for skip-TLS-verify sends, so connections still pool
	dataDir  string
	mu       sync.Mutex // guards all storage file access

	mockMu    sync.Mutex // guards mocks; never held together with mu
	mocks     map[string]*runningMock
	emitEvent func(name string, data ...any) // nil outside a wails runtime (tests)
}

// NewApp creates a new App application struct
func NewApp() *App {
	jar, _ := cookiejar.New(nil) // only errors on a bad PublicSuffixList; nil is valid
	insecure := http.DefaultTransport.(*http.Transport).Clone()
	insecure.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} // per-request opt-in only
	return &App{
		jar:      jar,
		insecure: insecure,
		dataDir:  defaultDataDir(),
		mocks:    map[string]*runningMock{},
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.emitEvent = func(name string, data ...any) {
		runtime.EventsEmit(ctx, name, data...)
	}
	a.restoreMocks()
}

// Auth is a header shortcut: bearer fills Authorization: Bearer <token>,
// basic fills Authorization via base64(user:pass). Type "" means none.
type Auth struct {
	Type     string `json:"type"` // "", "bearer" or "basic"
	Token    string `json:"token"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// SendOptions are per-request overrides of the send defaults. The zero
// value means: 30s timeout, follow redirects, verify TLS.
type SendOptions struct {
	TimeoutSec        int  `json:"timeoutSec"` // 0 = default
	NoFollowRedirects bool `json:"noFollowRedirects"`
	SkipTLSVerify     bool `json:"skipTlsVerify"`
}

type RequestInput struct {
	Method  string      `json:"method"`
	URL     string      `json:"url"`
	Params  KVList      `json:"params"`
	Headers KVList      `json:"headers"`
	Body    string      `json:"body"`
	Auth    Auth        `json:"auth"`
	Options SendOptions `json:"options"`
}

type ResponseData struct {
	Status     int                 `json:"status"`
	StatusText string              `json:"statusText"`
	Headers    map[string][]string `json:"headers"`
	Body       string              `json:"body"`
	DurationMs int64               `json:"durationMs"`
	Size       int                 `json:"size"`
	Truncated  bool                `json:"truncated"`
}

var varPattern = regexp.MustCompile(`\{\{\s*([\w-]+)\s*\}\}`)

// substitute replaces {{name}} with the variable's value. Unknown variables are
// left untouched rather than erroring — bodies may legitimately contain {{...}}
// that isn't ours (e.g. mustache templates).
func substitute(s string, vars map[string]string) string {
	if len(vars) == 0 || !strings.Contains(s, "{{") {
		return s
	}
	return varPattern.ReplaceAllStringFunc(s, func(m string) string {
		name := varPattern.FindStringSubmatch(m)[1]
		if v, ok := vars[name]; ok {
			return v
		}
		return m
	})
}

// SendRequest performs an HTTP request and returns the response.
// {{variable}} references are resolved against the active environment.
// An error return rejects the JS promise, which the UI shows as the failure message.
// Every send — including failures — is recorded to history.
func (a *App) SendRequest(in RequestInput) (*ResponseData, error) {
	resp, err := a.send(in)
	a.recordHistory(in, resp, err)
	return resp, err
}

func (a *App) send(in RequestInput) (*ResponseData, error) {
	vars := a.activeVariables()
	var body io.Reader
	if in.Body != "" {
		body = strings.NewReader(substitute(in.Body, vars))
	}
	// The URL is sent as typed; param rows are appended after its query
	// string in row order — no re-encode, no sorting, no override (ADR 0003).
	finalURL := substitute(in.URL, vars)
	var query strings.Builder
	for _, p := range in.Params {
		if p.Key == "" {
			continue
		}
		if query.Len() > 0 {
			query.WriteByte('&')
		}
		query.WriteString(url.QueryEscape(substitute(p.Key, vars)))
		query.WriteByte('=')
		query.WriteString(url.QueryEscape(substitute(p.Value, vars)))
	}
	if query.Len() > 0 {
		sep := "?"
		if strings.Contains(finalURL, "?") {
			sep = "&"
		}
		finalURL += sep + query.String()
	}
	req, err := http.NewRequestWithContext(a.ctx, in.Method, finalURL, body)
	if err != nil {
		return nil, err
	}
	for _, h := range in.Headers {
		if h.Key == "" {
			continue
		}
		req.Header.Add(substitute(h.Key, vars), substitute(h.Value, vars))
	}
	// the auth helper wins over a manually typed Authorization header
	switch in.Auth.Type {
	case "bearer":
		req.Header.Set("Authorization", "Bearer "+substitute(in.Auth.Token, vars))
	case "basic":
		req.SetBasicAuth(substitute(in.Auth.Username, vars), substitute(in.Auth.Password, vars))
	}

	client := &http.Client{Timeout: requestTimeout, Jar: a.jar}
	if in.Options.TimeoutSec > 0 {
		client.Timeout = time.Duration(in.Options.TimeoutSec) * time.Second
	}
	if in.Options.NoFollowRedirects {
		client.CheckRedirect = func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		}
	}
	if in.Options.SkipTLSVerify {
		client.Transport = a.insecure
	}

	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseSize+1))
	if err != nil {
		return nil, err
	}
	truncated := len(data) > maxResponseSize
	if truncated {
		data = data[:maxResponseSize]
	}

	return &ResponseData{
		Status:     resp.StatusCode,
		StatusText: http.StatusText(resp.StatusCode),
		Headers:    resp.Header,
		Body:       string(data),
		DurationMs: time.Since(start).Milliseconds(),
		Size:       len(data),
		Truncated:  truncated,
	}, nil
}
