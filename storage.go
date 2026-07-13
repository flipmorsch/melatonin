package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// KV is one query param or header row. Order and duplicate keys are
// preserved (ADR 0003).
type KV struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// KVList unmarshals from either the current [{key,value}] array or the
// pre-ADR-0003 {"k":"v"} map shape found in older collection files.
type KVList []KV

func (l *KVList) UnmarshalJSON(data []byte) error {
	var arr []KV
	if err := json.Unmarshal(data, &arr); err == nil {
		*l = arr
		return nil
	}
	var m map[string]string
	if err := json.Unmarshal(data, &m); err != nil {
		return fmt.Errorf("expected [{key,value}] array or legacy object: %w", err)
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	*l = make(KVList, 0, len(m))
	for _, k := range keys {
		*l = append(*l, KV{Key: k, Value: m[k]})
	}
	return nil
}

// SavedRequest is an HTTP request definition stored inside a Collection
// (at root or nested inside a FolderNode).
type SavedRequest struct {
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	Method   string      `json:"method"`
	URL      string      `json:"url"`
	Params   KVList      `json:"params"`
	Headers  KVList      `json:"headers"`
	Body     string      `json:"body"`
	Auth     Auth        `json:"auth"`
	Options  SendOptions `json:"options"` // zero value in pre-v1.1 collection files = all defaults
	Position int         `json:"position"`
}

// FolderNode is a named grouping inside a Collection. It contains child
// folders and child requests, forming a nested tree. Order is user-controlled
type FolderNode struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Position int            `json:"position"`
	Folders  []FolderNode   `json:"folders"`
	Requests []SavedRequest `json:"requests"`
}

// Collection is a named container holding an ordered tree of FolderNodes
// and root-level Requests.
type Collection struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Folders  []FolderNode   `json:"folders"`
	Requests []SavedRequest `json:"requests"`
}

// ---------- position helpers (shared by generic moveInSlice/insertAt) ----------

func savedReqID(r SavedRequest) string      { return r.ID }
func savedReqSetPos(r *SavedRequest, i int) { r.Position = i }
func folderNodeID(f FolderNode) string      { return f.ID }
func folderNodeSetPos(f *FolderNode, i int) { f.Position = i }

// ---------- legacy types for v1 migration ----------

// legacySavedRequest is the pre-tree format with a flat Folder string.
type legacySavedRequest struct {
	ID      string      `json:"id"`
	Name    string      `json:"name"`
	Folder  string      `json:"folder"`
	Method  string      `json:"method"`
	URL     string      `json:"url"`
	Params  KVList      `json:"params"`
	Headers KVList      `json:"headers"`
	Body    string      `json:"body"`
	Auth    Auth        `json:"auth"`
	Options SendOptions `json:"options"`
}

// legacyCollection is the pre-tree flat format.
type legacyCollection struct {
	ID       string               `json:"id"`
	Name     string               `json:"name"`
	Requests []legacySavedRequest `json:"requests"`
}

// migrateCollection converts a flat legacy collection into the tree format.
// Requests with the same folder name are grouped into a FolderNode.
func migrateCollection(lc *legacyCollection) *Collection {
	c := &Collection{
		ID:       lc.ID,
		Name:     lc.Name,
		Folders:  []FolderNode{},
		Requests: []SavedRequest{},
	}
	folderMap := map[string][]SavedRequest{} // folder name -> requests
	rootReqs := []SavedRequest{}
	for _, lr := range lc.Requests {
		sr := SavedRequest{
			ID:      lr.ID,
			Name:    lr.Name,
			Method:  lr.Method,
			URL:     lr.URL,
			Params:  lr.Params,
			Headers: lr.Headers,
			Body:    lr.Body,
			Auth:    lr.Auth,
			Options: lr.Options,
		}
		if lr.Folder == "" {
			rootReqs = append(rootReqs, sr)
		} else {
			folderMap[lr.Folder] = append(folderMap[lr.Folder], sr)
		}
	}
	c.Requests = rootReqs
	// preserve order: sort folder names for determinism
	folderNames := make([]string, 0, len(folderMap))
	for n := range folderMap {
		folderNames = append(folderNames, n)
	}
	sort.Strings(folderNames)
	for _, name := range folderNames {
		c.Folders = append(c.Folders, FolderNode{
			ID:       newID(),
			Name:     name,
			Requests: folderMap[name],
			Folders:  []FolderNode{},
		})
	}
	return c
}

