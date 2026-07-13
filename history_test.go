package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHistoryRecordsSends(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(strings.Repeat("x", historyBodyCap+10)))
	}))
	defer srv.Close()

	a := testApp(t)
	a.startup(context.Background())

	if _, err := a.SendRequest(RequestInput{Method: "GET", URL: srv.URL + "/big"}); err != nil {
		t.Fatal(err)
	}
	// failed send: nothing listens on this port
	if _, err := a.SendRequest(RequestInput{Method: "GET", URL: "http://127.0.0.1:1/nope"}); err == nil {
		t.Fatal("expected connection error")
	}

	h, err := a.GetHistory()
	if err != nil {
		t.Fatal(err)
	}
	if len(h) != 2 {
		t.Fatalf("want 2 entries, got %d", len(h))
	}
	// newest first
	if h[0].Error == "" || h[0].Response != nil {
		t.Fatalf("newest entry should be the failed send: %+v", h[0])
	}
	if h[1].Request.URL != srv.URL+"/big" || h[1].Response == nil {
		t.Fatalf("oldest entry should be the successful send: %+v", h[1])
	}
	if h[1].Response.FinalURL != srv.URL+"/big" {
		t.Fatalf("resolved URL not recorded: %q", h[1].Response.FinalURL)
	}
	if len(h[1].Response.Body) != historyBodyCap || !h[1].Response.Truncated {
		t.Fatalf("stored body not clipped to cap: len=%d truncated=%v",
			len(h[1].Response.Body), h[1].Response.Truncated)
	}

	if err := a.ClearHistory(); err != nil {
		t.Fatal(err)
	}
	if h, _ := a.GetHistory(); len(h) != 0 {
		t.Fatalf("history not cleared: %d entries", len(h))
	}
}

func TestHistoryCap(t *testing.T) {
	a := testApp(t)
	for range historyMax + 5 {
		a.recordHistory(RequestInput{Method: "GET", URL: "http://x/"}, nil, nil, false, false, "", "")
	}
	h, err := a.GetHistory()
	if err != nil {
		t.Fatal(err)
	}
	if len(h) != historyMax {
		t.Fatalf("want cap of %d, got %d", historyMax, len(h))
	}
}
