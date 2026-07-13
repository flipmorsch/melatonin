# Position field for tree ordering

Requests and folders in a collection tree need user-controlled ordering (drag-and-drop
in the sidebar). The natural instinct is to reorder the array — send the full ordered list
of IDs and let the backend rearrange. We chose an explicit `Position int` field on each
`SavedRequest` and `FolderNode` instead.

The reorder-array approach couples the frontend to sending the entire sibling list on every
drag. With a Position field, the API call is `MoveRequest(colID, reqID, 3)` — minimal,
idempotent, and the Go side handles the shift. It also maps directly to dnd-kit's
sortable API, which works with position indices, not full-list replacement.

Zero default is backward-compatible: existing collection JSON without `"position"`
unmarshals to 0 for all items, and the read path sorts by current array index on first
load, then assigns sequential positions.

Scope is reorder-within-parent only. Reparenting (moving a request/folder into a different
parent) is deferred — the Move signatures can add an optional `newParentID` later without
breaking callers.

**Considered options:**

- **Array-reorder API** (`ReorderRequests(colID, parentID, []orderedIDs)`): simpler Go side,
  but the frontend must send the full list on every drag end, which is wasteful and prone to
  race conditions with auto-save.

- **Separate ordering layer** (a `map[string][]string` parent → ordered child IDs): two
  sources of truth to synchronize across creates and deletes. Over-engineered for a personal tool.

- **No Position field, just sort by array index on read**: Works until a user manually
  edits a collection file and reorders lines. The explicit field survives manual edits.
