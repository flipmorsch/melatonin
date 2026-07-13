package main

import (
	"os"
	"path/filepath"
	"strings"
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
		Headers: KVList{{Key: "Accept", Value: "application/json"}},
	}, "")
	if err != nil {
		t.Fatal(err)
	}
	if req.ID == "" {
		t.Fatal("SaveRequest did not assign an ID")
	}

	req.Name = "List all users"
	if _, err := a.SaveRequest(col.ID, *req, ""); err != nil {
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

func TestFolderCRUD(t *testing.T) {
	a := testApp(t)

	col, err := a.CreateCollection("Test")
	if err != nil {
		t.Fatal(err)
	}

	// Create a root-level folder.
	f, err := a.CreateFolder(col.ID, "", "auth")
	if err != nil {
		t.Fatal(err)
	}
	if f.ID == "" {
		t.Fatal("CreateFolder did not assign an ID")
	}

	// Create a child folder inside it.
	f2, err := a.CreateFolder(col.ID, f.ID, "oauth")
	if err != nil {
		t.Fatal(err)
	}
	// Create a request at root and verify it's there.
	_, err = a.SaveRequest(col.ID, SavedRequest{
		Name:   "Token",
		Method: "POST",
		URL:    "https://example.com/token",
	}, "")
	if err != nil {
		t.Fatal(err)
	}
	cols, _ := a.ListCollections()
	if len(cols[0].Requests) != 1 {
		t.Fatalf("expected 1 root-level request, got %d", len(cols[0].Requests))
	}

	// Delete root folder: cascades to child folder (no requests inside it yet).
	if err := a.DeleteFolder(col.ID, f.ID); err != nil {
		t.Fatal(err)
	}
	cols, _ = a.ListCollections()
	if len(cols[0].Folders) != 0 {
		t.Fatalf("folder should be deleted, got %d folders", len(cols[0].Folders))
	}
	// Root request survives.
	if len(cols[0].Requests) != 1 {
		t.Fatalf("root request should survive folder delete, got %d", len(cols[0].Requests))
	}

	_ = f2 // created but deleted via cascade
}

func TestFolderCascadeDelete(t *testing.T) {
	a := testApp(t)

	col, _ := a.CreateCollection("Test")

	f, _ := a.CreateFolder(col.ID, "", "parent")
	child, _ := a.CreateFolder(col.ID, f.ID, "child")

	// Put requests in both folders — save at root then we'd need a MoveRequest to place
	// them inside folders. For now, verify cascade count works for empty folders.
	n, err := a.CountFolderDescendants(col.ID, f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("empty folders: expected 0 descendants, got %d", n)
	}

	// Delete parent cascades to child.
	if err := a.DeleteFolder(col.ID, f.ID); err != nil {
		t.Fatal(err)
	}
	cols, _ := a.ListCollections()
	if len(cols[0].Folders) != 0 {
		t.Fatal("all folders should be deleted")
	}
	_ = child
}

func TestSaveRequestInFolder(t *testing.T) {
	// Requests always save at root; updating an existing request keeps its position.
	a := testApp(t)
	col, _ := a.CreateCollection("Test")

	req, _ := a.SaveRequest(col.ID, SavedRequest{
		Name:   "Root req",
		Method: "GET",
		URL:    "http://x",
	}, "")
	req.Name = "Updated root req"
	if _, err := a.SaveRequest(col.ID, *req, ""); err != nil {
		t.Fatal(err)
	}
	cols, _ := a.ListCollections()
	if cols[0].Requests[0].Name != "Updated root req" {
		t.Fatalf("update failed: %+v", cols[0].Requests[0])
	}
}

func TestFolderErrors(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")

	if _, err := a.CreateFolder(col.ID, "ghost", "nope"); err == nil {
		t.Fatal("expected error for unknown parent folder")
	}
	if err := a.DeleteFolder(col.ID, "ghost"); err == nil {
		t.Fatal("expected error deleting unknown folder")
	}
	if _, err := a.CountFolderDescendants(col.ID, "ghost"); err == nil {
		t.Fatal("expected error counting unknown folder")
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

// Collection files written before ADR 0003 store params/headers as
// {"k":"v"} objects; they must keep loading (keys sorted for determinism).
// The migration from flat folder strings to FolderNode trees is also tested here.
func TestLegacyMapParamsAndHeadersStillLoad(t *testing.T) {
	a := testApp(t)
	legacy := `{"id":"c1","name":"old","requests":[{
		"id":"r1","name":"list","method":"GET","url":"http://x",
		"params":{"page":"2","filter":"on"},
		"headers":{"Accept":"application/json"},
		"body":"","auth":{"type":"","token":"","username":"","password":""}}]}`
	dir := filepath.Join(a.dataDir, "collections")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "c1.json"), []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}

	cols, err := a.ListCollections()
	if err != nil {
		t.Fatal(err)
	}
	if len(cols) != 1 {
		t.Fatalf("expected 1 collection, got %d", len(cols))
	}
	r := cols[0].Requests[0]
	want := KVList{{Key: "filter", Value: "on"}, {Key: "page", Value: "2"}}
	if len(r.Params) != 2 || r.Params[0] != want[0] || r.Params[1] != want[1] {
		t.Fatalf("params = %+v, want %+v", r.Params, want)
	}
	if len(r.Headers) != 1 || r.Headers[0] != (KV{Key: "Accept", Value: "application/json"}) {
		t.Fatalf("headers = %+v", r.Headers)
	}
	// No "folder": keys in the legacy JSON, so no migration happens —
	// but the collection still loads into the new format (Folders is empty).
	if len(cols[0].Folders) != 0 {
		t.Fatalf("expected 0 folders, got %d", len(cols[0].Folders))
	}
}

// TestLegacyFolderMigration verifies that collection files with the old
// flat "folder" string on each request are migrated to FolderNode trees.
func TestLegacyFolderMigration(t *testing.T) {
	a := testApp(t)
	legacy := `{"id":"c2","name":"migrate-me","requests":[
		{"id":"r1","name":"root-req","folder":"","method":"GET","url":"http://x","params":[],"headers":[],"body":"","auth":{"type":"","token":"","username":"","password":""},"options":{"timeoutSec":0,"noFollowRedirects":false,"skipTlsVerify":false}},
		{"id":"r2","name":"auth-req","folder":"auth","method":"POST","url":"http://x/login","params":[],"headers":[],"body":"","auth":{"type":"bearer","token":"t","username":"","password":""},"options":{"timeoutSec":0,"noFollowRedirects":false,"skipTlsVerify":false}},
		{"id":"r3","name":"user-req","folder":"users","method":"GET","url":"http://x/users","params":[],"headers":[],"body":"","auth":{"type":"","token":"","username":"","password":""},"options":{"timeoutSec":0,"noFollowRedirects":false,"skipTlsVerify":false}}
	]}`
	dir := filepath.Join(a.dataDir, "collections")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "c2.json"), []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}

	cols, err := a.ListCollections()
	if err != nil {
		t.Fatal(err)
	}
	c := cols[0]
	if c.Name != "migrate-me" {
		t.Fatalf("name = %q", c.Name)
	}
	// 1 root-level request.
	if len(c.Requests) != 1 || c.Requests[0].Name != "root-req" {
		t.Fatalf("expected 1 root request 'root-req', got %d: %+v", len(c.Requests), c.Requests)
	}
	// 2 folders: "auth" and "users" (sorted alphabetically by migration).
	if len(c.Folders) != 2 {
		t.Fatalf("expected 2 folders, got %d", len(c.Folders))
	}
	if c.Folders[0].Name != "auth" || len(c.Folders[0].Requests) != 1 || c.Folders[0].Requests[0].Name != "auth-req" {
		t.Fatalf("folder[0] = %+v", c.Folders[0])
	}
	if c.Folders[1].Name != "users" || len(c.Folders[1].Requests) != 1 || c.Folders[1].Requests[0].Name != "user-req" {
		t.Fatalf("folder[1] = %+v", c.Folders[1])
	}
	// Re-read the file — migration should have persisted (no "folder": in the JSON anymore).
	data, err := os.ReadFile(filepath.Join(dir, "c2.json"))
	if err != nil {
		t.Fatal(err)
	}
	if contains := string(data); contains == "" {
		t.Fatal("migrated file should contain data")
	}
	// After migration, "folder": keys should not appear.
	raw := string(data)
	for _, needle := range []string{`"folder":`} {
		if strings.Contains(raw, needle) {
			t.Fatalf("legacy 'folder' key should not appear in migrated file")
		}
	}
}

