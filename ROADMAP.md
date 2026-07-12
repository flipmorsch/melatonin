# Roadmap — melatonin

**Status: v1 scope complete (2026-07-11).** Everything under "Future" remains deferred.

## v1.1 — Daily-drive (current)

Goal: melatonin replaces Insomnia as the daily driver. No new features up front —
real use decides what gets built.

- Install: `make install` → binary in `~/.local/bin`, launcher entry (done 2026-07-11)
- Import from Insomnia/Postman: **skipped** — few enough requests to retype by hand (YAGNI)
- Request history: every send recorded (as typed, failures included), sidebar History
  section, click to reload into the scratch editor (done 2026-07-11)
- Send Options: per-request timeout override, don't-follow-redirects, skip-TLS-verify —
  v1-spec'd but found missing when cross-checking roadmap vs code (done 2026-07-11)
- Silent in-memory cookie jar, so session/cookie-auth APIs work (done 2026-07-11)
- Auto-save: edits to a saved request persist automatically (debounced, flushed on
  switch/unmount); Save button removed. Fixes silent edit loss when clicking another
  request in the sidebar (done 2026-07-11)
- Mock run-state restored on launch: a mock running when the app closes comes back
  when it opens — first friction actually observed in the field, via history.json
  (done 2026-07-12)
- Single-instance lock: a second launch focuses the existing window and exits —
  two instances shared the JSON files with in-process locking only, so auto-save
  and mock restore could clobber each other (done 2026-07-12)
- Mock view revamp: auto-save (Save button removed, parity with the request editor),
  copyable base URL while running, roomier route editor, request log with answered
  status + count + clear (done 2026-07-12)
- History detail view: clicking an entry shows a read-only record (sent request,
  resolved URL, full response) instead of hijacking the scratch editor; "Open in
  editor" does the old replay (done 2026-07-12)
- Friction captured in FRICTION.md as it happens; triaged here after ~a week of use
- Done when: launched from the OS launcher daily for a week, friction log triaged

## v1 — Foundation

- Name: **melatonin** (binary `melatonin`, data dir `~/.config/melatonin/`)

- Stack: Wails (Go backend) + React/TypeScript frontend, Linux-first, personal tool
- Storage: plain JSON files in a single data directory (one file per Collection, one for Environments, one per Mock Server)
- Secrets: stored in plaintext (personal machine); data dir created with `0700` permissions. If the data dir is ever git-inited, environments must be gitignored.

## v1 — Request Client

- Compose: method, URL, query params, headers, body (raw text / JSON / form-urlencoded)
- Send request; inspect response: status, headers, body (pretty-printed JSON), size, timing
- Collections: save requests into folders, sidebar tree
- Environments: `{{variable}}` substitution with per-environment values (dev/staging/prod)
- Auth helpers: Bearer token, Basic auth
- UI: three-pane layout (sidebar | request editor | response viewer), no tabs — sidebar is the navigation
- Environments are global; one active at a time, switched in the top bar
- Send defaults: 30s timeout (per-request override), follow redirects (per-request toggle off), TLS verify on (per-request skip toggle), pretty-print responses up to ~5 MB then raw, respect `HTTP_PROXY`/`HTTPS_PROXY` — the three per-request toggles shipped late, in v1.1

## v1 — Mock Server

- Mock Server = name + port + list of routes (method + path → response)
- Routes return static responses: status code, headers, body
- Start/stop from the UI; multiple mock servers may run simultaneously on different ports
- Request log: incoming requests shown in UI (method, path, headers, body)
- Unmatched requests get a 404 with a "no route matched" body
- Path matching is exact (plus possibly a trailing wildcard)
- Binds to `127.0.0.1` by default; per-server "expose on network" toggle switches to `0.0.0.0`

## Future (explicitly deferred from v1)

- Pre-request / post-response scripting
- Cookie jar UI (the client keeps a silent in-memory jar since v1.1; managing/viewing it is future work)
- Save response body to file (dropped from the v1 send-defaults line — copy-to-clipboard covers it until a >5 MB body shows up)
- GraphQL, gRPC, WebSocket, SSE support
- Code generation ("copy as curl", etc.)
- Import from Postman / Insomnia

- OS-keyring storage for variables marked "secret"
- Syntax highlighting in the response viewer (design system exists; needs a highlighter)
- Light theme: **not planned** — dark-only is the brand (see DESIGN.md)

### Mock Server (deferred)

- Dynamic/templated responses (echoing request data)
- Conditional responses (match on headers/body, not just method+path)
- Latency / error simulation
- Path parameters (`/users/:id`)
- Record & replay / proxy mode
- OpenAPI import to auto-generate routes
