# SMOKE-S4 — Project Layer browser (runtime)

> Phase 6.8 mandatory runtime smoke. **GREEN.** Executed 2026-06-24 against the
> real Kuraka vault, including a live path-traversal rejection.

## End-to-end flow (one sentence)
The system can now **browse a project's `.claude/project/` layer as a file tree and
preview a selected file's contents**, with the read contained to the layer root.

## Environment
- `BACKEND_PORT=5184 npm run dev` (backend 5184 to avoid an unrelated project's Vite on :5174). Frontend :5173.
- Real vault; live `.claude/project/` tree-walk + contained file reads.

## Scenario 1 — API (backend, real data + adversarial)
- `GET /api/projects/kuraka-control/layer` → `200`, `has_layer:true`, tree top nodes dirs-first: `agents, conventions, lessons-learned, review-checks` then `glossary.md, README.md`.
- `GET /api/projects/kuraka-control/layer/file?path=glossary.md` → `200`, `binary:false, too_large:false`, real `content`.
- **`GET …/layer/file?path=../../../../etc/passwd` → `403 PATH_FORBIDDEN`**, `detail:{rel}` only (no absolute path, no content leak). [headline security check, live]
- `GET /api/projects/sie_v2/layer` → `200`, `has_layer:false, empty:true` (no `.claude/project/`).

## Scenario 2 — Layer browser (browser, interactive golden path)
**Action:** navigate `/projects/kuraka-control` → click the **Project Layer** tab → click `conventions/typescript.md`.
**Verified (`s4-layer-browser.png`):**
- Tabs are now interactive (Config / Project Layer switch; RETRO/Telemetría/Agentes inert). Project Layer active (accent underline).
- **Tree** (LayerCard, jade governance): `.claude/project` root (jade folder), dirs `agents/`(.gitkeep + 6 `*.append.md`), `conventions/`, `lessons-learned/`(INDEX.md), `review-checks/`(code-reviewer.md), root files `glossary.md`, `README.md`. Dirs jade icons, files muted; selected file highlighted (surface-2).
- **Preview pane** (right, flex-1): renders `conventions/typescript.md` real content as preformatted text. Lazy-fetched on select.
- 0 console errors.

## Components exercised
Vite proxy → `GET /:name/layer` + `/:name/layer/file` → service → repository `layerReader` (6-step containment resolver, bounded tree-walk, stat-before-read, binary detection) → zod `LayerTreeResponse`/`LayerFileResponse` → react-query (lazy on tab + on file) → switchable tabs → LayerCard tree → LayerPreview.

## Not exercised in-browser (justified — covered by tests)
- Traversal/symlink-escape/NUL/Windows-drive/too-large/binary rejection → `layerReader.test.ts` (45, real temp dirs + real symlinks) + security review traced & ran them live. Traversal also curl-verified above.
- `has_layer:false` empty panel → covered by integration + `projectLayer.test.ts` (flag-drift) + the sie_v2 curl above.

## Follow-ups surfaced (non-blocking)
- (carried) canonical vault `VERSION` file; sidebar active-nav prefix-match; dev-README `BACKEND_PORT` note.
- LOW (security): symlink `size_bytes` uses `stat` (follows link) — cosmetic metadata only; file read re-validates via realpath. No action needed.

**Verdict: GREEN — layer browser works end-to-end on real data; path-traversal rejected live; security review PASS (no CRITICAL).**
