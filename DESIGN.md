# melatonin design system

**Direction: nocturnal.** melatonin is the hormone of darkness — the app puts
Insomnia to sleep. Every visual choice derives from that: violet-cast ink
surfaces (night sky, never neutral gray-black), moonlight text, crisp control
geometry (a tight 3px default radius suits the dense tool chrome; the softer
8px `lg` radius is reserved for Papers such as the response pane — the
roundness lives in Nunito's letterforms, not in the control corners), and one
signature element: the **dusk horizon**, a 1px gradient (indigo → violet →
amber) under the top bar.

Dark-only by design. A light theme is not planned; it would be a different brand.

**Base: Mantine** (`@mantine/core`, ADR 0002). Sources of truth:

- `frontend/src/theme.ts` — the tokens, expressed as a Mantine theme
- `frontend/src/app.css` — only the brand signatures Mantine can't express
- This file — intent and rules

New UI reaches for a Mantine component first, custom CSS second.

## Color

The night inks live in the Mantine `dark` tuple (see `theme.ts`):

| Slot | Value | Use |
|---|---|---|
| `dark.7` | `#0c0e16` | App background |
| `dark.6` | `#12141f` | Recessed: inputs, wells, response pane, cards |
| `dark.5` | `#191c2a` | Raised / hover surfaces |
| `dark.4` | `#262a3b` | Borders |
| `dark.0 / .1 / .2` | `#eceaf4 / #a09dbb / #8b88a3` | Text: primary / secondary / quiet |
| `dark.3` | `#625f7d` | Decoration only — **fails 4.5:1, never body/label text** |
| `violet.4` | `#8266f0` | Primary actions (primaryShade dark) |
| `violet.2` | `#b3a6fa`-ish | Wordmark, emphasis |
| `teal.4` / `red.4` | Mantine | Success/running · errors/destructive |

**Method hues** (CSS vars in `app.css` — information, not decoration):
GET `#5bd6a2` · POST `#64aef2` · PUT `#eec468` · PATCH `#f0995f` ·
DELETE `#f0717e` · HEAD/OPTIONS `#a09dbb`.

## Typography

- UI: **Nunito** variable 400–700 (bundled woff2) — its soft roundness *is* the brand voice.
- Data (URLs, headers, bodies, badges, logs): theme `fontFamilyMonospace`;
  apply with `ff="monospace"` or the `.mono-input` class on inputs.
- Scale: theme `fontSizes` — xs 12 / sm 13.5 / md 15 / lg 17 / xl 20. No display sizes; this is a tool.

## Structure

Feature folders, one component per file (ADR 0002):

```
frontend/src/
├── theme.ts             tokens as Mantine theme
├── app.css              brand signatures only
├── lib/                 pure helpers (kv parsing, grouping, pretty-print)
├── hooks/               data access per domain (useCollections, useEnvironments, useMocks)
├── components/          shared primitives (Brand, MethodBadge, RunDot,
│                        EmptyState, SectionLabel, ConfirmDelete, KVEditor, Chevron,
│                        CodeEditor — the only file touching CodeMirror, ADR 0004)
└── features/
    ├── sidebar/         Sidebar, CollectionsSection, MocksSection, HistorySection, SidebarRow
    ├── request/         RequestView, ResponseViewer
    ├── environments/    EnvironmentsView
    ├── history/         HistoryDetail
    └── mocks/           MockView, RouteCard, RequestLog
```

## Motion & accessibility

- 130ms ease on hover/focus. One ambient animation: the night-light pulse on
  a running mock's dot; `prefers-reduced-motion` disables it.
- Mantine's `:focus-visible` rings stay on everywhere.
- All text ≥ 4.5:1 on its surface, including placeholders (overridden in `app.css`).
- Destructive actions use `ConfirmDelete` (two-click, 3s disarm) — never modals.

## Rules

1. Raw values live in `theme.ts` or the `:root` block of `app.css` — nowhere else.
2. Method hues never mean anything except the HTTP method (the name is always printed too).
3. One signature (the dusk horizon + crescent). No other gradients or glows,
   except the run-state night light, which is information.
4. Empty and error states direct the user, never just describe absence.
5. `dark.3` is decoration-only; the quiet-text tier is `dark.2`.
