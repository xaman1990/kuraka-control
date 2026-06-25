# Kuraka Telemetry Dashboard

_Updated: 2026-06-25 (hand-rolled after S5a; per-cycle JSON is gitignored)_
_Cycles analyzed: 6_

## Cycles

| Cycle | Mode | Runs | Total tokens | Total tool uses | Total duration |
|-------|------|-----:|-------------:|----------------:|---------------:|
| REQ-20260612-S12-design-system | reduced | 4 | 146,354 | 107 | 10.3min |
| REQ-20260620-S1-registry-reader-projects | normal (risk-reduced) | 9 | 463,505 | 270 | ~46.5min wall |
| REQ-20260622-S2-project-detail-drift | normal (risk-reduced) | 7 | 450,445 | ~235 | ~28min wall |
| REQ-20260622-S3-project-config-tab | reduced (T3 combined 1+2) | 6 | 390,373 | ~180 | ~33min wall |
| REQ-20260624-S4-project-layer-browser | normal full + 5.5 Security | 10 | 688,437 | ~266 | ~58min wall |
| REQ-20260624-S5a-retro-triage-board | reduced (T3, read-only; S5 split) | 6 | 430,985 | ~188 | ~30min wall |

**Token trend: S1 463K → S2 450K → S3 390K → S4 688K → S5a 431K.** S4's spike was scope
(L + dedicated 5.5 + a BLOCKER fix loop); S5a reverts to the low band once scope normalizes —
confirming the rise was scope, not regression.

## Per-agent aggregate (S12 + S1 + S2 + S3 + S4 + S5a)

| Agent | Invocations | Total tokens |
|-------|------------:|-------------:|
| frontend-developer | 12 | 533,390 |
| code-reviewer | 6 | 434,477 |
| final-auditor | 5 | 397,604 |
| test-engineer | 5 | 370,198 |
| po-analyst | 7 | 342,930 |
| backend-developer | 7 | 339,107 |
| architect-reviewer | 5 | 297,795 |
| story-refiner | 3 | 156,189 |
| security-reviewer | 1 | 62,862 |

## Totals

- Total tokens (6 cycles): **2,570,099**
- Cycles: **6**
- Avg tokens per cycle: **428,350**

## Notes

- **S5 was SPLIT by Rule 0**: S5a (read board+detail, this cycle, clean) vs S5b (route/apply/defer
  write actions + corrected state machine + dedicated 5.5). De-risked the first vault-WRITE surface.
- **Clean cycles**: S2, S3, S5a had no BLOCKER/IMPORTANT. S4's BLOCKER was a genuine Node-22 dirent
  footgun on an L story (→ LL-012), not a process failure.
- **T3 (combined 1+2)**: 2nd successful use (S3, S5a); LL-011 held — the mechanism-hedge thread did
  NOT recur in S5a (the table-parse mechanism was pinned in the story).
- **Lessons compounding**: LL-007..012 + review-checks §6 (tokens), §7 (fs-walk symlinks), §8 (React
  type-only imports, recurrence S4+S5a) + a typescript convention for rendering external date strings.
- **pattern-detector**: ran after S4 (RECURRING-ISSUES.md). Not due now; next run at ~S5b/S6. New
  watch-items logged: React-namespace recurrence (now §8), external-date-raw-render (watch for 2nd).
- **Carried follow-ups** (project-layer/doc, non-blocking): canonical vault `VERSION` file; sidebar
  active-nav prefix-match; T1 context-digest for the code-reviewer (latency P1, 3/5 cycles).

---
_Budget table lives in `.claude/skills/kuraka-policies.md` and `rules/17`._
