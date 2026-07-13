# Request tabs: ordered useReducer state, per-tab editor sessions

v1.3 adds request tabs — multiple independent editing sessions open simultaneously, preserved across tab switches. This replaces the current single-request editor where selecting a new request discards the previous one.

## Decision

**Each tab is a complete independent editor session** — its own method, URL, headers, body, scripts, accordion state, and response. State is managed as an **ordered array of tab-state objects** via `useReducer` at the App level (no external state library). The active tab renders into the existing RequestView area; background tabs retain in-memory state but unmount their DOM. A custom tab strip using Mantine Scroller handles overflow for unlimited tabs.

## Considered options

- **Mantine Tabs**: purpose-built for a fixed, known set of values. Dynamic open/close tabs with independent content panels don't map cleanly. No native close-button or drag-reorder support.
- **Zustand/Redux**: the tab state has exactly one consumer tree (App → TabBar + RequestView). Zero cross-cutting concerns. Adding a dependency for ~60 lines of reducer logic violates YAGNI.
- **Map<reqId, TabState>**: scratch tabs have no request ID, so a Map keyed by reqId requires a separate ordering mechanism. An ordered array is both the data structure and the visual order — simpler.
- **Shared response pane**: would prevent comparing responses across tabs and introduce coordination complexity. Per-tab response is the expected UX for any multi-tab API client.

## Consequences

- `RequestView` refactors from ~20 individual `useState` hooks to receiving a single tab state object from the reducer.
- Auto-save flushes the departing tab on switch (same `flushPending` pattern, scoped per-tab).
- `SendRequest` is stateless per-tab — no coordination needed between concurrent sends. Cookie jar and session variables are shared (correct — matches browser/Insomnia behavior).
- Sidebar request selection becomes: check if already open → focus tab; otherwise → flush pending → open new tab.
- History replay opens a new tab (never replaces active — preserves in-progress edits).
- The scratch editor becomes the always-present, unclosable leftmost "Scratch Tab."
