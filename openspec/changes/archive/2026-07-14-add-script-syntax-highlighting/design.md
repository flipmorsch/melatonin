## Context

The `CodeEditor` component (ADR 0004) already wraps CodeMirror with JSON syntax highlighting via `@codemirror/lang-json`. The pre-request and post-response script editors reuse this component with `scriptApi` autocomplete enabled but no language parser — they render as plain monochrome text. The JSON response viewer and mock route editors are unaffected.

`@codemirror/lang-javascript` is the canonical CodeMirror extension for JavaScript/TypeScript syntax. It provides: Lezer-based token parsing, bracket matching, auto-indent, and keyword completion — all aligned with what a script editor needs.

The nocturnal design system (DESIGN.md) uses method hues (`--m-get`, `--m-post`, `--m-put`, `--m-patch`, `--m-delete`) as CSS custom properties. While DESIGN.md rule 2 states "method hues never mean anything except the HTTP method," this constrains semantic use (e.g., green must not mean "success"). Using them as arbitrary syntax color slots is consistent with how the existing JSON `nightHighlight` already maps `t.string` → `--m-get`, `t.number` → `--m-put`, `t.bool`/`t.null` → `--m-patch`.

## Goals / Non-Goals

**Goals:**
- JavaScript syntax highlighting (keywords, strings, numbers, comments, functions, regex) in pre-request and post-response script editors
- Bracket matching (highlight matching parentheses/brackets/braces)
- Auto-indent on Enter within JS blocks
- JS keyword autocomplete (free from `@codemirror/lang-javascript`, stacks with existing `scriptApi` autocomplete)
- Colors fit the nocturnal palette from DESIGN.md
- Zero impact on existing JSON editor behavior

**Non-Goals:**
- JSX or TypeScript syntax support (scripts run in Goja, pure JS only)
- Line numbers in script editors (separate feature)
- Lint/diagnostics for scripts (no standard JS linter exists for Goja API surface)
- Snippet/template completions beyond CodeMirror's JS defaults
- Changing JSON highlighting colors or behavior
- Backend changes of any kind

## Decisions

### Decision 1: Add `javascript` boolean prop (not refactor `json` to language enum)

**Options considered:**

| Option | Pros | Cons |
|--------|------|------|
| A) Add `javascript?: boolean` | Non-breaking, small diff, zero risk to existing callers | Two mutually-exclusive booleans on same component (ugly but harmless) |
| B) Replace with `language: 'json' \| 'javascript'` | Clean API, single compartment | Breaking — must update 5+ existing `json` callers (ResponseViewer, HistoryDetail, RouteCard, RequestView body) |

**Decision: Option A.** The `javascript` prop is added alongside the existing `json` prop. A new `Compartment` manages the JS language extension independently. Both props can theoretically be set simultaneously (harmless — the last-reconfigured compartment wins, and no caller would do this). The small API ugliness is acceptable for a component with 4 call sites total.

### Decision 2: Extend `nightHighlight` rather than create a separate JS highlight style

**Rationale:** JS and JSON share many token types (string, number, bool, null, punctuation, bracket). Defining these in one `HighlightStyle` avoids duplication and ensures consistent colors across all editor instances. JS-specific tags (keyword, comment, function, regex) are added to the same style — they simply never match in JSON mode because the JSON parser doesn't emit those tags.

### Decision 3: JS token → color mapping

| Lezer tag | Color | Token |
|-----------|-------|-------|
| `keyword`, `controlKeyword`, `operatorKeyword`, `moduleKeyword`, `self` | `--mantine-color-violet-2` | `const`, `let`, `if`, `return`, `this`, `import` |
| `string`, `special(string)` | `--m-get` (#5bd6a2) | String literals, template strings |
| `number` | `--m-put` (#eec468) | Numeric literals |
| `bool`, `null` | `--m-patch` (#f0995f) | `true`, `false`, `null`, `undefined` |
| `function(variableName)` | `--m-post` (#64aef2) | Function calls and definitions |
| `comment` | `--mantine-color-dark-2` + italic | `// line`, `/* block */` |
| `regexp` | `--m-delete` (#f0717e) | `/pattern/flags` |
| `punctuation`, `separator`, `bracket`, `operator` | `--mantine-color-dark-1` | `;`, `,`, `()`, `{}`, `[]`, `+`, `=`, etc. |
| `propertyName` | `--mantine-color-violet-2` | Object property access (`response.body`) |
| `typeName` | `--m-post` (#64aef2) | Class/constructor names |

**Rationale:** Keywords get brand violet (primary visual weight), strings retain the existing JSON green, numbers keep amber, comments fade to quiet text with italic for visual distinction, regex gets red (high contrast — regex literals are error-prone and deserve attention), function calls get blue (clearly distinct from violet keywords). Property names share violet-2 with keywords for visual coherence across JS and JSON contexts.

### Decision 4: Plain JavaScript mode, no JSX or TypeScript

```ts
import {javascript} from '@codemirror/lang-javascript';
// ...
javascript() // defaults: typescript=false, jsx=false
```

Goja is a pure ES5.1+ runtime with no JSX or TypeScript support. Enabling those would highlight syntax that fails at runtime. The default `javascript()` config (no options) targets plain JS.

### Decision 5: Separate Compartment for JS language

Following the existing pattern with `jsonConf`, a new `jsConf` Compartment manages the JS extension. The reconfigure effect mirrors the JSON one:

```tsx
useEffect(() => {
    viewRef.current?.dispatch({effects: jsConf.current.reconfigure(
        javascriptMode ? javascript() : []
    )});
}, [javascriptMode]);
```

The effect runs after the view is created and whenever the `javascript` prop changes. In practice the prop never changes for a given editor instance — it's set once at mount time.

## Risks / Trade-offs

- **Bundle size increase**: `@codemirror/lang-javascript` adds ~15KB gzipped (parser + language support). Acceptable for a desktop app with no network transfer.
- **Token specificity conflicts**: `t.propertyName` is violet-2 for both JSON keys and JS property access. If future design work wants different colors, this would require splitting into two HighlightStyles → Low risk, colors are already harmonious.
- **JS parser accuracy for Goja-specific globals**: `request`, `response`, `env`, `console` are injected globals unknown to the JS parser. They'll highlight as plain variables (dark-0), which is correct — they're runtime identifiers, not keywords → No action needed.
