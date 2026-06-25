# SMOKE-S5b-1 — Triage write actions + WriteFirewall (runtime)

> Phase 6.8 mandatory runtime smoke. **GREEN.** Executed 2026-06-25 against a
> DISPOSABLE TEMP vault copy — the real vault was NEVER written.

## End-to-end flow (one sentence)
The system can now **act on the improvement loop**: route/defer/reject a triage
finding from the browser, which writes the vault triage card through the WriteFirewall,
byte-preserving everything except the one targeted cell.

## Environment (write-safe)
- A **throwaway backend (:5186) + frontend (:5176) pair** pointed at a TEMP vault copy
  (`/tmp/kuraka-s5b-smoke-vault` = a copy of `retro-triage/` + `projects/`). The real
  `<vault>/retro-triage/` was never the target. Torn down + temp vault deleted after.

## Scenario — write action (browser, the golden path)
**Action:** navigate `http://localhost:5176/triage/2026-06-06-sie_v2`; in the findings
table each row shows a routing `<select>` + per-row `Defer`/`Reject` buttons (AC29), plus
card-level Defer/Reject in the header. Clicked **P4's Defer** button.
**Verified (`s5b-actions-before.png` / `s5b-actions-after.png` + on-disk checks):**
- Before: P4 `status = applied` (all 6 findings applied).
- After the click: **TEMP card P4 `status = deferred`** (surgical Status-cell write).
- **TEMP card `date: 2026-06-06` preserved** (NOT ISO-coerced — the architect's BLOCKER fix holds at runtime).
- **REAL vault P4 `status = applied` — UNTOUCHED** (re-checked after; all P1–P6 still `applied`).
- react-query invalidated `["triage"]` → UI reflects the new status. (1 console error = favicon 404, cosmetic.)

## Components exercised
Vite proxy → `POST /api/triage/:id/defer {finding_id}` → route (`:id` guard) → service
(`deferTriage`: read → `setFindingCell(...,5,"deferred")` → **WriteFirewall.writeTriageRecord**
[6-step containment → atomic `.tmp`+rename] → re-read) → zod `TriageDoc` → react-query mutation
→ FindingDeferRejectControl. Raw-line rewrite (no `matter.stringify`).

## Not exercised in-browser (justified — covered by tests)
- All firewall containment vectors (traversal/absolute/Windows-drive/NUL/_TEMPLATE/nested/symlink), atomicity, byte/date preservation, 403 `{id}`-only, route/reject finding+card level → `writeFirewall.test.ts` (36) + `triage.test.ts` (+25 guards) + `triageActions.test.ts` (25) + `triage.route.test.ts` (30, incl. a real-vault-untouched assertion). 543 tests total.

## Scope boundary (S5b-2, NOT here)
- `apply` action + **framework apply** (`agents/*.md` write, RL-4 human-confirm token) + RL-5 conflict serialization + RL-6 no-mount. The firewall's allowlist is data-driven so S5b-2 adds `framework_patch` without a re-cut.

## Follow-ups (carried)
- Date formatting still verbose (`Fri Jun 05 2026 …`, TZ off-by-one) — the S5a convention applies; a render polish pass remains. Canonical vault `VERSION` file; sidebar prefix-match; code-reviewer T1 digest (latency).

**Verdict: GREEN — first vault-write works end-to-end through the UI; surgical + atomic; date preserved; the REAL vault was never touched; security review PASS (no CRITICAL).**