// ---------- helpers ----------

func defaultDataDir() string {
	base, err := os.UserConfigDir()
	if err != nil {
		base = "."
	}
	return filepath.Join(base, "melatonin")
}

func newID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func readJSONFile(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, v); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}
	return nil
}

// writeJSONFile writes atomically (temp file + rename) so a crash mid-write
// can't corrupt the user's data.
func writeJSONFile(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (a *App) collectionsDir() string { return filepath.Join(a.dataDir, "collections") }

func (a *App) collectionPath(id string) string {
	return filepath.Join(a.collectionsDir(), id+".json")
}

func (a *App) readCollection(id string) (*Collection, error) {
	data, err := os.ReadFile(a.collectionPath(id))
	if err != nil {
		return nil, err
	}
	// Detect old flat format: if the JSON contains "folder": keys on requests,
	// migrate to the tree format. The SavedRequest struct no longer has a Folder
	// field, so old data would silently lose folder information without this.
	if bytes.Contains(data, []byte(`"folder":`)) {
		var lc legacyCollection
		if err := json.Unmarshal(data, &lc); err != nil {
			return nil, fmt.Errorf("parse legacy %s: %w", a.collectionPath(id), err)
		}
		c := migrateCollection(&lc)
		// Write back in new format so the migration is persisted.
		if err := a.writeCollection(c); err != nil {
			return nil, err
		}
		return c, nil
	}
	var c Collection
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("parse %s: %w", a.collectionPath(id), err)
	}
	// Ensure empty slices, not nil, and sort by Position.
	if c.Folders == nil {
		c.Folders = []FolderNode{}
	}
	if c.Requests == nil {
		c.Requests = []SavedRequest{}
	}
	sort.SliceStable(c.Requests, func(i, j int) bool { return c.Requests[i].Position < c.Requests[j].Position })
	normalizeFolderNodes(c.Folders)
	return &c, nil
}

func (a *App) writeCollection(c *Collection) error {
	// Normalize so JSON always writes [] not null, and positions are sorted.
	if c.Folders == nil {
		c.Folders = []FolderNode{}
	}
	if c.Requests == nil {
		c.Requests = []SavedRequest{}
	}
	sort.SliceStable(c.Requests, func(i, j int) bool { return c.Requests[i].Position < c.Requests[j].Position })
	normalizeFolderNodes(c.Folders)
	return writeJSONFile(a.collectionPath(c.ID), c)
}

// normalizeFolderNodes sorts children by Position and ensures empty slices are
// written as [] not null.
func normalizeFolderNodes(folders []FolderNode) {
	sort.SliceStable(folders, func(i, j int) bool { return folders[i].Position < folders[j].Position })
	for i := range folders {
		sort.SliceStable(folders[i].Requests, func(a, b int) bool { return folders[i].Requests[a].Position < folders[i].Requests[b].Position })
		if folders[i].Folders == nil {
			folders[i].Folders = []FolderNode{}
		}
		if folders[i].Requests == nil {
			folders[i].Requests = []SavedRequest{}
		}
		normalizeFolderNodes(folders[i].Folders)
	}
}

func (a *App) ListCollections() ([]Collection, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	entries, err := os.ReadDir(a.collectionsDir())
	if errors.Is(err, os.ErrNotExist) {
		return []Collection{}, nil
	}
	if err != nil {
		return nil, err
	}
	cols := []Collection{}
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		c, err := a.readCollection(strings.TrimSuffix(e.Name(), ".json"))
		if err != nil {
			return nil, err
		}
		cols = append(cols, *c)
	}
	sort.Slice(cols, func(i, j int) bool { return cols[i].Name < cols[j].Name })
	return cols, nil
}

func (a *App) CreateCollection(name string) (*Collection, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c := &Collection{
		ID:       newID(),
		Name:     name,
		Folders:  []FolderNode{},
		Requests: []SavedRequest{},
	}
	return c, a.writeCollection(c)
}

func (a *App) DeleteCollection(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	return os.Remove(a.collectionPath(id))
}

