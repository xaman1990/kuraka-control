# SMOKE-S2 — Project Detail header + drift indicator (runtime)

> Phase 6.8 mandatory runtime smoke. **GREEN.** Executed 2026-06-22 against the
> real Kuraka vault, exercising both drift outcomes with live data.

## End-to-end flow (one sentence)
The system can now **open a project's detail page and see, from live data, whether
its mounted Kuraka framework version is up to date with the vault, behind, or not
pinned at all.**

## Environment
- `BACKEND_PORT=5184 npm run dev` (backend 5184 to avoid an unrelated project's Vite on :5174; Vite `/api` proxy follows `BACKEND_PORT` — no source change). Frontend :5173.
- Real vault registry (8 projects); live `kuraka.lock` reads + `kuraka-init.py` `DEFAULT_VERSION` parse.

## Scenario 1 — API (backend, real data)
`GET /api/projects/:name` verified live:
- `kuraka-control` (has `kuraka.lock` 0.3.4, vault 0.3.4) → `drift.state = "up_to_date"`, `registry_matches_lock = true`.
- `sie_v2` (no lock) → `drift.state = "not_pinned"`, `lock_version = null`, `registry_matches_lock = null`.
- unregistered name → `404 { error: { code: "NOT_FOUND" } }` (not 500).

## Scenario 2 — Project Detail, up_to_date (browser)
**Action:** navigate `http://localhost:5173/projects/kuraka-control`.
**Verified (`s2-detail-uptodate.png`):**
- Shared **AppShell** sidebar now renders on the detail page (closes S1 code-review SUGGESTION-9 — the S1 shell had no chrome).
- Crumb "Proyectos / kuraka-control"; Title (26/700); `● project` governance badge (jade); **DriftBadge `up to date` in jade**.
- Actions (Re-mount/Validate/Sync) rendered as inert disabled pills (behavior = S7). Tabs bar (Config active w/ accent underline · Project Layer · RETRO · Telemetría · Agentes) as an inert shell; NO tab content (S3+).
- 0 console errors.

## Scenario 3 — Project Detail, not_pinned (browser)
**Action:** navigate `http://localhost:5173/projects/sie_v2`.
**Verified (`s2-detail-notpinned.png`):** **DriftBadge `not pinned` in muted/neutral** — first-class majority state (7/8 projects), visibly distinct from the jade up-to-date. Same header/chrome. 0 console errors.

## Components exercised
Vite proxy → `GET /api/projects/:name` route (+ `:name` validation) → service → repository (`findProjectByName` + `readLockVersion` yaml + `readVaultVersion` regex on `kuraka-init.py`) → pure `computeDrift` (frozen decision table) → zod `ProjectDetail` → react-query → AppShell + ProjectDetail header + DriftBadge (`DRIFT_DISPLAY_MAP`).

## Not exercised (justified)
- `behind` / `ahead` states — no live project is currently behind/ahead (all locks == vault 0.3.4). Covered by `drift.test.ts` (incl. the `0.3.10 > 0.3.9` vector) + `projectDetail.test.ts` (all 5 states) + integration tests.
- `unknown` state (unparseable/missing vault version) — covered by unit tests.
- 404 path in browser — covered by integration test + API curl above.

## Follow-ups surfaced (non-blocking, for RETRO)
1. Sidebar active-nav uses exact-path match → "Proyectos" is not highlighted while on a detail page (code-review SUGGESTION-7). Consider prefix-matching in a later story.
2. Fragile vault-version seam: `DEFAULT_VERSION` is regex-parsed from `kuraka-init.py`. Follow-up: a canonical vault `VERSION` file (flagged in S2 REQ, out of scope).

**Verdict: GREEN — drift indicator works end-to-end on real vault data, both outcomes visually distinct.**
