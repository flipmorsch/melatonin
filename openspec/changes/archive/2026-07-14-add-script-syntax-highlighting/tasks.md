## 1. Add dependency

- [x] 1.1 Install `@codemirror/lang-javascript` in frontend (`npm install @codemirror/lang-javascript`)
- [x] 1.2 Verify package.json and package-lock.json updated, version compatible with existing CodeMirror packages

## 2. Extend CodeEditor with JavaScript mode

- [x] 2.1 Import `javascript` from `@codemirror/lang-javascript` in `CodeEditor.tsx`
- [x] 2.2 Add `javascript?: boolean` to the `Props` interface
- [x] 2.3 Add `jsConf` Compartment ref (mirrors existing `jsonConf` pattern)
- [x] 2.4 Add JS-specific tokens to `nightHighlight` HighlightStyle: `keyword`/`controlKeyword`/`operatorKeyword`/`moduleKeyword`/`self` (violet-2), `comment` (dark-2 italic), `function(variableName)` (m-post), `regexp` (m-delete), `escape` (m-patch), `typeName` (m-post), `special(string)` (m-get)
- [x] 2.5 Add `useEffect` to reconfigure `jsConf` compartment when `javascript` prop changes (call `javascript()` or empty array)
- [x] 2.6 Initialize `jsConf` with empty array in the EditorState create-effect
- [x] 2.7 Verify JS extension provides bracket matching, auto-indent, and keyword autocomplete out of the box

## 3. Enable JavaScript mode in script editors

- [x] 3.1 Add `javascript` prop to the pre-request script `CodeEditor` in `RequestView.tsx`
- [x] 3.2 Add `javascript` prop to the post-response script `CodeEditor` in `RequestView.tsx`

## 4. Validate

- [x] 4.1 Run `npm run build` in frontend to verify no TypeScript errors
- [x] 4.2 Launch the app and open a request with pre-request script content — verify keywords, strings, numbers, comments, and functions render in correct colors
- [x] 4.3 Verify bracket matching: place cursor next to `(`, `[`, `{` — matching bracket highlights
- [x] 4.4 Verify auto-indent: press Enter inside a block — next line indents
- [x] 4.5 Verify JS keyword autocomplete: type `con` — `console` and `const` appear in suggestions alongside Script API entries
- [x] 4.6 Verify JSON editors unchanged: open response viewer, history detail, mock route body — JSON highlighting still works as before
- [x] 4.7 Verify no console errors or visual regressions in the script panel
