# Kuraka Telemetry Dashboard

_Updated: 2026-06-22 (hand-rolled after S2; per-cycle JSON is gitignored)_
_Cycles analyzed: 3_

## Cycles

| Cycle | Mode | Runs | Total tokens | Total tool uses | Total duration |
|-------|------|-----:|-------------:|----------------:|---------------:|
| REQ-20260612-S12-design-system | reduced | 4 | 146,354 | 107 | 10.3min |
| REQ-20260620-S1-registry-reader-projects | normal (risk-reduced) | 9 | 463,505 | 270 | ~46.5min wall |
| REQ-20260622-S2-project-detail-drift | normal (risk-reduced) | 7 | 450,445 | ~235 | ~28min wall |

## Per-agent aggregate (S12 + S1 + S2)

| Agent | Invocations | Total tokens |
|-------|------------:|-------------:|
| frontend-developer | 6 | 232,520 |
| code-reviewer | 3 | 192,557 |
| po-analyst | 4 | 168,403 |
| final-auditor | 2 | 141,037 |
| test-engineer | 2 | 127,855 |
| backend-developer | 3 | 122,685 |
| architect-reviewer | 2 | 116,803 |
| story-refiner | 2 | 99,481 |

## Totals

- Total tokens (3 cycles): **1,060,304**
- Cycles: **3**
- Avg tokens per cycle: **353,435**

## Notes

- **S2 was the cleanest cycle so far**: GATE0 PASS (no double-pass) + code review APPROVED
  (no BLOCKER/IMPORTANT) → **0 preventable rework loops**; ~3% fewer tokens than S1 for a
  riskier feature (new endpoint + drift logic + live-fs read). Evidence the improvement loop
  closed: S1's LL-008 drove the correct `DriftState` enum decision with no debate (RETRO-S2).
- **S1 GATE0 double-pass** (~80K, 17% of S1) caught the arki `status`-enum vs live-data defect
  before runtime. Generalized into LL-010 (run the live-data check proactively as a pre-flight).
- S1 RETRO follow-ups all landed before S2: `createApp()` factory (S2 integration tests use the
  real app), backend eslint config, api-contract convention. AppShell extraction closed S1's
  SUGGESTION-9.
- **No `pattern-detector` run due** — S2 added no new defect occurrence; defer to regular cadence.
- Carried follow-ups: canonical vault `VERSION` file (replace fragile `DEFAULT_VERSION` regex);
  sidebar active-nav prefix-match; dev-README `:5174`/`BACKEND_PORT` note.

---
_Budget table lives in `.claude/skills/kuraka-policies.md` and `rules/17`._
