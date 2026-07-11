package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSendOptionsRedirects(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/r":
			http.Redirect(w, r, "/final", http.StatusFound)
		case "/final":
			w.Write([]byte("final"))
		}
	}))
	defer srv.Close()

	a := testApp(t)
	a.startup(context.Background())

	res, err := a.SendRequest(RequestInput{Method: "GET", URL: srv.URL + "/r"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != http.StatusOK || res.Body != "final" {
		t.Fatalf("default should follow redirects: status=%d body=%q", res.Status, res.Body)
	}

	res, err = a.SendRequest(RequestInput{Method: "GET", URL: srv.URL + "/r",
		Options: SendOptions{NoFollowRedirects: true}})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != http.StatusFound || len(res.Headers["Location"]) == 0 {
		t.Fatalf("NoFollowRedirects should surface the 302: status=%d headers=%v", res.Status, res.Headers)
	}
}

func TestSendOptionsSkipTLSVerify(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("secure"))
	}))
	defer srv.Close()

	a := testApp(t)
	a.startup(context.Background())

	if _, err := a.SendRequest(RequestInput{Method: "GET", URL: srv.URL}); err == nil {
		t.Fatal("self-signed cert should fail with TLS verify on (the default)")
	}
	res, err := a.SendRequest(RequestInput{Method: "GET", URL: srv.URL,
		Options: SendOptions{SkipTLSVerify: true}})
	if err != nil {
		t.Fatal(err)
	}
	if res.Body != "secure" {
		t.Fatalf("body=%q", res.Body)
	}
}

func TestSendOptionsTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(3 * time.Second)
	}))
	defer srv.Close()

	a := testApp(t)
	a.startup(context.Background())

	start := time.Now()
	_, err := a.SendRequest(RequestInput{Method: "GET", URL: srv.URL,
		Options: SendOptions{TimeoutSec: 1}})
	if err == nil || !strings.Contains(err.Error(), "Timeout") {
		t.Fatalf("expected client timeout, got %v", err)
	}
	if time.Since(start) > 2*time.Second {
		t.Fatalf("timeout override not applied: took %s", time.Since(start))
	}
}

func TestCookieJarPersistsAcrossSends(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/login":
			http.SetCookie(w, &http.Cookie{Name: "session", Value: "s3ss"})
		case "/me":
			if c, err := r.Cookie("session"); err != nil || c.Value != "s3ss" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.Write([]byte("hello"))
		}
	}))
	defer srv.Close()

	a := testApp(t)
	a.startup(context.Background())

	if _, err := a.SendRequest(RequestInput{Method: "GET", URL: srv.URL + "/login"}); err != nil {
		t.Fatal(err)
	}
	res, err := a.SendRequest(RequestInput{Method: "GET", URL: srv.URL + "/me"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != http.StatusOK || res.Body != "hello" {
		t.Fatalf("cookie did not persist across sends: status=%d body=%q", res.Status, res.Body)
	}
}
