package main

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestMockServerLifecycle(t *testing.T) {
	a := testApp(t)

	m, err := a.SaveMockServer(MockServer{
		Name: "api",
		Port: 0, // let the OS pick a free port
		Routes: []MockRoute{
			{Method: "GET", Path: "/users", Status: 200, Headers: map[string]string{"Content-Type": "application/json"}, Body: `[{"id":1}]`},
			{Method: "POST", Path: "/users", Status: 201, Body: `{"id":2}`},
			{Method: "GET", Path: "/files/*", Status: 200, Body: "wildcard"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if m.Routes[0].ID == "" {
		t.Fatal("route IDs not assigned")
	}

	if err := a.StartMockServer(m.ID); err != nil {
		t.Fatal(err)
	}
	defer a.StopMockServer(m.ID)
	port, ok := a.RunningMockServers()[m.ID]
	if !ok {
		t.Fatal("mock not reported as running")
	}
	base := fmt.Sprintf("http://127.0.0.1:%d", port)

	get := func(method, path string) (int, string) {
		req, _ := http.NewRequest(method, base+path, strings.NewReader("ping"))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, string(body)
	}

	if s, b := get("GET", "/users"); s != 200 || b != `[{"id":1}]` {
		t.Fatalf("GET /users: %d %q", s, b)
	}
	if s, b := get("POST", "/users"); s != 201 || b != `{"id":2}` {
		t.Fatalf("POST /users: %d %q", s, b)
	}
	if s, b := get("GET", "/files/a/b.txt"); s != 200 || b != "wildcard" {
		t.Fatalf("wildcard: %d %q", s, b)
	}
	if s, b := get("DELETE", "/nope"); s != 404 || !strings.Contains(b, "no route matched") {
		t.Fatalf("unmatched: %d %q", s, b)
	}

	log, err := a.GetMockLog(m.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(log) != 4 || !log[0].Matched || log[3].Matched {
		t.Fatalf("log wrong: %+v", log)
	}
	if log[3].Method != "DELETE" || log[3].Path != "/nope" || log[3].Body != "ping" {
		t.Fatalf("log entry wrong: %+v", log[3])
	}

	// live route update without restart
	m.Routes = append(m.Routes, MockRoute{Method: "GET", Path: "/live", Status: 200, Body: "hot"})
	if _, err := a.SaveMockServer(*m); err != nil {
		t.Fatal(err)
	}
	if s, b := get("GET", "/live"); s != 200 || b != "hot" {
		t.Fatalf("live update: %d %q", s, b)
	}

	if err := a.StopMockServer(m.ID); err != nil {
		t.Fatal(err)
	}
	if len(a.RunningMockServers()) != 0 {
		t.Fatal("still reported running after stop")
	}
	if _, err := http.Get(base + "/users"); err == nil {
		t.Fatal("server still answering after stop")
	}
	if err := a.StopMockServer(m.ID); err != nil {
		t.Fatal("double stop should be a no-op")
	}
}

func TestMockRunStateRestoredOnLaunch(t *testing.T) {
	a1 := testApp(t)
	m, err := a1.SaveMockServer(MockServer{Name: "api", Port: 0,
		Routes: []MockRoute{{Method: "GET", Path: "/ping", Status: 200, Body: "pong"}}})
	if err != nil {
		t.Fatal(err)
	}
	if err := a1.StartMockServer(m.ID); err != nil {
		t.Fatal(err)
	}
	defer a1.StopMockServer(m.ID)
	// no Stop — simulates the app closing while the mock was running

	// restoreMocks directly rather than startup(): a real Wails context can't
	// exist in tests, and EventsEmit log.Fatals on any other context
	a2 := NewApp()
	a2.dataDir = a1.dataDir
	a2.restoreMocks()
	port, ok := a2.RunningMockServers()[m.ID]
	if !ok {
		t.Fatal("running mock not restored on next launch")
	}
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/ping", port))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("restored mock answered %d", resp.StatusCode)
	}

	// an explicit stop persists that intent: the next launch must not restore
	if err := a2.StopMockServer(m.ID); err != nil {
		t.Fatal(err)
	}
	a3 := NewApp()
	a3.dataDir = a1.dataDir
	a3.restoreMocks()
	if len(a3.RunningMockServers()) != 0 {
		t.Fatal("explicitly stopped mock came back on launch")
	}
}
