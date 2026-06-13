# ADR-001 — TypeScript on both sides

**Status:** accepted · **Date:** 2026-06-07

## Context
C1 fixes Node+Express (backend) and React+Vite+Zustand (frontend) but not the
language. The frontend section of `kuraka.config.yaml` only admits
`typescript | javascript`. The sister project **dbcanvas** (same stack) is
TS 88%. The API is the seam between two locked pieces and carries structured
data (registry frontmatter, the RETRO state machine, telemetry numbers).

## Decision
Use **TypeScript** for backend, frontend, and the shared `contracts` package.
`strict: true` everywhere. Backend runs via `tsx` in dev and `tsc` for
typecheck/build.

## Rationale
- The RETRO state machine (RL-1…RL-7) is exactly the kind of discriminated
  union TS models safely; `enums_for_states: true` in config maps to a TS union.
- A typed API contract (adr-002) eliminates a whole class of frontend/backend
  drift bugs — the highest-value guarantee for an observe+act tool where "no
  silent failure" is an invariant.
- Matches dbcanvas → arki/amauta reuse, shared review-checks.

## Consequences
- Build/typecheck step both sides (`npm -w <ws> run typecheck` = `tsc --noEmit`).
- `null_syntax` in config is documented as `T | null` / `T | undefined` for TS
  (the config's `"T | None"` is the cross-language canonical form; see
  `.claude/project/conventions/typescript.md`).
