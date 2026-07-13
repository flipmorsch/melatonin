package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/options"
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

	sessionMu    sync.Mutex
	sessionVars  map[string]string // ephemeral variables set by scripts via env.set()
}

// NewApp creates a new App application struct
func NewApp() *App {
	jar, _ := cookiejar.New(nil) // only errors on a bad PublicSuffixList; nil is valid
	insecure := http.DefaultTransport.(*http.Transport).Clone()
	insecure.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} // per-request opt-in only
	return &App{
		jar:         jar,
		insecure:    insecure,
		dataDir:     defaultDataDir(),
		mocks:       map[string]*runningMock{},
		sessionVars: map[string]string{},
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

// focusFromSecondInstance runs in the first instance when a second launch is
// blocked by the single-instance lock: bring the existing window forward.
func (a *App) focusFromSecondInstance(options.SecondInstanceData) {
	runtime.WindowUnminimise(a.ctx)
	runtime.Show(a.ctx)
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
	Method    string      `json:"method"`
	URL       string      `json:"url"`
	Params    KVList      `json:"params"`
	Headers   KVList      `json:"headers"`
	Body      string      `json:"body"`
	Auth      Auth        `json:"auth"`
	Options   SendOptions `json:"options"`
	PreScript  string      `json:"preRequestScript"`  // JavaScript, runs before {{var}} substitution
	PostScript string      `json:"postResponseScript"` // JavaScript, runs after response arrives
}

type ResponseData struct {
	Status        int                 `json:"status"`
	StatusText    string              `json:"statusText"`
	Headers       map[string][]string `json:"headers"`
	Body          string              `json:"body"`
	DurationMs    int64               `json:"durationMs"`
	Size          int                 `json:"size"`
	Truncated     bool                `json:"truncated"`
	FinalURL      string              `json:"finalUrl"` // after {{var}} substitution and param rows
	PreScriptLog  string              `json:"preScriptLog"`  // console output from pre-request script
	PostScriptLog string              `json:"postScriptLog"` // console output from post-response script
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

// ---- session variables ----

func (a *App) copySessionVars() map[string]string {
	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()
	out := make(map[string]string, len(a.sessionVars))
	for k, v := range a.sessionVars {
		out[k] = v
	}
	return out
}

func (a *App) setSessionVars(vars map[string]string) {
	a.sessionMu.Lock()
	a.sessionVars = vars
	a.sessionMu.Unlock()
}

// SessionVariables returns a copy of the ephemeral session variable store.
func (a *App) SessionVariables() map[string]string {
	return a.copySessionVars()
}

// ClearSessionVariables empties the session variable store.
func (a *App) ClearSessionVariables() {
	a.sessionMu.Lock()
	a.sessionVars = map[string]string{}
	a.sessionMu.Unlock()
}

// mergeVars returns a new map with env vars overlaid by session vars.
func mergeVars(env, session map[string]string) map[string]string {
	if len(session) == 0 {
		return env
	}
	merged := make(map[string]string, len(env)+len(session))
	for k, v := range env {
		merged[k] = v
	}
	for k, v := range session {
		merged[k] = v
	}
	return merged
}
// SendRequest performs an HTTP request and returns the response.
// {{variable}} references are resolved against the active environment and
// any session variables set by scripts. Every send — including failures —
// is recorded to history.
func (a *App) SendRequest(in RequestInput) (*ResponseData, error) {
	hadPre := strings.TrimSpace(in.PreScript) != ""
	hadPost := strings.TrimSpace(in.PostScript) != ""

	envVars := a.activeVariables()
	sessionVars := a.copySessionVars()
	defer a.setSessionVars(sessionVars)

	// Snapshot script fields before the pre-script mutates in.
	origPre := in.PreScript
	origPost := in.PostScript

	var preErr string
	var postErr string
	var preLog string
	var postLog string

	// 1. Pre-request script — runs on raw request before {{var}} substitution.
	if hadPre {
		sr := newScriptRuntime()
		modified, log, err := sr.runPreScript(in.PreScript, &in, envVars, sessionVars)
		preLog = log
		if err != nil {
			preErr = err.Error()
			preLog += "\n[error] " + preErr
			a.recordHistory(in, nil, err, hadPre, hadPost, preErr, "")
			return nil, fmt.Errorf("pre-request script failed:\n%s", preLog)
		}
		in = *modified
		// jsToRequest drops script fields (they're not on the JS object);
		// carry them forward from the original input.
		in.PreScript = origPre
		in.PostScript = origPost
	}

	// 2. Merge env + session vars for substitution. Session wins.
	vars := mergeVars(envVars, sessionVars)

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
		a.recordHistory(in, nil, err, hadPre, hadPost, preErr, "")
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
	httpResp, err := client.Do(req)
	if err != nil {
		a.recordHistory(in, nil, err, hadPre, hadPost, preErr, "")
		return nil, err
	}
	defer httpResp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(httpResp.Body, maxResponseSize+1))
	if err != nil {
		a.recordHistory(in, nil, err, hadPre, hadPost, preErr, "")
		return nil, err
	}
	truncated := len(data) > maxResponseSize
	if truncated {
		data = data[:maxResponseSize]
	}

	resp := &ResponseData{
		Status:     httpResp.StatusCode,
		StatusText: http.StatusText(httpResp.StatusCode),
		Headers:    httpResp.Header,
		Body:       string(data),
		DurationMs: time.Since(start).Milliseconds(),
		Size:       len(data),
		Truncated:  truncated,
		FinalURL:   finalURL,
	}

	// 4. Build a resolved-request snapshot for the post-response script.
	if hadPost {
		resolvedReq := in
		resolvedReq.URL = finalURL
		sr := newScriptRuntime()
		modified, log, pErr := sr.runPostScript(in.PostScript, &resolvedReq, resp, envVars, sessionVars)
		postLog = log
		if pErr != nil {
			postErr = pErr.Error()
			postLog += "\n[error] " + postErr
		} else {
			resp = modified
		}
	}

	resp.PreScriptLog = preLog
	resp.PostScriptLog = postLog
	a.recordHistory(in, resp, nil, hadPre, hadPost, preErr, postErr)

	return resp, nil
}
