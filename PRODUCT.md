# Product

## Register

product

## Users

One developer (the author) — a Go backend engineer testing HTTP APIs on Linux,
usually against local or staging services, often late in a work session. The
tool is a daily driver: opened alongside an editor and a terminal, used in
short bursts (compose → send → inspect, or start a mock → watch the log).

## Product Purpose

melatonin is a local-first API workbench: an Insomnia-style request client
plus a mock server in one desktop app. It exists because the incumbents put
accounts, cloud sync, and subscription nags in front of what is fundamentally
a local tool. Success = the whole request/mock loop works offline, instantly,
with zero upsell. Scope and deferred features: ROADMAP.md. Domain language:
CONTEXT.md.

## Brand Personality

Nocturnal, calm, unhurried. melatonin is the hormone of darkness — the cure
for Insomnia. The interface should feel like a quiet room at night: soft
shapes, violet-cast inks, one warm glimmer (the dusk horizon). Never loud,
never gamified, never selling anything.

## Anti-references

- Insomnia/Postman's account walls, sync banners, and upgrade CTAs — no
  surface may ever ask for anything.
- Material Design's institutional look (explicitly rejected in ADR 0002).
- The generic sharp-neutral dev-tool dark mode (pure gray-black + acid
  accent) — melatonin's darkness is violet-cast and soft (DESIGN.md).

## Design Principles

1. **The data is the interface** — URLs, headers, bodies, and logs are the
   content; chrome stays quiet and monospace carries the information.
2. **State must be glanceable** — method, run state, active environment, and
   response verdict are color-coded systems, readable from across the room.
3. **Never block the loop** — compose → send → inspect must never be
   interrupted by dialogs, confirmations (destructive two-click is the one
   exception), or navigation.
4. **Empty states direct** — every empty surface says what to do next, not
   what's missing.
5. **One signature, quiet everywhere else** — the dusk horizon is the only
   decorative flourish; everything else earns its pixels.

## Accessibility & Inclusion

- Visible `:focus-visible` rings on all interactive elements.
- Body/data text ≥ 4.5:1 contrast on its surface.
- `prefers-reduced-motion` disables ambient animation (night-light pulse).
- Method hues are never the only signal — the method name is always printed.
