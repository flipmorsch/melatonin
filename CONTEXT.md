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
A saved, named HTTP request definition: method, URL, query params, headers, body, auth, and Send Options. Query params and headers are ordered lists, and the same name may appear more than once (as HTTP allows). Lives inside a Collection — either at root or nested inside a Folder.

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

### Resolved URL
The URL after `{{variable}}` substitution against the active Environment. Distinct from the URL as stored on the Request (which may contain placeholders). Used in the history detail view to show what was actually sent.

### History Entry
One recorded send from the Request Client: the request as typed plus its outcome (response or failure). History is client-side — not to be confused with the Request Log, which is what a Mock Server *received*.

### Request Log
The list of incoming requests a running Mock Server has received, viewable in the UI. Mock-side; the client-side counterpart is the History Entry.

### Matched Request
A Request Log entry that matched a Route. The Mock Server responded with the route's configured status, headers, and body.

### Unmatched Request
A Request Log entry that matched no Route. The Mock Server responded with a 404 and a "no route matched" body.

## Product principles

- **Local-first**: no accounts, no cloud sync, no subscriptions. Everything lives on the user's machine.