// SaveRequest creates or updates a request. When ID is empty, a new request
// is created: at root if parentFolderID is "", or inside the named folder.
// When ID is set, the request is updated in-place anywhere in the tree.
func (a *App) SaveRequest(collectionID string, req SavedRequest, parentFolderID string) (*SavedRequest, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, err := a.readCollection(collectionID)
	if err != nil {
		return nil, err
	}
	if req.ID == "" {
		req.ID = newID()
		if parentFolderID == "" {
			req.Position = len(c.Requests)
			c.Requests = append(c.Requests, req)
		} else {
			if !insertRequestInTree(c, parentFolderID, req) {
				return nil, fmt.Errorf("parent folder %s not found in collection %s", parentFolderID, collectionID)
			}
		}
	} else {
		if !updateRequestInTree(c, req) {
			return nil, fmt.Errorf("request %s not in collection %s", req.ID, collectionID)
		}
	}
	return &req, a.writeCollection(c)
}

// insertRequestInTree places req into the folder identified by parentID.
func insertRequestInTree(c *Collection, parentID string, req SavedRequest) bool {
	for i := range c.Folders {
		if c.Folders[i].ID == parentID {
			req.Position = len(c.Folders[i].Requests)
			c.Folders[i].Requests = append(c.Folders[i].Requests, req)
			return true
		}
		if insertRequestInFolder(&c.Folders[i], parentID, req) {
			return true
		}
	}
	return false
}

func insertRequestInFolder(f *FolderNode, parentID string, req SavedRequest) bool {
	if f.ID == parentID {
		req.Position = len(f.Requests)
		f.Requests = append(f.Requests, req)
		return true
	}
	for i := range f.Folders {
		if insertRequestInFolder(&f.Folders[i], parentID, req) {
			return true
		}
	}
	return false
}

// updateRequestInTree walks the collection tree looking for req.ID and
// replaces it in-place. Returns true if found.
func updateRequestInTree(c *Collection, req SavedRequest) bool {
	for i := range c.Requests {
		if c.Requests[i].ID == req.ID {
			c.Requests[i] = req
			return true
		}
	}
	for i := range c.Folders {
		if updateRequestInFolder(&c.Folders[i], req) {
			return true
		}
	}
	return false
}

func updateRequestInFolder(f *FolderNode, req SavedRequest) bool {
	for i := range f.Requests {
		if f.Requests[i].ID == req.ID {
			f.Requests[i] = req
			return true
		}
	}
	for i := range f.Folders {
		if updateRequestInFolder(&f.Folders[i], req) {
			return true
		}
	}
	return false
}

func (a *App) DeleteRequest(collectionID, requestID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, err := a.readCollection(collectionID)
	if err != nil {
		return err
	}
	if deleteRequestFromTree(c, requestID) {
		return a.writeCollection(c)
	}
	return fmt.Errorf("request %s not in collection %s", requestID, collectionID)
}

// deleteRequestFromTree walks the tree and removes the request by ID.
func deleteRequestFromTree(c *Collection, id string) bool {
	for i := range c.Requests {
		if c.Requests[i].ID == id {
			c.Requests = append(c.Requests[:i], c.Requests[i+1:]...)
			return true
		}
	}
	for i := range c.Folders {
		if deleteRequestFromFolder(&c.Folders[i], id) {
			return true
		}
	}
	return false
}

func deleteRequestFromFolder(f *FolderNode, id string) bool {
	for i := range f.Requests {
		if f.Requests[i].ID == id {
			f.Requests = append(f.Requests[:i], f.Requests[i+1:]...)
			return true
		}
	}
	for i := range f.Folders {
		if deleteRequestFromFolder(&f.Folders[i], id) {
			return true
		}
	}
	return false
}

// CreateFolder creates a new folder at root or inside a parent folder.
// parentFolderID == "" means create at the collection root.
func (a *App) CreateFolder(collectionID, parentFolderID, name string) (*FolderNode, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, err := a.readCollection(collectionID)
	if err != nil {
		return nil, err
	}
	f := FolderNode{
		ID:       newID(),
		Name:     name,
		Folders:  []FolderNode{},
		Requests: []SavedRequest{},
	}
	if parentFolderID == "" {
		f.Position = len(c.Folders)
		c.Folders = append(c.Folders, f)
	} else {
		if !insertFolderInTree(c, parentFolderID, f) {
			return nil, fmt.Errorf("parent folder %s not found in collection %s", parentFolderID, collectionID)
		}
	}
	return &f, a.writeCollection(c)
}

