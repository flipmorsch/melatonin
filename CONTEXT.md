# CONTEXT

Ubiquitous language for **melatonin** — a local-first, subscription-free API tool (request client + mock server). Glossary only — no implementation details.

## Terms

### melatonin
The product itself: what you take to fix Insomnia. A desktop app combining the Request Client and the Mock Server.

### Request Client
The Insomnia-like half of the tool: where a user composes an HTTP request (method, URL, headers, body), sends it, and inspects the response.

### Mock Server
The other half: a locally-running HTTP server that answers requests with user-defined responses. Exists so APIs can be faked/tested without any cloud service.

### Request
A saved, named HTTP request definition: method, URL, query params, headers, body, and auth. Query params and headers are ordered lists, and the same name may appear more than once (as HTTP allows). Lives inside a Collection.

### Auth Helper
A structured shortcut on a Request for common authentication schemes (bearer token, basic credentials). Not a header itself: at send time it produces the `Authorization` header, overriding any manually-typed one.

### Collection
A named folder tree of Requests, shown in the sidebar.

### Folder
An optional single-level grouping of Requests inside a Collection. Folders are derived from the Requests that name them — an empty Folder ceases to exist.

### Environment
A named set of variables (e.g. dev/staging/prod). Environments are global (not scoped to a Collection); exactly one is active at a time. Requests reference variables as `{{name}}`; the active Environment supplies the values at send time.

### Route
A rule inside a Mock Server: method + path → the response to return (status, headers, body).

### History Entry
One recorded send from the Request Client: the request as typed plus its outcome (response or failure). History is client-side — not to be confused with the Request Log, which is what a Mock Server *received*.

### Request Log
The list of incoming requests a running Mock Server has received, viewable in the UI. Mock-side; the client-side counterpart is the History Entry.

## Product principles

- **Local-first**: no accounts, no cloud sync, no subscriptions. Everything lives on the user's machine.
