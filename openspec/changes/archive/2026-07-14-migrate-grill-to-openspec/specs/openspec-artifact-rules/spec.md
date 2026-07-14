## ADDED Requirements

### Requirement: Proposal rules enforce terminology consistency
The `openspec/config.yaml` `rules.proposal` SHALL include rules that instruct the AI to check `CONTEXT.md` for existing terminology before introducing new terms and to reference `ROADMAP.md` for scope alignment.

#### Scenario: AI proposes a change using conflicting terminology
- **WHEN** AI creates a proposal that uses a term differently from CONTEXT.md
- **THEN** the AI flags the mismatch and aligns with the glossary definition

#### Scenario: AI proposes a change outside current roadmap scope
- **WHEN** AI creates a proposal for a feature deferred in ROADMAP.md
- **THEN** the AI acknowledges the scope decision and justifies why it's being revisited

### Requirement: Design rules enforce ADR and DESIGN.md awareness
The `openspec/config.yaml` `rules.design` SHALL include rules that instruct the AI to check `docs/adr/` for existing architectural decisions and reference `DESIGN.md` for UI constraints.

#### Scenario: AI designs architecture that duplicates an existing ADR decision
- **WHEN** AI creates a design that re-litigates a settled architectural decision
- **THEN** the AI references the existing ADR instead of re-arguing the trade-off

#### Scenario: AI designs UI that violates DESIGN.md
- **WHEN** AI creates a design proposing a light theme or non-Mantine component
- **THEN** the AI acknowledges the DESIGN.md constraint and works within it

### Requirement: Specs rules enforce consistent terminology
The `openspec/config.yaml` `rules.specs` SHALL include rules that instruct the AI to use terminology from CONTEXT.md consistently and ensure each requirement has at least one scenario.

#### Scenario: AI writes spec using inconsistent terms
- **WHEN** AI writes a requirement using "endpoint" instead of "Route" (Mock Server context)
- **THEN** the AI corrects to the glossary term "Route"

#### Scenario: AI writes spec requirement without a scenario
- **WHEN** AI writes a requirement with no WHEN/THEN scenario
- **THEN** the AI adds at least one scenario to make the requirement testable
