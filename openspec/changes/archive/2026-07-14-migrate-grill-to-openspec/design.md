## Context

melatonin currently uses grill-with-docs skill for planning sessions — it interviews, sharpens terminology, updates CONTEXT.md, and creates ADRs. Output is scattered across files with no structured container for scope, requirements, tasks, or design decisions per feature.

OpenSpec is already installed (commands + skills in .claude, .codex, .pi, .omp) with spec-driven schema. `openspec/config.yaml` exists but `context` and `rules` fields are empty. No changes or specs created yet.

Existing project documentation:
- `CONTEXT.md` — 25-term domain glossary (melatonin, Request, Collection, Mock Server, Script, etc.)
- `DESIGN.md` — design system (dark-only, Nunito, Mantine, dusk horizon)
- `PRODUCT.md` — product vision and principles
- `ROADMAP.md` — v1 complete, v1.1 in progress
- `FRICTION.md` — pain log from daily use
- `docs/adr/` — 6 ADRs (0001-0006)

## Goals / Non-Goals

**Goals:**
- Populate `openspec/config.yaml` `context` with full project knowledge so AI speaks melatonin terminology in all artifacts
- Add per-artifact `rules` for terminology consistency and document awareness
- Establish process: CONTEXT.md stays canonical glossary, updated during explore or ad-hoc

**Non-Goals:**
- Do NOT rewrite CONTEXT.md or change its format
- Do NOT migrate existing ADRs into OpenSpec artifacts
- Do NOT change DESIGN.md, PRODUCT.md, ROADMAP.md, or FRICTION.md
- Do NOT create custom schema — spec-driven is sufficient
- Do NOT delete grill-with-docs skill files (just stop using them)

## Decisions

### Decision 1: Full dump of CONTEXT.md into config.yaml context

**Rationale**: The `context` field is fed to the AI during every artifact creation and explore session. A full dump ensures the AI knows domain terms, stack, conventions, and architectural decisions without needing to read external files. Reference-only ("see CONTEXT.md") risks the AI skipping it.

**Trade-off**: Config becomes verbose (~100 lines). Must be manually kept in sync with CONTEXT.md. Acceptable — project context changes slowly.

### Decision 2: Custom rules for all three artifacts

**Rationale**: bridge the two gaps grill-with-docs covered — terminology policing and ADR awareness.

**proposal rules**:
- Check CONTEXT.md for existing terminology before introducing new terms
- Reference ROADMAP.md to ensure scope alignment

**design rules**:
- Check docs/adr/ for existing architectural decisions before proposing new ones
- Reference DESIGN.md for UI constraints

**specs rules**:
- Use terminology from CONTEXT.md consistently
- Each requirement SHALL map to a scenario (WHEN/THEN)

### Decision 3: CONTEXT.md maintained ad-hoc, not auto-updated

**Rationale**: grill-with-docs auto-updated CONTEXT.md mid-conversation. OpenSpec has no equivalent loop. Options considered:

| Option | Verdict |
|--------|---------|
| Auto-update during explore | No — explore mode is freeform, not structured for this |
| Archive-triggered review | Overkill for small changes |
| Ad-hoc + explore offers | Chosen — simple, matches OpenSpec's "offer, don't auto-capture" philosophy |
| Config context IS the glossary | Rejected — duplicating glossary creates sync risk |

During explore sessions, AI may offer: "New term X emerged — add to CONTEXT.md?" User decides. Otherwise, manual edits.

### Decision 4: ADRs stay in docs/adr/, separate from OpenSpec

**Rationale**: OpenSpec `design.md` is tactical ("how we're building this feature"). ADRs are strategic ("why we chose Mantine over raw CSS"). Different timescales, different audiences. Forcing ADRs into OpenSpec artifacts would add ceremony without benefit.

When a change produces a genuinely architectural decision, create an ADR manually. The `design` rule "Check docs/adr/ for existing architectural decisions" ensures awareness without forced coupling.

## Risks / Trade-offs

- **Config drift**: CONTEXT.md and config.yaml `context` diverge → Mitigation: review config context when updating CONTEXT.md (infrequent)
- **AI doesn't use rules effectively**: Rules are prompt guidance, not code. Terminology policing may be weaker than grill-with-docs' structured loop → Mitigation: rules are additive; if they don't help, adjust or remove
- **Process regression**: Without grill-with-docs' relentless interview, some decisions may be skipped → Mitigation: explore mode is looser but compensates with structured artifacts that make gaps visible
