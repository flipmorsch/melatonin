# 3. Ordered KV lists for request params and headers

Date: 2026-07-11

## Status

Accepted

## Context

Request query params and headers were stored as `map[string]string`
(`Record<string, string>` in the frontend). A map cannot hold two entries
with the same name — but HTTP allows both repeated query params
(`tag=a&tag=b`) and repeated headers — and it has no stable order. This was
invisible behind the freeform textarea UI, but a row-based editor makes
ordering and duplicates user-visible, so the model had to tell the truth.

## Decision

`params` and `headers` on requests are ordered lists of `{key, value}`
pairs. The list type carries a tolerant `UnmarshalJSON` that also accepts
the legacy map shape, so collection files written before this change keep
loading; they upgrade to the list shape on next save.

At send time, rows are appended in visible order: the URL's query string is
sent as typed with param rows escaped and appended after it (no re-encode,
no sorting, no override — a key present in both URL and rows is sent twice),
and header rows use `Header.Add`. The auth helper still applies last and
wins over a manually typed `Authorization` header.

## Consequences

- The dual-shape `UnmarshalJSON` looks odd without this context; it exists
  only for pre-0003 collection files and could be dropped in a future major
  cleanup.
- Environment variables keep the map model deliberately — variable names are
  unique and unordered by nature. Mock route response headers also keep the
  map for now; if `Set-Cookie`-style duplicates are ever needed there, they
  should adopt this same list type.
