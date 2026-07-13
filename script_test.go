package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testAppWithCtx(t *testing.T) *App {
	a := testApp(t)
	a.ctx = context.Background()
	return a
}


func TestRunPreScriptModifiesRequest(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{
		Method: "GET",
		URL:    "https://example.com/api",
		Headers: KVList{{Key: "Accept", Value: "application/json"}},
	}

	script := `
		request.method = "POST";
		request.headers.push({key: "X-Custom", value: "hello"});
		request.body = JSON.stringify({test: true});
	`

	modified, log, err := sr.runPreScript(script, in, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if modified.Method != "POST" {
		t.Errorf("method: want POST, got %s", modified.Method)
	}
	if modified.Body != `{"test":true}` {
		t.Errorf("body: want {\"test\":true}, got %s", modified.Body)
	}
	found := false
	for _, h := range modified.Headers {
		if h.Key == "X-Custom" && h.Value == "hello" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("X-Custom header not found in %+v", modified.Headers)
	}
	if log == "" {
		t.Log("no console output (expected when script doesn't log)")
	}
}

func TestRunPreScriptConsoleOutput(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{Method: "GET", URL: "https://example.com"}

	script := `console.log("hello"); console.warn("careful"); console.error("fail");`

	_, log, err := sr.runPreScript(script, in, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(log, "[log] hello") {
		t.Errorf("log missing 'hello': %s", log)
	}
	if !strings.Contains(log, "[warn] careful") {
		t.Errorf("log missing 'careful': %s", log)
	}
	if !strings.Contains(log, "[error] fail") {
		t.Errorf("log missing 'fail': %s", log)
	}
}

func TestRunPreScriptError(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{Method: "GET", URL: "https://example.com"}

	script := `throw new Error("script failure");`

	_, _, err := sr.runPreScript(script, in, nil, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "script failure") {
		t.Errorf("error should mention 'script failure': %v", err)
	}
}

func TestRunPreScriptEmpty(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{Method: "GET", URL: "https://example.com"}

	modified, log, err := sr.runPreScript("", in, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if modified != in {
		t.Error("empty script should return original input pointer")
	}
	if log != "" {
		t.Errorf("empty script should have no log: %s", log)
	}
}

func TestRunPreScriptSizeLimit(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{Method: "GET", URL: "https://example.com"}

	script := strings.Repeat("x", maxScriptSize+1)
	_, _, err := sr.runPreScript(script, in, nil, nil)
	if err == nil {
		t.Fatal("expected size limit error, got nil")
	}
	if !strings.Contains(err.Error(), "exceed") {
		t.Errorf("error should mention size limit: %v", err)
	}
}

func TestRunPostScriptModifiesResponse(t *testing.T) {
	sr := newScriptRuntime()
	resolvedReq := &RequestInput{Method: "GET", URL: "https://example.com/api"}
	resp := &ResponseData{
		Status:  200,
		Body:    `{"key":"value"}`,
		Headers: map[string][]string{"Content-Type": {"application/json"}},
	}

	script := `
		response.status = 201;
		response.headers["X-Extra"] = ["added"];
		var data = response.json();
		data.key = "modified";
		response.body = JSON.stringify(data);
	`

	modified, log, err := sr.runPostScript(script, resolvedReq, resp, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if modified.Status != 201 {
		t.Errorf("status: want 201, got %d", modified.Status)
	}
	if !strings.Contains(modified.Body, `"modified"`) {
		t.Errorf("body should contain 'modified': %s", modified.Body)
	}
	if modified.Headers["X-Extra"] == nil {
		t.Errorf("X-Extra header not found in %+v", modified.Headers)
	}
	if log == "" {
		t.Log("no console output (expected)")
	}
}

func TestRunPostScriptErrorPreservesResponse(t *testing.T) {
	sr := newScriptRuntime()
	resolvedReq := &RequestInput{Method: "GET", URL: "https://example.com"}
	resp := &ResponseData{Status: 200, Body: "original"}

	script := `throw new Error("post fail");`

	modified, _, err := sr.runPostScript(script, resolvedReq, resp, nil, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	// On error, the original response should be returned unchanged.
	if modified.Body != "original" {
		t.Errorf("body should be original after error: %s", modified.Body)
	}
}

func TestEnvGetFromEnv(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{Method: "GET", URL: "https://{{host}}/api"}

	envVars := map[string]string{"host": "example.com", "port": "8080"}
	sessionVars := map[string]string{}

	script := `
		var h = env.get("host");
		request.url = "https://" + h + ":" + env.get("port") + "/api";
	`

	modified, _, err := sr.runPreScript(script, in, envVars, sessionVars)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if modified.URL != "https://example.com:8080/api" {
		t.Errorf("URL: want https://example.com:8080/api, got %s", modified.URL)
	}
}

func TestEnvSessionTakesPrecedence(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{Method: "GET", URL: "https://{{host}}/api"}

	envVars := map[string]string{"host": "env.example.com"}
	sessionVars := map[string]string{"host": "session.example.com"}

	script := `request.url = "https://" + env.get("host") + "/api";`

	modified, _, err := sr.runPreScript(script, in, envVars, sessionVars)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if modified.URL != "https://session.example.com/api" {
		t.Errorf("URL should use session var: got %s", modified.URL)
	}
}

func TestEnvSetWritesToSession(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{Method: "GET", URL: "https://example.com"}

	sessionVars := map[string]string{}

	script := `
		env.set("token", "abc123");
		request.headers.push({key: "Authorization", value: "Bearer " + env.get("token")});
	`

	modified, _, err := sr.runPreScript(script, in, nil, sessionVars)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sessionVars["token"] != "abc123" {
		t.Errorf("session should have token: got %v", sessionVars)
	}
	found := false
	for _, h := range modified.Headers {
		if h.Key == "Authorization" && h.Value == "Bearer abc123" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("Authorization header not set: %+v", modified.Headers)
	}
}

func TestAtobBtoa(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{Method: "GET", URL: "https://example.com"}

	script := `
		var encoded = btoa("hello world");
		var decoded = atob(encoded);
		request.url = "https://example.com/" + decoded;
	`

	modified, _, err := sr.runPreScript(script, in, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if modified.URL != "https://example.com/hello world" {
		t.Errorf("URL: got %s", modified.URL)
	}
}

func TestCryptoRandomUUID(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{Method: "GET", URL: "https://example.com"}

	script := `
		var id = crypto.randomUUID();
		request.headers.push({key: "X-Request-Id", value: id});
	`

	modified, _, err := sr.runPreScript(script, in, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	found := false
	for _, h := range modified.Headers {
		if h.Key == "X-Request-Id" && len(h.Value) == 36 {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("X-Request-Id header with UUID not found in %+v", modified.Headers)
	}
}

func TestSleep(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{Method: "GET", URL: "https://example.com"}

	// Sleep is synchronous in goja (no event loop needed).
	script := `
		sleep(10);
		console.log("slept");
	`

	_, log, err := sr.runPreScript(script, in, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(log, "[log] slept") {
		t.Errorf("log should contain 'slept': %s", log)
	}
}

func TestFetch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	}))
	defer srv.Close()

	sr := newScriptRuntime()
	in := &RequestInput{Method: "GET", URL: srv.URL}

	script := `
		var r = fetch(request.url);
		console.log("status: " + r.status);
		var data = r.json();
		request.url = request.url + "/" + data.status;
	`

	modified, log, err := sr.runPreScript(script, in, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(log, "[log] status: 200") {
		t.Errorf("log should contain status: %s", log)
	}
	if !strings.HasSuffix(modified.URL, "/ok") {
		t.Errorf("URL should end with /ok: %s", modified.URL)
	}
}

func TestResponseJsonMethod(t *testing.T) {
	sr := newScriptRuntime()
	resolvedReq := &RequestInput{Method: "GET", URL: "https://example.com"}
	resp := &ResponseData{
		Status: 200,
		Body:   `{"nested":{"deep":42}}`,
	}

	script := `
		var data = response.json();
		console.log("deep: " + data.nested.deep);
	`

	_, log, err := sr.runPostScript(script, resolvedReq, resp, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(log, "[log] deep: 42") {
		t.Errorf("log should contain 'deep: 42': %s", log)
	}
}

func TestSendRequestWithScripts(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("server saw method %s, want POST (pre-script should have changed it)", r.Method)
		}
		if r.Header.Get("X-Script") != "yes" {
			t.Errorf("server missing X-Script header")
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		w.Write([]byte(`{"created":true}`))
	}))
	defer srv.Close()

	a := testAppWithCtx(t)
	in := RequestInput{
		Method:    "GET", // will be changed by pre-script
		URL:       srv.URL,
		PreScript: `request.method = "POST"; request.headers.push({key: "X-Script", value: "yes"});`,
		PostScript: `response.status = 200; console.log("post-ran");`,
	}

	resp, err := a.SendRequest(in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != 200 {
		t.Errorf("status: want 200 (post-script override), got %d", resp.Status)
	}
	if resp.PreScriptLog == "" {
		t.Log("pre-script log is empty (no console output — expected)")
	}
	if !strings.Contains(resp.PostScriptLog, "[log] post-ran") {
		t.Errorf("postScriptLog should contain 'post-ran': %s", resp.PostScriptLog)
	}

	// Check history recorded the script outcomes.
	h, err := a.GetHistory()
	if err != nil {
		t.Fatalf("GetHistory: %v", err)
	}
	if len(h) != 1 {
		t.Fatalf("history: want 1 entry, got %d", len(h))
	}
	if !h[0].HadPreScript {
		t.Error("history entry should have HadPreScript=true")
	}
	if !h[0].HadPostScript {
		t.Error("history entry should have HadPostScript=true")
	}
}

func TestSendRequestPreScriptError(t *testing.T) {
	a := testAppWithCtx(t)
	in := RequestInput{
		Method:    "GET",
		URL:       "https://example.com",
		PreScript: `throw new Error("bad script");`,
	}

	_, err := a.SendRequest(in)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "bad script") {
		t.Errorf("error should mention 'bad script': %v", err)
	}

	// History should have the error recorded.
	h, err := a.GetHistory()
	if err != nil {
		t.Fatalf("GetHistory: %v", err)
	}
	if len(h) != 1 {
		t.Fatalf("history: want 1 entry, got %d", len(h))
	}
	if h[0].PreScriptError == "" {
		t.Error("history entry should have PreScriptError")
	}
}

func TestSendRequestSessionVars(t *testing.T) {
	a := testAppWithCtx(t)

	// First server: no auth check, just returns OK.
	srv1 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{}`))
	}))
	defer srv1.Close()

	// First request: post-response script sets a session variable.
	in1 := RequestInput{
		Method:     "GET",
		URL:        srv1.URL,
		PostScript: `env.set("token", "extracted-token");`,
	}
	_, err := a.SendRequest(in1)
	if err != nil {
		t.Fatalf("first send: %v", err)
	}

	// Second server: checks for the Authorization header set by {{token}}.
	srv2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer extracted-token" {
			t.Errorf("missing expected Authorization header: %s", r.Header.Get("Authorization"))
		}
		w.Write([]byte(`{}`))
	}))
	defer srv2.Close()

	// Second request: uses the session variable via {{token}}.
	in2 := RequestInput{
		Method:  "GET",
		URL:     srv2.URL,
		Headers: KVList{{Key: "Authorization", Value: "Bearer {{token}}"}},
	}
	resp, err := a.SendRequest(in2)
	if err != nil {
		t.Fatalf("second send: %v", err)
	}
	if resp == nil {
		t.Fatal("expected response")
	}

	// Verify session vars are accessible.
	vars := a.SessionVariables()
	if vars["token"] != "extracted-token" {
		t.Errorf("session var token: want 'extracted-token', got %q", vars["token"])
	}

	// Clear and verify.
	a.ClearSessionVariables()
	vars = a.SessionVariables()
	if len(vars) != 0 {
		t.Errorf("session vars not cleared: %v", vars)
	}
}

func TestRequestToJSAndBack(t *testing.T) {
	sr := newScriptRuntime()
	in := &RequestInput{
		Method:  "PUT",
		URL:     "https://example.com/api",
		Params:  KVList{{Key: "page", Value: "1"}, {Key: "sort", Value: "desc"}},
		Headers: KVList{{Key: "Accept", Value: "application/json"}},
		Body:    `{"data":true}`,
		Auth:    Auth{Type: "bearer", Token: "secret"},
		Options: SendOptions{TimeoutSec: 15, NoFollowRedirects: true},
	}

	// Set up the VM with the request object, run a no-op, read it back.
	sr.vm.Set("request", sr.requestToJS(in))
	sr.vm.RunString(`/* no-op */`)
	result := sr.jsToRequest(sr.vm.Get("request"))
	if len(result.Params) != 2 || result.Params[0].Key != "page" || result.Params[1].Key != "sort" {
		t.Errorf("params: %+v", result.Params)
	}
	if len(result.Headers) != 1 || result.Headers[0].Key != "Accept" {
		t.Errorf("headers: %+v", result.Headers)
	}
	if result.Body != `{"data":true}` {
		t.Errorf("body: %s", result.Body)
	}
	if result.Auth.Type != "bearer" || result.Auth.Token != "secret" {
		t.Errorf("auth: %+v", result.Auth)
	}
	if result.Options.TimeoutSec != 15 || !result.Options.NoFollowRedirects {
		t.Errorf("options: %+v", result.Options)
	}
}
