## Why

Pre-request and post-response script editors currently render plain monochrome text — no keyword coloring, no string/number distinction, no comment fade. The CodeEditor component already supports JSON syntax highlighting via `@codemirror/lang-json`; JavaScript highlighting uses the same CodeMirror extension architecture but was deferred while the script feature was being built. Scripts are now functional and in daily use — the lack of highlighting is the top visual friction in the script editing experience.

## What Changes

- Install `@codemirror/lang-javascript` CodeMirror extension package (frontend)
- Extend `CodeEditor` component with a `javascript` prop that installs the JS language parser, bracket matching, auto-indent, and keyword autocomplete
- Extend the `nightHighlight` token colors to cover JavaScript-specific tags (keywords, comments, functions, regex, template strings) using the existing nocturnal palette
- Pass `javascript` prop from `RequestView` to both pre-request and post-response `CodeEditor` instances
- JSON response/viewer editors remain unchanged — the `json` prop continues to work independently

## Capabilities

### New Capabilities
- `script-syntax-highlighting`: JavaScript syntax coloring, bracket matching, and auto-indent in pre-request and post-response script editors

### Modified Capabilities
<!-- None — this is a new capability with no impact on existing spec-level behavior -->

## Impact

- `frontend/package.json` — new dependency `@codemirror/lang-javascript` (^6.2.x)
- `frontend/src/components/CodeEditor.tsx` — new `javascript` prop, new compartment, extended `nightHighlight`, JS language extension
- `frontend/src/features/request/RequestView.tsx` — pass `javascript` to two CodeEditor instances (pre-request, post-response)
- No backend changes, no storage changes, no API changes
