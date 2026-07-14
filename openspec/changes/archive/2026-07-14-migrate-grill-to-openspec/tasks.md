## 1. Populate project context

- [x] 1.1 Write `context` field in `openspec/config.yaml` with tech stack, domain glossary (all terms from CONTEXT.md), design system, architecture, and key ADR references
- [x] 1.2 Verify context includes: Go + Wails, React/TypeScript + Mantine v7, JSON file storage, Goja runtime, feature-folder structure, useReducer tab state, ordered KV lists, position-based tree ordering
- [x] 1.3 Verify context includes all 25+ domain terms from CONTEXT.md (melatonin, Request, Collection, Mock Server, Route, Environment, Script, Cookie Jar, Session Variable, etc.)

## 2. Add artifact rules

- [x] 2.1 Add `rules.proposal` to `openspec/config.yaml` — check CONTEXT.md for existing terminology, reference ROADMAP.md for scope
- [x] 2.2 Add `rules.design` to `openspec/config.yaml` — check docs/adr/ for existing decisions, reference DESIGN.md for UI constraints
- [x] 2.3 Add `rules.specs` to `openspec/config.yaml` — use CONTEXT.md terminology consistently, each requirement SHALL have at least one scenario

## 3. Validate

- [x] 3.1 Run `openspec validate migrate-grill-to-openspec` and fix any issues
- [x] 3.2 Run `openspec doctor` and verify root is healthy
- [x] 3.3 Review config.yaml for completeness and accuracy