func insertFolderInTree(c *Collection, parentID string, f FolderNode) bool {
	for i := range c.Folders {
		if c.Folders[i].ID == parentID {
			f.Position = len(c.Folders[i].Folders)
			c.Folders[i].Folders = append(c.Folders[i].Folders, f)
			return true
		}
		if insertFolderInFolder(&c.Folders[i], parentID, f) {
			return true
		}
	}
	return false
}

func insertFolderInFolder(parent *FolderNode, parentID string, f FolderNode) bool {
	if parent.ID == parentID {
		f.Position = len(parent.Folders)
		parent.Folders = append(parent.Folders, f)
		return true
	}
	for i := range parent.Folders {
		if insertFolderInFolder(&parent.Folders[i], parentID, f) {
			return true
		}
	}
	return false
}

// DeleteFolder removes a folder and all its descendants (cascade).
func (a *App) DeleteFolder(collectionID, folderID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, err := a.readCollection(collectionID)
	if err != nil {
		return err
	}
	if deleteFolderFromTree(c, folderID) {
		return a.writeCollection(c)
	}
	return fmt.Errorf("folder %s not found in collection %s", folderID, collectionID)
}

func deleteFolderFromTree(c *Collection, id string) bool {
	for i := range c.Folders {
		if c.Folders[i].ID == id {
			c.Folders = append(c.Folders[:i], c.Folders[i+1:]...)
			return true
		}
		if deleteFolderFromSlice(&c.Folders[i], id) {
			return true
		}
	}
	return false
}

func deleteFolderFromSlice(parent *FolderNode, id string) bool {
	for i := range parent.Folders {
		if parent.Folders[i].ID == id {
			parent.Folders = append(parent.Folders[:i], parent.Folders[i+1:]...)
			return true
		}
		if deleteFolderFromSlice(&parent.Folders[i], id) {
			return true
		}
	}
	return false
}

// MoveRequest changes a request's position and optionally its parent.
// newParentID == "" keeps the current parent; the position is changed within it.
// newParentID != "" extracts the request and inserts it into that folder.
func (a *App) MoveRequest(collectionID, requestID, newParentID string, newPosition int) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, err := a.readCollection(collectionID)
	if err != nil {
		return err
	}
	if newParentID == "" {
		// Within-parent reorder — keep existing logic.
		if moveInSlice(&c.Requests, requestID, newPosition, savedReqID, savedReqSetPos) {
			return a.writeCollection(c)
		}
		for i := range c.Folders {
			if moveRequestInFolder(&c.Folders[i], requestID, newPosition) {
				return a.writeCollection(c)
			}
		}
		return fmt.Errorf("request %s not found in collection %s", requestID, collectionID)
	}
	// Reparent: extract from current location, insert into new parent.
	req, ok := extractRequestFromTree(c, requestID)
	if !ok {
		return fmt.Errorf("request %s not found in collection %s", requestID, collectionID)
	}
	target := findFolderNode(c, newParentID)
	if target == nil {
		return fmt.Errorf("parent folder %s not found", newParentID)
	}
	insertAt(&target.Requests, req, newPosition, savedReqSetPos)
	return a.writeCollection(c)
}

// moveInSlice reorders the element with the given id to position pos,
// renumbering all positions afterwards. Returns false if not found.
func moveInSlice[T any](slice *[]T, id string, pos int, idOf func(T) string, setPos func(*T, int)) bool {
	idx := -1
	for i, elem := range *slice {
		if idOf(elem) == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return false
	}
	elem := (*slice)[idx]
	*slice = append((*slice)[:idx], (*slice)[idx+1:]...)
	if pos < 0 {
		pos = 0
	}
	if pos > len(*slice) {
		pos = len(*slice)
	}
	*slice = append((*slice)[:pos], append([]T{elem}, (*slice)[pos:]...)...)
	for i := range *slice {
		setPos(&(*slice)[i], i)
	}
	return true
}

func moveRequestInFolder(f *FolderNode, id string, pos int) bool {
	if moveInSlice(&f.Requests, id, pos, savedReqID, savedReqSetPos) {
		return true
	}
	for i := range f.Folders {
		if moveRequestInFolder(&f.Folders[i], id, pos) {
			return true
		}
	}
	return false
}