func TestSaveRequestUnknownIDs(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("c")

	if _, err := a.SaveRequest("nope", SavedRequest{Name: "x"}, ""); err == nil {
		t.Fatal("expected error for unknown collection")
	}
	if _, err := a.SaveRequest(col.ID, SavedRequest{ID: "ghost", Name: "x"}, ""); err == nil {
		t.Fatal("expected error for unknown request ID")
	}
	if err := a.DeleteRequest(col.ID, "ghost"); err == nil {
		t.Fatal("expected error deleting unknown request")
	}
}

func TestMoveRequest(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")

	// Create three requests at root.
	r1, _ := a.SaveRequest(col.ID, SavedRequest{Name: "A", Method: "GET", URL: "http://x"}, "")
	_, _ = a.SaveRequest(col.ID, SavedRequest{Name: "B", Method: "GET", URL: "http://x"}, "")
	r3, _ := a.SaveRequest(col.ID, SavedRequest{Name: "C", Method: "GET", URL: "http://x"}, "")

	// Move r1 (currently position 0) to position 1.
	if err := a.MoveRequest(col.ID, r1.ID, "", 1); err != nil {
		t.Fatal(err)
	}
	cols, _ := a.ListCollections()
	reqs := cols[0].Requests
	if reqs[0].Name != "B" || reqs[1].Name != "A" || reqs[2].Name != "C" {
		t.Fatalf("after move to 1: got %v", names(reqs))
	}

	// Move r3 (currently position 2) to position 0.
	if err := a.MoveRequest(col.ID, r3.ID, "", 0); err != nil {
		t.Fatal(err)
	}
	cols, _ = a.ListCollections()
	reqs = cols[0].Requests
	if reqs[0].Name != "C" || reqs[1].Name != "B" || reqs[2].Name != "A" {
		t.Fatalf("after move to 0: got %v", names(reqs))
	}

	// Positions should be sequential after each move.
	for i, req := range reqs {
		if req.Position != i {
			t.Fatalf("request %q has position %d, want %d", req.Name, req.Position, i)
		}
	}
}

