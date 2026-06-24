# SMOKE-S3 — Project Detail Config tab (runtime)

> Phase 6.8 mandatory runtime smoke. **GREEN.** Executed 2026-06-24 against the
> real Kuraka vault, exercising both config-present and config-absent outcomes.

## End-to-end flow (one sentence)
The system can now **open a project's detail page and read its curated Kuraka
configuration (stack, architecture, conventions, workflow) from the live
`kuraka.config.yaml`, with a first-class empty state when the project has none.**

## Environment
- `BACKEND_PORT=5184 npm run dev` (backend 5184 to avoid an unrelated project's Vite on :5174; proxy follows `BACKEND_PORT`). Frontend :5173.
- Real vault registry; live `kuraka.config.yaml` reads.

## Scenario 1 — Config present (browser)
**Action:** navigate `http://localhost:5173/projects/kuraka-control` (has `kuraka.config.yaml`).
**Verified (`s3-config-tab.png`):** Config tab renders the **Configuration** card with curated rows from real config:
- Stack backend → `typescript / express`
- Stack frontend → `typescript / react`
- Architecture → `route → service → repository → domain`
- Store → `zustand`
- Naming → `english`
- Limits → `file 400 · fn 50`
- Workflow → `normal`
Header + DriftBadge (`up to date`) + tabs shell (S2) intact. Only console error: `favicon.ico 404` (cosmetic).

## Scenario 2 — Config absent (browser)
**Action:** navigate `http://localhost:5173/projects/sie_v2` (no `kuraka.config.yaml`).
**Verified (`s3-config-empty.png`):** first-class empty panel **"No `kuraka.config.yaml` in this project / This project has no Kuraka config file."** — not an error, not a crash. DriftBadge `not pinned` (S2) consistent. 0 console errors.

## Components exercised
Vite proxy → `GET /api/projects/:name` → service (`getProjectDetail`, parallel `readProjectConfig`) → repository (`readProjectConfig`, yaml.parse of real `kuraka.config.yaml`, degrade-to-null) → pure `curateProjectConfig` (type-strict, 10 curated fields) → zod `ProjectDetail.config` → react-query → ConfigCard / empty panel.

## Not exercised (justified)
- Malformed-yaml / partial-config / waCert-shape / type-strict rejection → covered by `projectConfig.test.ts` (43) + `projectReader.test.ts` (13). All 6 live present-configs are well-formed.
- The other tabs (Project Layer/RETRO/Telemetría/Agentes) stay inert with no content — out of S3 scope (S4+).

## Follow-ups surfaced (non-blocking)
- (carried) canonical vault `VERSION` file; sidebar active-nav prefix-match; dev-README `:5174`/`BACKEND_PORT` note. No new S3-specific follow-up.

**Verdict: GREEN — config tab works end-to-end on real vault data, both present and absent outcomes.**
