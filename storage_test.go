package main

import (
	"os"
	"path/filepath"
	"testing"
)

func testApp(t *testing.T) *App {
	a := NewApp()
	a.dataDir = t.TempDir()
	return a
}

func TestCollectionCRUD(t *testing.T) {
	a := testApp(t)

	cols, err := a.ListCollections()
	if err != nil || len(cols) != 0 {
		t.Fatalf("empty list: cols=%v err=%v", cols, err)
	}

	col, err := a.CreateCollection("Blincast API")
	if err != nil {
		t.Fatal(err)
	}

	req, err := a.SaveRequest(col.ID, SavedRequest{
		Name:    "List users",
		Method:  "GET",
		URL:     "https://example.com/users",
		Headers: map[string]string{"Accept": "application/json"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if req.ID == "" {
		t.Fatal("SaveRequest did not assign an ID")
	}

	req.Name = "List all users"
	if _, err := a.SaveRequest(col.ID, *req); err != nil {
		t.Fatal(err)
	}

	cols, err = a.ListCollections()
	if err != nil {
		t.Fatal(err)
	}
	if len(cols) != 1 || len(cols[0].Requests) != 1 || cols[0].Requests[0].Name != "List all users" {
		t.Fatalf("round-trip mismatch: %+v", cols)
	}

	if err := a.DeleteRequest(col.ID, req.ID); err != nil {
		t.Fatal(err)
	}
	cols, _ = a.ListCollections()
	if len(cols[0].Requests) != 0 {
		t.Fatalf("request not deleted: %+v", cols[0].Requests)
	}

	if err := a.DeleteCollection(col.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(a.dataDir, "collections", col.ID+".json")); !os.IsNotExist(err) {
		t.Fatal("collection file still exists")
	}
}

func TestEnvironmentCRUD(t *testing.T) {
	a := testApp(t)

	set, err := a.GetEnvironments()
	if err != nil || len(set.Environments) != 0 || set.ActiveID != "" {
		t.Fatalf("empty set: %+v err=%v", set, err)
	}

	env, err := a.SaveEnvironment(Environment{Name: "dev", Variables: map[string]string{"baseUrl": "http://localhost:8080"}})
	if err != nil {
		t.Fatal(err)
	}
	if env.ID == "" {
		t.Fatal("SaveEnvironment did not assign an ID")
	}

	if err := a.SetActiveEnvironment(env.ID); err != nil {
		t.Fatal(err)
	}
	if vars := a.activeVariables(); vars["baseUrl"] != "http://localhost:8080" {
		t.Fatalf("activeVariables = %v", vars)
	}

	if err := a.SetActiveEnvironment("ghost"); err == nil {
		t.Fatal("expected error activating unknown environment")
	}

	if err := a.DeleteEnvironment(env.ID); err != nil {
		t.Fatal(err)
	}
	set, _ = a.GetEnvironments()
	if len(set.Environments) != 0 || set.ActiveID != "" {
		t.Fatalf("delete should clear env and active flag: %+v", set)
	}
	if vars := a.activeVariables(); vars != nil {
		t.Fatalf("no active env, got vars %v", vars)
	}
}

func TestSubstitute(t *testing.T) {
	vars := map[string]string{"baseUrl": "http://x", "token": "t0k"}
	for in, want := range map[string]string{
		"{{baseUrl}}/users":       "http://x/users",
		"Bearer {{ token }}":      "Bearer t0k",
		"{{unknown}} stays":       "{{unknown}} stays",
		"no vars here":            "no vars here",
		"{{baseUrl}}/{{baseUrl}}": "http://x/http://x",
	} {
		if got := substitute(in, vars); got != want {
			t.Errorf("substitute(%q) = %q, want %q", in, got, want)
		}
	}
	if got := substitute("{{baseUrl}}", nil); got != "{{baseUrl}}" {
		t.Errorf("nil vars: got %q", got)
	}
}

func TestSaveRequestUnknownIDs(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("c")

	if _, err := a.SaveRequest("nope", SavedRequest{Name: "x"}); err == nil {
		t.Fatal("expected error for unknown collection")
	}
	if _, err := a.SaveRequest(col.ID, SavedRequest{ID: "ghost", Name: "x"}); err == nil {
		t.Fatal("expected error for unknown request ID")
	}
	if err := a.DeleteRequest(col.ID, "ghost"); err == nil {
		t.Fatal("expected error deleting unknown request")
	}
}
