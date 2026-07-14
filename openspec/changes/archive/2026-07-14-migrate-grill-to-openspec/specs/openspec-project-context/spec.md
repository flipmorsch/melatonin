## ADDED Requirements

### Requirement: Context field contains full project knowledge
The `openspec/config.yaml` `context` field SHALL contain the project's tech stack, domain glossary, architecture decisions, design system, and principles. This content SHALL be fed to the AI during artifact creation and explore sessions so all OpenSpec output uses melatonin terminology.

#### Scenario: AI creates proposal with domain awareness
- **WHEN** AI creates a proposal artifact for a new feature
- **THEN** the AI uses domain terms (Request, Collection, Mock Server, Environment, Script) from the context field without needing to read external files

#### Scenario: AI explores a feature without external file reads
- **WHEN** AI enters explore mode to discuss a new capability
- **THEN** the AI references melatonin-specific concepts (Pre-request Script, Cookie Jar, Route) from the context field

### Requirement: Context field includes tech stack and architecture
The `context` field SHALL document: Go + Wails backend, React/TypeScript + Mantine v7 frontend, JSON file storage, Goja script runtime, feature-folder structure, and key architectural decisions (useReducer tab state, ordered KV lists, position-based tree ordering).

#### Scenario: AI proposes design that respects stack
- **WHEN** AI creates a design artifact
- **THEN** the design references Mantine components, Wails bindings, and JSON storage as constraints

### Requirement: Context field includes design system
The `context` field SHALL document: dark-only theme, Nunito font, violet-cast ink surfaces, method color hues, dusk horizon signature, 130ms motion, Mantine-first component approach.

#### Scenario: AI designs UI that matches brand
- **WHEN** AI creates a design artifact involving UI changes
- **THEN** the design respects dark-only constraint, uses Nunito for UI text, and references Mantine components before custom CSS

### Requirement: Context field references existing ADRs
The `context` field SHALL list key ADR numbers and titles so the AI is aware of existing architectural decisions.

#### Scenario: AI proposes change that conflicts with existing ADR
- **WHEN** AI creates a design artifact that would contradict an existing ADR (e.g., suggesting a state library when ADR 0006 chose useReducer)
- **THEN** the AI is aware of the ADR and can address the conflict explicitly
