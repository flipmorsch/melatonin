## ADDED Requirements

### Requirement: Script editors display JavaScript syntax highlighting

The pre-request script editor and post-response script editor SHALL render JavaScript code with distinct colors for keywords, strings, numbers, comments, functions, regular expressions, and punctuation, using the nocturnal palette defined in DESIGN.md.

#### Scenario: Keyword coloring
- **WHEN** the user types a JavaScript keyword such as `const`, `let`, `if`, `return`, `function`, or `this` in a script editor
- **THEN** the keyword SHALL render in `--mantine-color-violet-2` (#b3a6fa)

#### Scenario: String literal coloring
- **WHEN** the user types a single-quoted, double-quoted, or template-literal string in a script editor
- **THEN** the string SHALL render in `--m-get` (#5bd6a2)

#### Scenario: Number literal coloring
- **WHEN** the user types a numeric literal in a script editor
- **THEN** the number SHALL render in `--m-put` (#eec468)

#### Scenario: Boolean and null literal coloring
- **WHEN** the user types `true`, `false`, `null`, or `undefined` in a script editor
- **THEN** the literal SHALL render in `--m-patch` (#f0995f)

#### Scenario: Comment coloring
- **WHEN** the user types a line comment (`// ...`) or block comment (`/* ... */`) in a script editor
- **THEN** the comment SHALL render in `--mantine-color-dark-2` (#8b88a3) with italic style

#### Scenario: Function name coloring
- **WHEN** the user types a function call such as `env.get("key")` or `console.log("msg")` in a script editor
- **THEN** the function name SHALL render in `--m-post` (#64aef2)

#### Scenario: Regular expression coloring
- **WHEN** the user types a regular expression literal such as `/pattern/` in a script editor
- **THEN** the regex SHALL render in `--m-delete` (#f0717e)

#### Scenario: Plain identifiers remain default
- **WHEN** the user types a variable name or runtime global (e.g., `request`, `response`, `env`) in a script editor
- **THEN** the identifier SHALL render in the default text color (`--mantine-color-dark-0`, #eceaf4)

### Requirement: Script editors support bracket matching

The pre-request script editor and post-response script editor SHALL highlight matching bracket pairs when the cursor is adjacent to a bracket character.

#### Scenario: Cursor next to opening bracket
- **WHEN** the user places the cursor immediately after an opening bracket (`(`, `[`, or `{`) in a script editor
- **THEN** the matching closing bracket SHALL be highlighted

#### Scenario: Cursor next to closing bracket
- **WHEN** the user places the cursor immediately before a closing bracket (`)`, `]`, or `}`) in a script editor
- **THEN** the matching opening bracket SHALL be highlighted

### Requirement: Script editors support auto-indent

The pre-request script editor and post-response script editor SHALL automatically indent the cursor position when the user presses Enter.

#### Scenario: Enter after opening brace
- **WHEN** the user presses Enter after typing `{` in a script editor
- **THEN** the next line SHALL be indented one level deeper than the current line

#### Scenario: Enter within existing block
- **WHEN** the user presses Enter in the middle of a code block in a script editor
- **THEN** the new line SHALL maintain the current indentation level

### Requirement: JavaScript keyword autocomplete

The pre-request script editor and post-response script editor SHALL offer autocomplete suggestions for JavaScript keywords and the melatonin Script API globals.

#### Scenario: JS keyword completion
- **WHEN** the user begins typing a JavaScript keyword prefix (e.g., `fun`, `ret`, `con`) in a script editor
- **THEN** the autocomplete menu SHALL include the matching JavaScript keyword

#### Scenario: Script API completion coexists
- **WHEN** the user types `response.` in a script editor
- **THEN** the autocomplete menu SHALL include both Script API properties (e.g., `response.status`) and any JS-valid identifiers

### Requirement: JSON editors are unchanged

Installing the JavaScript language extension SHALL NOT alter the appearance or behavior of existing JSON editors (response viewer, history detail, mock route body, request body).

#### Scenario: JSON body editor still works
- **WHEN** the user views a JSON response body in the response viewer
- **THEN** the body SHALL render with the existing JSON syntax colors (violet keys, green strings, amber numbers, orange booleans)

#### Scenario: JSON lint still works
- **WHEN** the user types malformed JSON in a request body editor with `json` mode enabled
- **THEN** the parse error SHALL be underlined as before
