# 2. Mantine as the component base

Date: 2026-07-11

## Status

Accepted. Supersedes [0001](0001-custom-design-tokens-over-css-framework.md).

## Context

ADR 0001 chose hand-rolled CSS primitives on the grounds that the app had ~12
of them. The product owner overruled this: the app is expected to grow
substantially, and a maintained component library scales better than a
private one (accessibility, complex widgets like comboboxes/modals/tables
arrive for free instead of being rebuilt). MUI was rejected for its Material
identity; Mantine is headless-ish in spirit — its dark-first theming API can
express the melatonin nocturnal identity (DESIGN.md) instead of fighting it,
and since v7 it ships plain CSS variables with no runtime style engine.

## Decision

Adopt `@mantine/core` + `@mantine/hooks` as the component base. The nocturnal
design tokens move into a Mantine theme (`frontend/src/theme.ts`). Custom CSS
is reserved for the brand signatures Mantine cannot express (dusk horizon,
crescent, method hues, night-light pulse).

Components live in separate files, organized by feature
(`features/<area>/…`) with shared primitives in `components/` and data access
in `hooks/` — chosen over strict atomic design because feature folders keep
related code together as the app grows, while atoms/molecules taxonomy
scatters it.

## Consequences

- One significant dependency to track; Mantine major upgrades become our work.
- Theme values are TypeScript (`theme.ts`), not CSS custom properties —
  DESIGN.md stays the human-readable source of truth.
- New UI should reach for a Mantine component first, custom CSS second
  (inverse of the old rule).