func moveFolderInFolder(f *FolderNode, id string, pos int) bool {
	if moveInSlice(&f.Folders, id, pos, folderNodeID, folderNodeSetPos) {
		return true
	}
	for i := range f.Folders {
		if moveFolderInFolder(&f.Folders[i], id, pos) {
			return true
		}
	}
	return false
}

func extractRequestFromTree(c *Collection, id string) (SavedRequest, bool) {
	for i, r := range c.Requests {
		if r.ID == id {
			c.Requests = append(c.Requests[:i], c.Requests[i+1:]...)
			return r, true
		}
	}
	for i := range c.Folders {
		if r, ok := extractRequestFromFolder(&c.Folders[i], id); ok {
			return r, true
		}
	}
	return SavedRequest{}, false
}

func extractRequestFromFolder(f *FolderNode, id string) (SavedRequest, bool) {
	for i, r := range f.Requests {
		if r.ID == id {
			f.Requests = append(f.Requests[:i], f.Requests[i+1:]...)
			return r, true
		}
	}
	for i := range f.Folders {
		if r, ok := extractRequestFromFolder(&f.Folders[i], id); ok {
			return r, true
		}
	}
	return SavedRequest{}, false
}

// insertAt inserts elem at pos within slice, renumbering all positions afterwards.
func insertAt[T any](slice *[]T, elem T, pos int, setPos func(*T, int)) {
	if pos < 0 {
		pos = 0
	}
	if pos > len(*slice) {
		pos = len(*slice)
	}
	*slice = append((*slice)[:pos], append([]T{elem}, (*slice)[pos:]...)...)
	for i := range *slice {
		setPos(&(*slice)[i], i)
	}
}

// MoveFolder changes a folder's position and optionally its parent.
func (a *App) MoveFolder(collectionID, folderID, newParentID string, newPosition int) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, err := a.readCollection(collectionID)
	if err != nil {
		return err
	}
	if newParentID == "" {
		// Within-parent reorder.
		if moveInSlice(&c.Folders, folderID, newPosition, folderNodeID, folderNodeSetPos) {
			return a.writeCollection(c)
		}
		for i := range c.Folders {
			if moveFolderInFolder(&c.Folders[i], folderID, newPosition) {
				return a.writeCollection(c)
			}
		}
		return fmt.Errorf("folder %s not found in collection %s", folderID, collectionID)
	}
	// Reparent.
	if isOrContains(c, folderID, newParentID) {
		return fmt.Errorf("cannot move a folder into itself or a descendant")
	}
	f, ok := extractFolderFromTree(c, folderID)
	if !ok {
		return fmt.Errorf("folder %s not found in collection %s", folderID, collectionID)
	}
	target := findFolderNode(c, newParentID)
	if target == nil {
		return fmt.Errorf("parent folder %s not found", newParentID)
	}
	insertAt(&target.Folders, f, newPosition, folderNodeSetPos)
	return a.writeCollection(c)
}

func extractFolderFromTree(c *Collection, id string) (FolderNode, bool) {
	for i, f := range c.Folders {
		if f.ID == id {
			c.Folders = append(c.Folders[:i], c.Folders[i+1:]...)
			return f, true
		}
		if f2, ok := extractFolderFromFolderNode(&c.Folders[i], id); ok {
			return f2, true
		}
	}
	return FolderNode{}, false
}

func extractFolderFromFolderNode(f *FolderNode, id string) (FolderNode, bool) {
	for i, child := range f.Folders {
		if child.ID == id {
			f.Folders = append(f.Folders[:i], f.Folders[i+1:]...)
			return child, true
		}
		if f2, ok := extractFolderFromFolderNode(&f.Folders[i], id); ok {
			return f2, true
		}
	}
	return FolderNode{}, false
}

func findFolderNode(c *Collection, id string) *FolderNode {
	for i := range c.Folders {
		if f := findFolderNodeRec(&c.Folders[i], id); f != nil {
			return f
		}
	}
	return nil
}

func findFolderNodeRec(f *FolderNode, id string) *FolderNode {
	if f.ID == id {
		return f
	}
	for i := range f.Folders {
		if found := findFolderNodeRec(&f.Folders[i], id); found != nil {
			return found
		}
	}
	return nil
}

