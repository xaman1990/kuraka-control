# ADR-007 — Two-color governance enforcement (gold / jade)

**Status:** accepted (tokens) + proposed (Tailwind v4, fork #1) · **Date:** 2026-06-07

## Context
C6 + FR-2.4 + FR-4.x: the UI must make governance **visible everywhere** with two
colors — **gold = framework** (editable only in the vault, via this app) and
**jade = project-native** (editable per project). The design system is the Andean
"Quipu" theme (spec §2): obsidian base + gold (Inti) + jade.

## Decision — governance is a typed property, not an ad-hoc style
- A domain enum `Governance = "framework" | "project"`. Every catalog item,
  tree node, and badge carries it. The backend sets it (an `agents/*.md` file →
  `framework`; a `.claude/project/**` file → `project`).
- A single `<GovernanceBadge governance=… />` and `<GovernanceDot>` consume the
  enum → tokens `--gov-framework` (gold) / `--gov-project` (jade). No component
  hard-codes a color.
- The **write firewall** (adr-006) enforces the *behavior* the color promises:
  gold targets need the framework confirm token; jade targets are project-scoped.
  Color and capability cannot drift.

## Design tokens (seed — from spec §2; refine against the `.pen` in S12)
CSS custom properties on `:root` (the `.pen` itself is not in the vault yet; these
are the documented names + sensible obsidian/gold/jade values to start S12):

```
--bg / --surface / --surface-2 / --border        # obsidian base
--text / --text-2 / --text-3                       # text ramp
--accent        (gold / Inti)    → also --gov-framework
--jade                           → also --gov-project
--cord                            # quipu cord/connector lines
--ag-<agent>   per-agent dot colors (16 agents)    # see below
```

Per-agent colors (real, from `agents/*.md` frontmatter, 2026-06-07):

| agent | color | agent | color |
|-------|-------|-------|-------|
| amauta | gold | inti | yellow |
| arki | lime | migration-reviewer | gray |
| architect-reviewer | red | pattern-detector | yellow |
| backend-developer | green | po-analyst | purple |
| code-reviewer | red | security-reviewer | magenta |
| deployment-verifier | white | story-refiner | blue |
| e2e-tester | cyan | test-engineer | cyan |
| final-auditor | orange | frontend-developer | blue |

## Implementation — Tailwind v4 + CSS vars (fork #1)
Tailwind v4 maps these `:root` vars to utilities via `@theme`. **Fork:** v4 is
newer than v3; downgrading to v3 (`tailwind.config` with the same vars) is a
one-file change if the operator prefers v3 stability.

## Consequences
- S12 (design system, first critical-path story) implements the tokens + the two
  shared governance components + the agent-color map; everything else reuses them.
- Governance correctness is testable: a unit test asserts every catalog entry has
  a `governance` value and the badge renders the matching token.
