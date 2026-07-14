## Why

grill-with-docs produced good thinking but left output scattered: CONTEXT.md updates, standalone ADRs, no task list, no scope document. OpenSpec replaces it with a structured container — proposal, design, specs, tasks — all in one change folder with a defined workflow (explore → propose → apply → archive). The migration populates OpenSpec's config with the project's domain language and conventions so it speaks "melatonin" from day one.

## What Changes

- `openspec/config.yaml`: populate `context` with full project context (tech stack, domain glossary, architecture decisions, design system, principles)
- `openspec/config.yaml`: add per-artifact `rules` (proposal, design, specs) for terminology consistency and document awareness
- Process: `/grill-with-docs` replaced by `/opsx-explore` → `/opsx-propose` → `/opsx-apply` → `/opsx-archive`
- CONTEXT.md: stays as canonical glossary, updated ad-hoc or during explore sessions (no longer auto-updated mid-conversation)
- docs/adr/: stays as system-wide decision log, separate from per-change design.md

## Capabilities

### New Capabilities
- `openspec-project-context`: OpenSpec CLI receives full project domain knowledge (tech stack, glossary, ADRs, design system) so all artifacts use consistent melatonin terminology
- `openspec-artifact-rules`: Custom rules enforce terminology checks against CONTEXT.md, ADR awareness in design, and DESIGN.md reference for UI decisions

### Modified Capabilities
<!-- None — this is the first OpenSpec change -->

## Impact

- `openspec/config.yaml` — write new context block and rules section
- No code changes — purely configuration and process
- No breaking changes
- grill-with-docs skill remains installed but will not be used going forward
