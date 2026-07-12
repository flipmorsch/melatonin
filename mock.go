package main

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type MockRoute struct {
	ID      string            `json:"id"`
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

type MockServer struct {
	ID              string      `json:"id"`
	Name            string      `json:"name"`
	Port            int         `json:"port"`
	ExposeOnNetwork bool        `json:"exposeOnNetwork"`
	Routes          []MockRoute `json:"routes"`
	Running         bool        `json:"running"` // run-state, persisted so app launch can restore it
}

type MockLogEntry struct {
	Time    string              `json:"time"`
	Method  string              `json:"method"`
	Path    string              `json:"path"`
	Headers map[string][]string `json:"headers"`
	Body    string              `json:"body"`
	Matched bool                `json:"matched"`
	Status  int                 `json:"status"` // what the mock answered (404 when unmatched)
}

const (
	mockLogCap     = 200      // ponytail: in-memory ring; persist the log if it ever matters
	mockLogBodyCap = 64 << 10 // per-entry body cap in the log
)

// runningMock is a started mock server: its live definition, listener, and
// in-memory request log.
type runningMock struct {
	id   string
	srv  *http.Server
	port int // actual listening port (differs from def.Port when that is 0)
	emit func(serverID string, entry MockLogEntry)

	mu  sync.Mutex // guards def and log
	def MockServer
	log []MockLogEntry
}

func (rm *runningMock) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, mockLogBodyCap))

	rm.mu.Lock()
	routes := rm.def.Routes
	rm.mu.Unlock()
	route := matchRoute(routes, r.Method, r.URL.Path)
	status := http.StatusNotFound
	if route != nil {
		if status = route.Status; status == 0 {
			status = http.StatusOK
		}
	}

	entry := MockLogEntry{
		Time:    time.Now().Format("15:04:05"),
		Method:  r.Method,
		Path:    r.URL.Path,
		Headers: r.Header,
		Body:    string(body),
		Matched: route != nil,
		Status:  status,
	}
	rm.mu.Lock()
	rm.log = append(rm.log, entry)
	if len(rm.log) > mockLogCap {
		rm.log = rm.log[len(rm.log)-mockLogCap:]
	}
	rm.mu.Unlock()
	if rm.emit != nil {
		rm.emit(rm.id, entry)
	}

	if route == nil {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(status)
		fmt.Fprintf(w, "melatonin: no route matched %s %s\n", r.Method, r.URL.Path)
		return
	}
	for k, v := range route.Headers {
		w.Header().Set(k, v)
	}
	w.WriteHeader(status)
	w.Write([]byte(route.Body))
}

// matchRoute returns the first route matching method+path. A path ending in
// "/*" matches any deeper path with that prefix.
func matchRoute(routes []MockRoute, method, path string) *MockRoute {
	for i := range routes {
		rt := &routes[i]
		if !strings.EqualFold(rt.Method, method) {
			continue
		}
		if rt.Path == path {
			return rt
		}
		if prefix, ok := strings.CutSuffix(rt.Path, "/*"); ok && strings.HasPrefix(path, prefix+"/") {
			return rt
		}
	}
	return nil
}

// ---------- persistence ----------

func (a *App) mocksDir() string { return filepath.Join(a.dataDir, "mocks") }

func (a *App) mockPath(id string) string { return filepath.Join(a.mocksDir(), id+".json") }

func (a *App) ListMockServers() ([]MockServer, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	entries, err := os.ReadDir(a.mocksDir())
	if errors.Is(err, os.ErrNotExist) {
		return []MockServer{}, nil
	}
	if err != nil {
		return nil, err
	}
	mocks := []MockServer{}
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		var m MockServer
		if err := readJSONFile(filepath.Join(a.mocksDir(), e.Name()), &m); err != nil {
			return nil, err
		}
		mocks = append(mocks, m)
	}
	sort.Slice(mocks, func(i, j int) bool { return mocks[i].Name < mocks[j].Name })
	return mocks, nil
}

// SaveMockServer upserts the whole definition (name, port, routes). A running
// instance picks up route edits live; a port change needs a restart.
func (a *App) SaveMockServer(m MockServer) (*MockServer, error) {
	// persist the actual run-state, not whatever a possibly-stale frontend object carries
	a.mockMu.Lock()
	_, m.Running = a.mocks[m.ID]
	a.mockMu.Unlock()

	a.mu.Lock()
	if m.ID == "" {
		m.ID = newID()
	}
	for i := range m.Routes {
		if m.Routes[i].ID == "" {
			m.Routes[i].ID = newID()
		}
	}
	err := writeJSONFile(a.mockPath(m.ID), &m)
	a.mu.Unlock()
	if err != nil {
		return nil, err
	}

	a.mockMu.Lock()
	if rm, ok := a.mocks[m.ID]; ok {
		rm.mu.Lock()
		rm.def = m
		rm.mu.Unlock()
	}
	a.mockMu.Unlock()
	return &m, nil
}

