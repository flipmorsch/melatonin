# 4. CodeMirror 6 as the embedded code editor

Date: 2026-07-11

## Status

Accepted

## Context

JSON quality-of-life asks — editable syntax highlighting, auto-closing
brackets/quotes, `{{variable}}` autocomplete, inline parse errors — are
collectively the definition of a code editor component. Hand-rolling them
onto a `<textarea>` (overlay highlighting, keydown handlers) is fragile in
known ways: scroll sync, undo-stack corruption from programmatic inserts,
IME handling, and a completion dropdown is a project of its own. Monaco
delivers all of it but is ~2 MB with worker processes — wrong weight for a
lean local webview app.

## Decision

Adopt CodeMirror 6 (raw `@codemirror/*` packages, no React wrapper
dependency) behind one small component of ours, `components/CodeEditor.tsx`.
Each ask maps to a stock extension: `lang-json` (highlighting + parse
errors), `closeBrackets` (auto-close), `autocompletion` with one custom
source for `{{variable}}` names. The response viewer reuses the same engine
read-only, which keeps colors identical and gets code folding and
viewport-based rendering of large bodies for free.

JSON linting is gated on a first-character heuristic (`{`, `[`, `"`) so
raw-text and form-urlencoded bodies never show error squiggles.

## Consequences

- All code-editing surfaces (request body, mock route bodies, response
  viewer) must go through `CodeEditor` — CodeMirror's API should not leak
  into feature components, so a future engine swap stays one-file.
- We deliberately do NOT auto-inject `Content-Type: application/json` when
  the body parses as JSON: ADR 0003 established that what you see is what
  is sent, and silent header injection breaks testing of servers' handling
  of missing/wrong content types.
- The bundle grows ~130 KB gzipped; acceptable for a local desktop app
  loaded from disk.
