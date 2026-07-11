package main

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	requestTimeout  = 30 * time.Second // ROADMAP: per-request override comes with the saved-Request model
	maxResponseSize = 20 << 20         // ponytail: 20 MB hard cap so a huge download can't OOM the webview
)

// App struct
type App struct {
	ctx     context.Context
	client  *http.Client
	dataDir string
	mu      sync.Mutex // guards all storage file access

	mockMu    sync.Mutex // guards mocks; never held together with mu
	mocks     map[string]*runningMock
	emitEvent func(name string, data ...any) // nil outside a wails runtime (tests)
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		client:  &http.Client{Timeout: requestTimeout},
		dataDir: defaultDataDir(),
		mocks:   map[string]*runningMock{},
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.emitEvent = func(name string, data ...any) {
		runtime.EventsEmit(ctx, name, data...)
	}
}

// Auth is a header shortcut: bearer fills Authorization: Bearer <token>,
// basic fills Authorization via base64(user:pass). Type "" means none.
type Auth struct {
	Type     string `json:"type"` // "", "bearer" or "basic"
	Token    string `json:"token"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type RequestInput struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Params  map[string]string `json:"params"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
	Auth    Auth              `json:"auth"`
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
func (a *App) SendRequest(in RequestInput) (*ResponseData, error) {
	vars := a.activeVariables()
	var body io.Reader
	if in.Body != "" {
		body = strings.NewReader(substitute(in.Body, vars))
	}
	finalURL := substitute(in.URL, vars)
	if len(in.Params) > 0 {
		u, err := url.Parse(finalURL)
		if err != nil {
			return nil, err
		}
		q := u.Query()
		for k, v := range in.Params {
			q.Set(substitute(k, vars), substitute(v, vars))
		}
		u.RawQuery = q.Encode()
		finalURL = u.String()
	}
	req, err := http.NewRequestWithContext(a.ctx, in.Method, finalURL, body)
	if err != nil {
		return nil, err
	}
	for k, v := range in.Headers {
		req.Header.Set(substitute(k, vars), substitute(v, vars))
	}
	// the auth helper wins over a manually typed Authorization header
	switch in.Auth.Type {
	case "bearer":
		req.Header.Set("Authorization", "Bearer "+substitute(in.Auth.Token, vars))
	case "basic":
		req.SetBasicAuth(substitute(in.Auth.Username, vars), substitute(in.Auth.Password, vars))
	}

	start := time.Now()
	resp, err := a.client.Do(req)
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