func TestMoveRequestRoundTrip(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")

	r1, _ := a.SaveRequest(col.ID, SavedRequest{Name: "A", Method: "GET", URL: "http://x"}, "")
	_, _ = a.SaveRequest(col.ID, SavedRequest{Name: "B", Method: "GET", URL: "http://x"}, "")

	// Move and re-read from disk to verify persistence.
	a.MoveRequest(col.ID, r1.ID, "", 1)

	// Re-read via ListCollections (fresh from disk).
	cols, _ := a.ListCollections()
	reqs := cols[0].Requests
	if reqs[0].Name != "B" || reqs[1].Name != "A" {
		t.Fatalf("round-trip: got %v", names(reqs))
	}
	if reqs[0].Position != 0 || reqs[1].Position != 1 {
		t.Fatalf("round-trip positions: [0]=%d [1]=%d", reqs[0].Position, reqs[1].Position)
	}
}

func TestMoveRequestErrors(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")

	if err := a.MoveRequest("nope", "r1", "", 0); err == nil {
		t.Fatal("expected error for unknown collection")
	}
	if err := a.MoveRequest(col.ID, "ghost", "", 0); err == nil {
		t.Fatal("expected error for unknown request")
	}
}

func TestMoveRequestInFolder(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")
	f, _ := a.CreateFolder(col.ID, "", "folder")

	// Save requests inside the folder.
	_, _ = a.SaveRequest(col.ID, SavedRequest{Name: "X", Method: "GET", URL: "http://x"}, f.ID)
	_, _ = a.SaveRequest(col.ID, SavedRequest{Name: "Y", Method: "GET", URL: "http://x"}, f.ID)
	r3, _ := a.SaveRequest(col.ID, SavedRequest{Name: "Z", Method: "GET", URL: "http://x"}, f.ID)

	// Move last to first.
	if err := a.MoveRequest(col.ID, r3.ID, "", 0); err != nil {
		t.Fatal(err)
	}
	cols, _ := a.ListCollections()
	reqs := cols[0].Folders[0].Requests
	if reqs[0].Name != "Z" || reqs[1].Name != "X" || reqs[2].Name != "Y" {
		t.Fatalf("move in folder: got %v", names(reqs))
	}
}

func TestMoveFolder(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")

	_, _ = a.CreateFolder(col.ID, "", "alpha")
	_, _ = a.CreateFolder(col.ID, "", "beta")
	f3, _ := a.CreateFolder(col.ID, "", "gamma")

	// Move f3 (position 2) to position 0.
	if err := a.MoveFolder(col.ID, f3.ID, "", 0); err != nil {
		t.Fatal(err)
	}
	cols, _ := a.ListCollections()
	folders := cols[0].Folders
	if folders[0].Name != "gamma" || folders[1].Name != "alpha" || folders[2].Name != "beta" {
		t.Fatalf("after move: got %v", folderNames(folders))
	}
	for i, f := range folders {
		if f.Position != i {
			t.Fatalf("folder %q has position %d, want %d", f.Name, f.Position, i)
		}
	}
}

func TestMoveFolderErrors(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")

	if err := a.MoveFolder("nope", "f1", "", 0); err == nil {
		t.Fatal("expected error for unknown collection")
	}
	if err := a.MoveFolder(col.ID, "ghost", "", 0); err == nil {
		t.Fatal("expected error for unknown folder")
	}
}