// isOrContains returns true if ancestorID is the same as childID or contains it.
func isOrContains(c *Collection, ancestorID, childID string) bool {
	if childID == "" {
		return false
	}
	if ancestorID == childID {
		return true
	}
	f := findFolderNode(c, childID)
	if f == nil {
		return false
	}
	return folderContains(f, ancestorID)
}

func folderContains(f *FolderNode, id string) bool {
	if f.ID == id {
		return true
	}
	for i := range f.Folders {
		if folderContains(&f.Folders[i], id) {
			return true
		}
	}
	return false
}

// CountFolderDescendants returns the total number of requests (recursively)
// inside a folder, for the confirm-delete prompt.
func (a *App) CountFolderDescendants(collectionID, folderID string) (int, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, err := a.readCollection(collectionID)
	if err != nil {
		return 0, err
	}
	n, found := countInTree(c, folderID)
	if !found {
		return 0, fmt.Errorf("folder %s not found in collection %s", folderID, collectionID)
	}
	return n, nil
}

func countInTree(c *Collection, folderID string) (int, bool) {
	for _, f := range c.Folders {
		if n, found := countInFolder(&f, folderID); found {
			return n, true
		}
	}
	return 0, false
}

func countInFolder(f *FolderNode, folderID string) (int, bool) {
	if f.ID == folderID {
		return countAll(f), true
	}
	for i := range f.Folders {
		if n, found := countInFolder(&f.Folders[i], folderID); found {
			return n, true
		}
	}
	return 0, false
}

func countAll(f *FolderNode) int {
	n := len(f.Requests)
	for i := range f.Folders {
		n += countAll(&f.Folders[i])
	}
	return n
}

// ---------- environments ----------

type Environment struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Variables map[string]string `json:"variables"`
}

// EnvironmentSet is the whole environments.json file: all environments plus
// which one is active ("" = none).
type EnvironmentSet struct {
	ActiveID     string        `json:"activeId"`
	Environments []Environment `json:"environments"`
}

func (a *App) environmentsPath() string { return filepath.Join(a.dataDir, "environments.json") }

func (a *App) readEnvironments() (*EnvironmentSet, error) {
	var set EnvironmentSet
	err := readJSONFile(a.environmentsPath(), &set)
	if errors.Is(err, os.ErrNotExist) {
		return &EnvironmentSet{Environments: []Environment{}}, nil
	}
	if err != nil {
		return nil, err
	}
	return &set, nil
}

func (a *App) GetEnvironments() (*EnvironmentSet, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.readEnvironments()
}

// SaveEnvironment creates the environment when ID is empty, updates it otherwise.
func (a *App) SaveEnvironment(env Environment) (*Environment, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	set, err := a.readEnvironments()
	if err != nil {
		return nil, err
	}
	if env.ID == "" {
		env.ID = newID()
		set.Environments = append(set.Environments, env)
	} else {
		found := false
		for i := range set.Environments {
			if set.Environments[i].ID == env.ID {
				set.Environments[i] = env
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("environment %s not found", env.ID)
		}
	}
	return &env, writeJSONFile(a.environmentsPath(), set)
}

func (a *App) DeleteEnvironment(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	set, err := a.readEnvironments()
	if err != nil {
		return err
	}
	for i := range set.Environments {
		if set.Environments[i].ID == id {
			set.Environments = append(set.Environments[:i], set.Environments[i+1:]...)
			if set.ActiveID == id {
				set.ActiveID = ""
			}
			return writeJSONFile(a.environmentsPath(), set)
		}
	}
	return fmt.Errorf("environment %s not found", id)
}

// SetActiveEnvironment activates the given environment; "" deactivates all.
func (a *App) SetActiveEnvironment(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	set, err := a.readEnvironments()
	if err != nil {
		return err
	}
	if id != "" {
		found := false
		for _, e := range set.Environments {
			if e.ID == id {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("environment %s not found", id)
		}
	}
	set.ActiveID = id
	return writeJSONFile(a.environmentsPath(), set)
}

// activeVariables returns the active environment's variables, or nil if none.
func (a *App) activeVariables() map[string]string {
	a.mu.Lock()
	defer a.mu.Unlock()
	set, err := a.readEnvironments()
	if err != nil || set.ActiveID == "" {
		return nil
	}
	for _, e := range set.Environments {
		if e.ID == set.ActiveID {
			return e.Variables
		}
	}
	return nil
}
