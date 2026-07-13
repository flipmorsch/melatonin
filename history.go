package main

import (
	"errors"
	"os"
	"path/filepath"
	"time"
)

const (
	historyMax     = 200      // ponytail: capped array rewritten in one JSON file; JSONL if this ever matters
	historyBodyCap = 64 << 10 // stored response bodies are clipped so history.json stays small
)

// HistoryEntry is one recorded send: the request as typed (variables
// unresolved, so env secrets stay out of the file) plus the outcome.
type HistoryEntry struct {
	ID              string        `json:"id"`
	Time            string        `json:"time"` // RFC3339
	Request         RequestInput  `json:"request"`
	Response        *ResponseData `json:"response"` // nil when the send failed
	Error           string        `json:"error"`
	HadPreScript    bool          `json:"hadPreScript"`    // true if a pre-request script ran (even if empty)
	HadPostScript   bool          `json:"hadPostScript"`   // true if a post-response script ran
	PreScriptError  string        `json:"preScriptError"`  // non-empty when the pre-request script threw
	PostScriptError string        `json:"postScriptError"` // non-empty when the post-response script threw
}

func (a *App) historyPath() string { return filepath.Join(a.dataDir, "history.json") }

func (a *App) readHistory() ([]HistoryEntry, error) {
	var h []HistoryEntry
	err := readJSONFile(a.historyPath(), &h)
	if errors.Is(err, os.ErrNotExist) {
		return []HistoryEntry{}, nil
	}
	return h, err
}

// GetHistory returns recorded sends, newest first.
func (a *App) GetHistory() ([]HistoryEntry, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.readHistory()
}

func (a *App) ClearHistory() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	err := os.Remove(a.historyPath())
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

// recordHistory prepends one entry, enforcing the caps. Best-effort: a
// failed history write must never fail the send itself.
// sendErr is the HTTP-level error (connection refused, timeout, etc.);
// preErr/postErr are script-level errors.
func (a *App) recordHistory(in RequestInput, resp *ResponseData, sendErr error, hadPre, hadPost bool, preErr, postErr string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	entry := HistoryEntry{
		ID:              newID(),
		Time:            time.Now().Format(time.RFC3339),
		Request:         in,
		HadPreScript:    hadPre,
		HadPostScript:   hadPost,
		PreScriptError:  preErr,
		PostScriptError: postErr,
	}
	if sendErr != nil {
		entry.Error = sendErr.Error()
	}
	if resp != nil {
		r := *resp
		if len(r.Body) > historyBodyCap {
			r.Body = r.Body[:historyBodyCap]
			r.Truncated = true
		}
		entry.Response = &r
	}
	h, err := a.readHistory()
	if err != nil {
		h = nil // an unreadable history file is not worth losing the new entry over
	}
	h = append([]HistoryEntry{entry}, h...)
	if len(h) > historyMax {
		h = h[:historyMax]
	}
	_ = writeJSONFile(a.historyPath(), h)
}