func TestMoveFolderInFolder(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")
	parent, _ := a.CreateFolder(col.ID, "", "parent")

	_, _ = a.CreateFolder(col.ID, parent.ID, "one")
	child2, _ := a.CreateFolder(col.ID, parent.ID, "two")

	// Move child2 to position 0.
	if err := a.MoveFolder(col.ID, child2.ID, "", 0); err != nil {
		t.Fatal(err)
	}
	cols, _ := a.ListCollections()
	children := cols[0].Folders[0].Folders
	if children[0].Name != "two" || children[1].Name != "one" {
		t.Fatalf("move child folder: got %v", folderNames(children))
	}
}

func TestNewRequestPosition(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")

	a.SaveRequest(col.ID, SavedRequest{Name: "first", Method: "GET", URL: "http://x"}, "")
	a.SaveRequest(col.ID, SavedRequest{Name: "second", Method: "GET", URL: "http://x"}, "")
	a.SaveRequest(col.ID, SavedRequest{Name: "third", Method: "GET", URL: "http://x"}, "")

	cols, _ := a.ListCollections()
	for i, req := range cols[0].Requests {
		if req.Position != i {
			t.Fatalf("new request %q: position=%d, want=%d", req.Name, req.Position, i)
		}
	}
}

func TestMoveRequestReparent(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")
	root, _ := a.SaveRequest(col.ID, SavedRequest{Name: "Root", Method: "GET", URL: "http://x"}, "")
	dest, _ := a.CreateFolder(col.ID, "", "dest")

	// Move root-level request into the folder at position 0.
	if err := a.MoveRequest(col.ID, root.ID, dest.ID, 0); err != nil {
		t.Fatal(err)
	}
	cols, _ := a.ListCollections()
	if len(cols[0].Requests) != 0 {
		t.Fatal("root should be empty after reparent")
	}
	if len(cols[0].Folders[0].Requests) != 1 {
		t.Fatal("folder should have one request after reparent")
	}
	if cols[0].Folders[0].Requests[0].Name != "Root" {
		t.Fatalf("expected Root in folder, got %s", cols[0].Folders[0].Requests[0].Name)
	}
	if cols[0].Folders[0].Requests[0].Position != 0 {
		t.Fatalf("position should be 0, got %d", cols[0].Folders[0].Requests[0].Position)
	}
}

func TestMoveRequestReparentErrors(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")
	r1, _ := a.SaveRequest(col.ID, SavedRequest{Name: "A", Method: "GET", URL: "http://x"}, "")

	// Unknown target folder.
	if err := a.MoveRequest(col.ID, r1.ID, "ghost", 0); err == nil {
		t.Fatal("expected error for unknown parent folder")
	}
}

func TestMoveFolderReparent(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")
	parent, _ := a.CreateFolder(col.ID, "", "parent")
	child, _ := a.CreateFolder(col.ID, parent.ID, "child")
	sibling, _ := a.CreateFolder(col.ID, "", "sibling")

	// Move child folder into sibling.
	if err := a.MoveFolder(col.ID, child.ID, sibling.ID, 0); err != nil {
		t.Fatal(err)
	}
	cols, _ := a.ListCollections()
	parentFolder := cols[0].Folders[0]
	siblingFolder := cols[0].Folders[1]
	if len(parentFolder.Folders) != 0 {
		t.Fatal("parent should have no children after reparent")
	}
	if len(siblingFolder.Folders) != 1 {
		t.Fatal("sibling should have one child after reparent")
	}
	if siblingFolder.Folders[0].Name != "child" {
		t.Fatalf("expected child in sibling, got %s", siblingFolder.Folders[0].Name)
	}
}

func TestMoveFolderSelfPrevention(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")
	f, _ := a.CreateFolder(col.ID, "", "f")

	// Cannot move a folder into itself.
	if err := a.MoveFolder(col.ID, f.ID, f.ID, 0); err == nil {
		t.Fatal("expected error for self-reparent")
	}
}

func TestMoveFolderDescendantPrevention(t *testing.T) {
	a := testApp(t)
	col, _ := a.CreateCollection("Test")
	parent, _ := a.CreateFolder(col.ID, "", "parent")
	child, _ := a.CreateFolder(col.ID, parent.ID, "child")

	// Cannot move parent into its own child.
	if err := a.MoveFolder(col.ID, parent.ID, child.ID, 0); err == nil {
		t.Fatal("expected error for moving parent into descendant")
	}
}

func names(reqs []SavedRequest) []string {
	out := make([]string, len(reqs))
	for i, r := range reqs {
		out[i] = r.Name
	}
	return out
}

func folderNames(folders []FolderNode) []string {
	out := make([]string, len(folders))
	for i, f := range folders {
		out[i] = f.Name
	}
	return out
}
