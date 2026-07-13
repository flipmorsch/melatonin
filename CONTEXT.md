# CONTEXT

Ubiquitous language for **melatonin** — a local-first, subscription-free API tool (request client + mock server). Glossary only — no implementation details.

## Terms

### melatonin
The product itself: what you take to fix Insomnia. A desktop app combining the Request Client and the Mock Server.

### Request Client
The Insomnia-like half of the tool: where a user composes an HTTP request (method, URL, headers, body), sends it, and inspects the response.

### Mock Server
A user-defined HTTP server that answers requests with configured Routes. Exists so APIs can be faked/tested without any cloud service. A Mock Server has three states: **defined** (persisted on disk but not listening), **running** (listening on its port, matching routes, logging requests), and **stopped** (not listening, but the intent to auto-start on next app launch is persisted).

### Request
A saved, named HTTP request definition: method, URL, query params, headers, body, auth, Send Options, and optionally a pre-request and/or post-response script. Query params and headers are ordered lists, and the same name may appear more than once (as HTTP allows). Lives inside a Collection — either at root or nested inside a Folder.

### Auth Helper
A structured shortcut on a Request for common authentication schemes (bearer token, basic credentials). Not a header itself: at send time it produces the `Authorization` header, overriding any manually-typed one.

### Cookie Jar
An in-memory store that collects `Set-Cookie` headers from responses and attaches `Cookie` headers to subsequent requests matching the same domain. Lives for the duration of the app session — not persisted to disk. Invisible to the user (no UI), but affects send behavior: two requests to the same host share cookies automatically.

### Collection
A named container holding an ordered tree of Folders and Requests, shown in the sidebar. Root-level Requests and Folders are siblings; each Folder may contain child Requests and child Folders. Order is user-controlled and persisted.

### Folder
A named grouping within a Collection, created explicitly by the user. A Folder may contain Requests and child Folders, forming a nested tree. Order is user-controlled and persisted. Deleting a Folder cascades: all descendant Folders and Requests are deleted (with confirmation showing the count).

**Position**:
The ordinal location of a Request or Folder within its parent's ordered list. Zero-based. When an item is created it gets the last position; reordering shifts siblings to close the gap. Move semantics (to a different parent) are not yet supported.

### Send Options
Attached to each Request. Per-Request overrides of how a send behaves: how long to wait, whether redirects are followed, whether TLS certificates are verified. Unset options mean the defaults apply (30s timeout, follow redirects, verify TLS).

### Environment
A named set of variables (e.g. dev/staging/prod). Environments are global (not scoped to a Collection); at most one is active at a time (zero = variables left unresolved). Requests reference variables as `{{name}}`; the active Environment supplies the values at send time.

### Route
A rule inside a Mock Server: method + path → the response to return (status, headers, body).

### Pre-request Script
A JavaScript snippet attached to a Request that runs before the HTTP call. Runs in an embedded Goja runtime (Go, no browser APIs). The script receives the raw `request` object (with `{{variable}}` templates still unresolved) and can mutate it — set headers, rewrite the body, change the method. Variable substitution happens *after* the script, so the script can inject new `{{var}}` references. If the script throws, the send is aborted and the error is shown in the UI.

### Post-response Script
A JavaScript snippet attached to a Request that runs after the HTTP call completes. Runs in the same Goja runtime as the pre-request script. The script receives the `request` and `response` objects and can: read/inspect the response, mutate `response.body`/`response.status`/`response.headers` (the mutated version is what the UI displays and what history records), and call `env.set(name, value)` to store extracted values. If the script throws, the response is still shown but the error appears in the script log.

### Script API
The set of globals available to pre-request and post-response scripts:
- **`request`** — mutable mirror of RequestInput (method, url, params, headers, body, auth, options). Pre-request: mutate to change what gets sent. Post-response: read-only snapshot of what was sent.
- **`response`** — post-response only. Mutable: `status`, `statusText`, `headers` (map of `string → string[]`), `body` (string). Pre-request: `undefined`.
- **`env.get(name)`** — reads a variable from the active Environment. Returns `undefined` for unknown names.
- **`env.set(name, value)`** — writes to the ephemeral session variable store (in-memory, survives across sends within the app session, never persisted to disk). Variables set here are visible to `{{name}}` substitution in subsequent sends.
- **`console.log(...)` / `console.warn(...)` / `console.error(...)`** — writes to the script log shown inline below the script editor.
- **`fetch(url, options?)`** — async HTTP request via a thin Go `net/http` wrapper. Returns a Promise resolving to `{ status, statusText, headers, text(), json() }`. Shares the request's timeout budget.

### Session Variable
A variable set at runtime by a script via `env.set(name, value)`. Lives in memory for the duration of the app session — visible to `{{name}}` substitution, but never written to disk. Separate from Environment variables, which are user-defined and persisted. When a variable name exists in both, the session variable takes precedence.

### Script Log
The output of `console.log`/`console.warn`/`console.error` calls from the last script run, displayed inline below the script editor. Errors from a script throw also appear here. Pre-request and post-response scripts each have their own log.

### Resolved URL
The URL after `{{variable}}` substitution against the active Environment. Distinct from the URL as stored on the Request (which may contain placeholders). Used in the history detail view to show what was actually sent.

### History Entry
One recorded send from the Request Client: the request as typed plus its outcome (response or failure). Includes `hadPreScript`/`hadPostScript` booleans and any script error messages so the user can tell whether a script ran and whether it failed. History is client-side — not to be confused with the Request Log, which is what a Mock Server *received*.

### Request Log
The list of incoming requests a running Mock Server has received, viewable in the UI. Mock-side; the client-side counterpart is the History Entry.

### Matched Request
A Request Log entry that matched a Route. The Mock Server responded with the route's configured status, headers, and body.

### Unmatched Request
A Request Log entry that matched no Route. The Mock Server responded with a 404 and a "no route matched" body.

## Product principles

- **Local-first**: no accounts, no cloud sync, no subscriptions. Everything lives on the user's machine.
