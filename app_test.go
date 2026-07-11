package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSendRequestSubstitutesActiveEnvironment(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/users" || r.Header.Get("Authorization") != "Bearer t0k" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Write([]byte("ok"))
	}))
	defer srv.Close()

	app := testApp(t)
	app.startup(context.Background())
	env, err := app.SaveEnvironment(Environment{Name: "dev", Variables: map[string]string{
		"baseUrl": srv.URL,
		"token":   "t0k",
	}})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.SetActiveEnvironment(env.ID); err != nil {
		t.Fatal(err)
	}

	res, err := app.SendRequest(RequestInput{
		Method:  "GET",
		URL:     "{{baseUrl}}/users",
		Headers: KVList{{Key: "Authorization", Value: "Bearer {{token}}"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != http.StatusOK || res.Body != "ok" {
		t.Fatalf("status=%d body=%q — substitution did not reach the wire", res.Status, res.Body)
	}
}

func TestSendRequestParamsAndAuth(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/bearer":
			// rows append after the URL's own query, in row order, duplicates kept
			if r.URL.RawQuery != "q=existing&page=2&tag=a&tag=b" {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			if r.Header.Get("Authorization") != "Bearer sekret" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
		case "/basic":
			user, pass, ok := r.BasicAuth()
			if !ok || user != "bob" || pass != "hunter2" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
		}
		w.Write([]byte("ok"))
	}))
	defer srv.Close()

	app := testApp(t)
	app.startup(context.Background())

	res, err := app.SendRequest(RequestInput{
		Method: "GET",
		URL:    srv.URL + "/bearer?q=existing",
		Params: KVList{{Key: "page", Value: "2"}, {Key: "tag", Value: "a"}, {Key: "tag", Value: "b"}},
		Auth:   Auth{Type: "bearer", Token: "sekret"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != http.StatusOK {
		t.Fatalf("bearer+params: status %d", res.Status)
	}

	res, err = app.SendRequest(RequestInput{
		Method: "GET",
		URL:    srv.URL + "/basic",
		Auth:   Auth{Type: "basic", Username: "bob", Password: "hunter2"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != http.StatusOK {
		t.Fatalf("basic: status %d", res.Status)
	}
}

func TestSendRequest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("X-Check") != "yes" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	app := NewApp()
	app.startup(context.Background())

	res, err := app.SendRequest(RequestInput{
		Method:  "POST",
		URL:     srv.URL,
		Headers: KVList{{Key: "X-Check", Value: "yes"}},
		Body:    `{"in":1}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != http.StatusCreated {
		t.Fatalf("status = %d, want 201", res.Status)
	}
	if res.Body != `{"ok":true}` {
		t.Fatalf("body = %q, want {\"ok\":true}", res.Body)
	}
	if res.Size != len(res.Body) || res.Truncated {
		t.Fatalf("size = %d, truncated = %v", res.Size, res.Truncated)
	}
}