func (a *App) DeleteMockServer(id string) error {
	a.StopMockServer(id)
	a.mu.Lock()
	defer a.mu.Unlock()
	return os.Remove(a.mockPath(id))
}

// ---------- runtime ----------

func (a *App) StartMockServer(id string) error {
	if err := a.startMock(id); err != nil {
		return err
	}
	a.persistRunning(id, true)
	return nil
}

func (a *App) startMock(id string) error {
	a.mu.Lock()
	var def MockServer
	err := readJSONFile(a.mockPath(id), &def)
	a.mu.Unlock()
	if err != nil {
		return err
	}

	a.mockMu.Lock()
	defer a.mockMu.Unlock()
	if _, ok := a.mocks[id]; ok {
		return fmt.Errorf("%s is already running", def.Name)
	}
	host := "127.0.0.1"
	if def.ExposeOnNetwork {
		host = "0.0.0.0"
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, def.Port))
	if err != nil {
		return err
	}
	rm := &runningMock{
		id:   id,
		def:  def,
		port: ln.Addr().(*net.TCPAddr).Port,
		emit: a.emitMockLog,
	}
	rm.srv = &http.Server{Handler: rm}
	a.mocks[id] = rm
	go rm.srv.Serve(ln)
	return nil
}

// StopMockServer stops a running mock; stopping one that isn't running is a no-op.
func (a *App) StopMockServer(id string) error {
	a.mockMu.Lock()
	rm, ok := a.mocks[id]
	if ok {
		delete(a.mocks, id)
	}
	a.mockMu.Unlock()
	if !ok {
		return nil
	}
	err := rm.srv.Close()
	a.persistRunning(id, false)
	return err
}

// persistRunning records run-state in the def file so app launch can restore it.
// Best-effort: run-state is a convenience, never worth failing a start/stop over.
func (a *App) persistRunning(id string, running bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	var m MockServer
	if err := readJSONFile(a.mockPath(id), &m); err != nil || m.Running == running {
		return
	}
	m.Running = running
	_ = writeJSONFile(a.mockPath(id), &m)
}

// restoreMocks starts every mock that was running when the app last closed.
// Best-effort: a mock whose port is now taken just stays stopped; the intent
// is kept in its file, so the next launch tries again.
func (a *App) restoreMocks() {
	mocks, err := a.ListMockServers()
	if err != nil {
		return
	}
	for _, m := range mocks {
		if m.Running {
			if err := a.startMock(m.ID); err != nil {
				fmt.Printf("melatonin: could not restore mock %q: %v\n", m.Name, err)
			}
		}
	}
}

// RunningMockServers maps running mock IDs to their actual listening port.
func (a *App) RunningMockServers() map[string]int {
	a.mockMu.Lock()
	defer a.mockMu.Unlock()
	out := map[string]int{}
	for id, rm := range a.mocks {
		out[id] = rm.port
	}
	return out
}

// GetMockLog returns the request log of a running mock (empty if not running —
// the log is in-memory and dies with the instance).
func (a *App) GetMockLog(id string) ([]MockLogEntry, error) {
	a.mockMu.Lock()
	rm, ok := a.mocks[id]
	a.mockMu.Unlock()
	if !ok {
		return []MockLogEntry{}, nil
	}
	rm.mu.Lock()
	defer rm.mu.Unlock()
	return append([]MockLogEntry{}, rm.log...), nil
}

// ClearMockLog empties a running mock's request log; a no-op when not running.
func (a *App) ClearMockLog(id string) error {
	a.mockMu.Lock()
	rm, ok := a.mocks[id]
	a.mockMu.Unlock()
	if !ok {
		return nil
	}
	rm.mu.Lock()
	rm.log = nil
	rm.mu.Unlock()
	return nil
}

func (a *App) emitMockLog(serverID string, entry MockLogEntry) {
	if a.emitEvent != nil {
		a.emitEvent("mock:log", map[string]any{"serverId": serverID, "entry": entry})
	}
}
