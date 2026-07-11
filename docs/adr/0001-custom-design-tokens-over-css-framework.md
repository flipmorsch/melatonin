# 1. Custom design tokens instead of a CSS framework

Date: 2026-07-11

## Status

Superseded by [0002](0002-mantine-as-component-base.md)

## Context

The visual revamp brief suggested basing the design system on a framework
("bulma or mui if u need"). melatonin is a dense, dark, three-pane desktop
tool rendered in a webview, with roughly a dozen UI primitives (buttons,
fields, badges, list rows, cards). MUI brings a Material identity plus an
emotion runtime the webview must parse on every launch; Bulma is a
light-first, marketing-oriented stylesheet whose components (hero, navbar,
columns) don't map to this layout. Either way we would override most of the
base to reach the nocturnal identity the product wants.

## Decision

Build a small token-based design system in plain CSS: custom properties for
color/type/space/radius/motion in `frontend/src/design/tokens.css`, component
classes in `frontend/src/design/components.css`. No framework dependency.

## Consequences

- The design system is ~2 small CSS files we own outright; the bundle gains
  no runtime and no dead framework CSS.
- Every visual decision must be made (and documented) by us — DESIGN.md is
  the source of truth, and drift is our responsibility.
- If the app ever grows complex widget needs (data grids, comboboxes), we
  add a headless library (e.g. Radix) and skin it with these same tokens,
  rather than adopting a styled framework.
