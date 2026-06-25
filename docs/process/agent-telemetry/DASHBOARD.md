# Kuraka Telemetry Dashboard

_Updated: 2026-06-25 (hand-rolled after S5b-1; per-cycle JSON is gitignored)_
_Cycles analyzed: 7_

## Cycles

| Cycle | Mode | Runs | Total tokens | Total duration |
|-------|------|-----:|-------------:|---------------:|
| REQ-20260612-S12-design-system | reduced | 4 | 146,354 | 10.3min |
| REQ-20260620-S1-registry-reader-projects | normal (risk-reduced) | 9 | 463,505 | ~46.5min |
| REQ-20260622-S2-project-detail-drift | normal (risk-reduced) | 7 | 450,445 | ~28min |
| REQ-20260622-S3-project-config-tab | reduced (T3 combined 1+2) | 6 | 390,373 | ~33min |
| REQ-20260624-S4-project-layer-browser | normal full + 5.5 Security | 10 | 688,437 | ~58min |
| REQ-20260624-S5a-retro-triage-board | reduced (T3, read-only; S5 split) | 6 | 430,985 | ~30min |
| REQ-20260625-S5b-1-triage-write-actions | normal full + 5.5 (first vault WRITE; S5b split) | 10 | 803,664 | ~40min |

**Token trend: S1 463 → S2 450 → S3 390 → S4 688 → S5a 431 → S5b-1 804K.** The two spikes (S4, S5b-1)
are scope-driven (L / first-write + dedicated 5.5 + a fix loop + the largest test suites); the
read-only/reduced cycles (S3, S5a) sit in the low band. Per-run tokens stay in-band throughout.

## Per-agent aggregate (7 cycles)

| Agent | Invocations | Total tokens |
|-------|------------:|-------------:|
| frontend-developer | 14 | 640,336 |
| code-reviewer | 7 | 519,624 |
| final-auditor | 6 | 506,864 |
| test-engineer | 6 | 505,247 |
| backend-developer | 9 | 463,057 |
| po-analyst | 8 | 430,159 |
| architect-reviewer | 6 | 392,876 |
| story-refiner | 4 | 218,748 |
| security-reviewer | 2 | 137,534 |

## Totals

- Total tokens (7 cycles): **3,373,763**
- Cycles: **7**
- Avg tokens per cycle: **481,966**

## Notes

- **Adversarial-freeze pattern — 2 consecutive PRE-CODE major catches**: S4 (Windows-drive `isAbsolute`
  bypass on POSIX) and S5b-1 (`matter.stringify` corrupts the card `date` on every write). Both killed at
  the schema freeze, zero rework. Codified: LL-013 + architect empirical-freeze check + code-review §9.
- **First vault-WRITE (S5b-1)** shipped clean: dedicated 5.5 PASS (no CRITICAL), single-writer WriteFirewall,
  atomic raw-line rewrite, smoke against a DISPOSABLE temp vault (real vault never written).
- **Rule-0 splits** (S5→S5a/S5b, S5b→S5b-1/S5b-2) de-risked the read→write transition; both halves clean.
- **Lessons compounding**: LL-007..013 + review-checks §6 (tokens), §7 (fs-walk symlinks), §8 (React type
  imports — suppressed its own recurrence in S5b-1), §9 (structured-doc byte-preservation). The
  mechanism-hedge thread is now a 3-form family: LL-011 (obvious fork) → LL-012 (platform-gated) → LL-013 (library-gated).
- **pattern-detector**: DUE/approaching (7 RETROs; 2 since the S4 pass). Run before S5b-2. New input: the
  adversarial-freeze pre-code-catch pattern (S4+S5b-1).
- **Carried follow-ups**: canonical vault `VERSION` file; sidebar active-nav prefix-match; code-reviewer T1
  digest (latency — note S5b-1's reviewers ran in-band, attributed to the precise frozen attack table);
  date-formatting render polish (S5a).

---
_Budget table lives in `.claude/skills/kuraka-policies.md` and `rules/17`._
