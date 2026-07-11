package main

import (
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

type SavedRequest struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Folder  string            `json:"folder"` // single-level grouping inside the collection; "" = root
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Params  map[string]string `json:"params"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
	Auth    Auth              `json:"auth"`
}

type Collection struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Requests []SavedRequest `json:"requests"`
}

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
	var c Collection
	if err := readJSONFile(a.collectionPath(id), &c); err != nil {
		return nil, err
	}
	return &c, nil
}

func (a *App) writeCollection(c *Collection) error {
	return writeJSONFile(a.collectionPath(c.ID), c)
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
	c := &Collection{ID: newID(), Name: name, Requests: []SavedRequest{}}
	return c, a.writeCollection(c)
}

func (a *App) DeleteCollection(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	return os.Remove(a.collectionPath(id))
}

// SaveRequest creates the request when ID is empty, updates it otherwise.
func (a *App) SaveRequest(collectionID string, req SavedRequest) (*SavedRequest, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, err := a.readCollection(collectionID)
	if err != nil {
		return nil, err
	}
	if req.ID == "" {
		req.ID = newID()
		c.Requests = append(c.Requests, req)
	} else {
		found := false
		for i := range c.Requests {
			if c.Requests[i].ID == req.ID {
				c.Requests[i] = req
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("request %s not in collection %s", req.ID, collectionID)
		}
	}
	return &req, a.writeCollection(c)
}

func (a *App) DeleteRequest(collectionID, requestID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, err := a.readCollection(collectionID)
	if err != nil {
		return err
	}
	for i := range c.Requests {
		if c.Requests[i].ID == requestID {
			c.Requests = append(c.Requests[:i], c.Requests[i+1:]...)
			return a.writeCollection(c)
		}
	}
	return fmt.Errorf("request %s not in collection %s", requestID, collectionID)
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
