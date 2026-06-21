# Kuraka Telemetry Dashboard

_Updated: 2026-06-21 (hand-rolled after S1; per-cycle JSON is gitignored)_
_Cycles analyzed: 2_

## Cycles

| Cycle | Mode | Runs | Total tokens | Total tool uses | Total duration |
|-------|------|-----:|-------------:|----------------:|---------------:|
| REQ-20260612-S12-design-system | reduced | 4 | 146,354 | 107 | 10.3min |
| REQ-20260620-S1-registry-reader-projects | normal (risk-reduced) | 9 | 463,505 | 270 | ~46.5min wall |

## Per-agent aggregate (S12 + S1)

| Agent | Invocations | Total tokens |
|-------|------------:|-------------:|
| frontend-developer | 4 | 144,630 |
| po-analyst | 3 | 120,272 |
| code-reviewer | 2 | 116,432 |
| backend-developer | 2 | 72,869 |
| final-auditor | 1 | 67,519 |
| test-engineer | 1 | 57,321 |
| architect-reviewer | 1 | 55,706 |
| story-refiner | 1 | 42,629 |

## Totals

- Total tokens (2 cycles): **609,859**
- Cycles: **2**
- Avg tokens per cycle: **304,930**

## Notes

- **S1 GATE0 double-pass** (~80K, 17% of S1) caught the arki `status`-enum vs live-data
  defect before runtime — preventable upstream by fixing arki (see RETRO-REQ-20260620-S1).
- S1 ran Normal risk-reduced (Rule 0): skipped 2.5 / 5.5(folded) / 6.5 / 6.7 — est. 150–250K saved.
- Two recurring **arki scaffold gaps** now across both cycles (missing backend eslint config;
  over-constrained contract fields) — flagged for a `pattern-detector` run.

---
_Budget table lives in `.claude/skills/kuraka-policies.md` and `rules/17`._
