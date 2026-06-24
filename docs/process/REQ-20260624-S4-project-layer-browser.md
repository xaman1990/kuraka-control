# REQ-20260624-S4: Project Detail Tab 2 — Project Layer browser (tree + preview)

## Workflow Status
- [x] Phase 1: PO Analysis — IN PROGRESS
- [ ] Phase 2: Story Refinement   _(2.5 test-plan folded into Phase 2)_
- [ ] Phase 3: Architect Review (freezes SCHEMA-FROZEN-S4)
- [ ] Phase 4: Implementation
- [ ] Phase 5: Code Review
- [ ] **Phase 5.5: Security Review — REQUIRED** (path-containment audit; this story reads CLIENT-supplied paths from disk)
- [ ] Phase 6: Tests
- [ ] Phase 6.5: e2e — DEFERRED (golden-path covered by Phase 6.8 runtime smoke)
- [ ] Phase 6.7: deployment-verifier — SKIPPED (no infra/env change)
- [ ] Phase 6.8: Runtime smoke (mandatory)
- [ ] Phase 7: Final Audit

> **Pipeline rationale (Rule 0):** This is a backend feature that reads file
> contents whose path ultimately comes from the client (tree-node click). It is
> NOT a UI-only restyle — Phase 5.5 is mandatory because the headline risk is
> path traversal. Full pipeline minus 6.5/6.7.

---

## 1. Requirement Summary

Make the **Project Layer** tab (2nd tab of the Project Detail page) real: a
**file tree** of the registered project's `<project.path>/.claude/project/`
directory plus a **preview pane** rendering the contents of the selected file.
The layer is **jade** (project-native, read-only here). S2 built the header/tabs
shell and S3 built the Config tab; S4 fills the Project Layer tab. All other
tabs (RETRO=S5, Telemetría=S6, Agentes=S9) stay out.

---

## 2. Scope

### In Scope
- New repository fn(s): tree-walk of `<project.path>/.claude/project/` + a
  **contained** single-file read.
- New service: assemble the layer tree + resolve the layer root from `:name`.
- Endpoint(s): the tree + a lazy file-content read (recommended split — §5).
- New zod contracts: `LayerNode` (tree node), `LayerTreeResponse`,
  `LayerFileResponse` (+ their inferred TS types).
- Frontend: render the **Project Layer** tab — collapsible tree component (jade
  dir icons, muted file icons) + a preview pane (render `.md` as text/markdown).
- First-class empty/error states: no `.claude/project/` dir, empty dir, file
  too large, binary/non-text file, traversal attempt (forbidden), project path
  missing on disk.
- The **path-containment security model** (§3) that drives Phase 5.5.

### Out of Scope
- **Editing** the project layer (no writes — read-only; S4 never touches the
  WriteFirewall). Any layer editing is a separate future story.
- Other Project Detail tabs (RETRO=S5, Telemetría=S6, Agentes=S9).
- Governance writes / patches to the layer (those go through the WriteFirewall
  allowlist in a later governance story).
- Diffing project-layer vs framework, or vault-side framework agents (gold).
- Syntax highlighting / rich markdown rendering beyond plain text + minimal
  markdown (refinement may scope a lightweight renderer; not load-bearing here).

---

## 3. Security model (path-containment) — drives Phase 5.5

This is the central concern: the preview reads a file path that **originates
from the client** (the user clicks a tree node, the frontend sends its relative
path). The backend MUST contain every read to the layer root and reject any
escape. This builds on the existing convention
`.claude/project/conventions/fs-and-vault-safety.md` §5 ("Path containment.
Every fs path resolves inside {vault root} ∪ {registered project roots}. Reject
`..`/symlink escapes."), specialized here to the **layer root**.

### 3.1 Two-stage resolution chain (both stages trusted-on-the-left)
1. `:name` (URL param) → registry lookup (`findProjectByName`) → `project.path`.
   The `:name` is NEVER interpolated into a path (mirrors S2/S3; the route
   already rejects `name` containing `/` or `\`). A name not in the registry →
   `404 NOT_FOUND`.
2. **Layer root** = `realpath(path.join(project.path, ".claude/project"))`.
   The `project.path` comes from the **trusted** registry `path` field — not
   from the client.

### 3.2 The client-supplied value: relative path under the layer root
- The file is identified by a **relative path** (`rel`) under the layer root
  (e.g. `conventions/typescript.md`), as emitted by the tree endpoint.
  **Recommendation:** use a relative path, not an opaque id — it is debuggable,
  it mirrors the tree node 1:1, and containment is enforceable. (An opaque-id
  map would add server state for no security gain; the containment check below
  is the real defense regardless of the identifier shape.)
- The `rel` value is treated as **fully untrusted**.

### 3.3 Containment enforcement (the resolver — Phase 5.5 audits this)
For a requested `rel`:
1. **Reject** before any fs touch if `rel` is absent/empty, is absolute
   (`path.isAbsolute(rel)` or starts with `/` or a Windows drive), contains a
   NUL byte, or after `path.normalize` still begins with `..` or contains a
   `..` segment.
2. `candidate = path.resolve(layerRoot, rel)`.
3. Resolve symlinks: `realCandidate = realpath(candidate)`.
4. **Containment check:** `realCandidate === realLayerRoot` is false AND
   `realCandidate.startsWith(realLayerRoot + path.sep)` MUST be true. Compare
   **realpaths** (so a symlink whose target escapes the root is caught) and use
   the `+ path.sep` boundary (so `/x/project-evil` cannot pass a naive
   `startsWith('/x/project')`).
5. The resolved target MUST be a **regular file** (`stat.isFile()`), not a
   directory, FIFO, socket, or device.
6. On any failure of 1–5 → **typed forbidden error**, never read the file:
   `403 { error: { code: "PATH_FORBIDDEN", ... } }`. Do NOT echo the resolved
   absolute path back to the client (leak-avoidance); `detail` carries only the
   offending `rel`.

### 3.4 Symlink policy
- **Reject** any path component that is a symlink resolving **outside** the
  layer root (caught by the realpath comparison in 3.3.4). A symlink that stays
  **inside** the root is allowed but de-duplicated as a normal file.
- The tree-walk (§4/§5) does **not** follow symlinked directories out of the
  root, and flags symlinks so the resolver re-validates on read. (Live data:
  zero symlinks in any layer today, but externally-owned dirs can change — the
  defense is mandatory regardless.)

### 3.5 Limits (binary / size / depth)
- **Max preview size:** `LAYER_FILE_MAX_BYTES = 1_048_576` (1 MiB). Live data:
  largest layer file today is ~27 KB, typical 1–4 KB → 1 MiB is generous.
  A file over the cap → read is skipped; response sets `too_large: true` with
  `size_bytes`, `content: null`.
- **Binary / non-text detection:** read the file, then heuristically classify
  as binary (NUL byte in the sampled prefix, or a high ratio of non-UTF-8 /
  control bytes). Binary → `binary: true`, `content: null`. (Live data: every
  layer file is `.md` except a 0-byte `.gitkeep`; an empty file previews as
  empty `content: ""`, not an error.)
- **Tree depth/size cap:** cap the walk at a sane `MAX_DEPTH` (e.g. 8) and a
  `MAX_ENTRIES` (e.g. 2000) to bound a pathological deep tree; exceeding the cap
  truncates and flags rather than hanging. Live max depth observed ≈ 2.
- **Read-only:** S4 calls **no** `fs.writeFile`/`mkdir`/`rm` and **no** `spawn`.
  It does not touch the WriteFirewall or ScriptRunner. Reads hit disk live per
  request (no stale cache — fs-and-vault-safety §6).

---

## 4. Data contract (snake_case — mirrors external fs source 1:1; LL-008)

All names are externally-owned (file/dir names) → typed `z.string()`, **no
`z.enum`** except the app-owned `type` discriminator (`"dir" | "file"`, which
this app derives, not the fs).

### 4.1 Tree node — `LayerNode` (recursive)
```
LayerNode = {
  name: string;                 // basename, e.g. "typescript.md" / "conventions"
  type: "dir" | "file";         // app-derived discriminator (closed — OK to enum)
  rel_path: string;             // POSIX relative path under the layer root,
                                //   e.g. "conventions/typescript.md" — the value
                                //   the file-read endpoint takes back (§5)
  children?: LayerNode[];       // present iff type === "dir" (dirs sorted first,
                                //   then files, each alpha; deterministic order)
  size_bytes?: number;          // present iff type === "file" (for "too large" UI hint)
}
```

### 4.2 Tree response — `LayerTreeResponse`
```
LayerTreeResponse = {
  has_layer: boolean;           // false ⇒ no <project.path>/.claude/project dir
  root_rel: string;             // ".claude/project" (constant; for UI breadcrumb)
  nodes: LayerNode[];           // top-level entries; [] when dir exists but empty
  empty: boolean;               // true when has_layer && nodes.length === 0
                                //   (empty is NOT an error — api-contract.md)
  truncated?: boolean;          // true when MAX_DEPTH/MAX_ENTRIES cap hit
}
```
> **GATE0 note (do NOT trust the flag):** `has_layer` is computed from the
> **live dir stat**, NOT from the registry `has_project_layer` field. Live data
> proved the flag drifts: `bol-cert-no-deudor` has `has_project_layer: false`
> yet HAS a layer dir; `sie_v2` has `has_project_layer: true` yet has NO layer
> dir. The registry flag is a hint only; the backend verifies the directory.

### 4.3 File-content response — `LayerFileResponse`
```
LayerFileResponse = {
  rel_path: string;             // echo of the validated relative path
  name: string;                 // basename
  content: string | null;       // file text; null when too_large OR binary
  size_bytes: number;           // actual size on disk
  truncated: boolean;           // reserved: true if we ever cap content length
                                //   (v1: false — we serve whole-file-or-null)
  too_large: boolean;           // true ⇒ size > LAYER_FILE_MAX_BYTES, content null
  binary: boolean;              // true ⇒ non-text, content null
}
```

> **Casing:** snake_case both sides (pure projection of an external fs source —
> api-contract.md "seam casing mirrors the source 1:1; no camelCase boundary").
> All three schemas live in `packages/contracts/src/index.ts` (the only type
> source for both sides).

---

## 5. API endpoint(s) — recommended shape

**Recommendation: TWO endpoints (tree + lazy file-read).** This is the natural
split for an L story: the tree is cheap and loads on tab open; file contents
load only on click, so a large/binary file never bloats the tree payload, and
the contained-read is isolated to one auditable endpoint for Phase 5.5.

| Method | Path | Action | Auth |
|--------|------|--------|------|
| GET | `/api/projects/:name/layer` | Walk `<project.path>/.claude/project/`, return `LayerTreeResponse` | No (single local user — `multi_tenant: false`) |
| GET | `/api/projects/:name/layer/file?path=<rel>` | Contained read of one file, return `LayerFileResponse` | No |

### 5.1 `GET /api/projects/:name/layer` — status cases
- `200 LayerTreeResponse` — dir exists (populated → `nodes` filled; empty →
  `nodes: []`, `empty: true`, `has_layer: true`).
- `200 LayerTreeResponse` with `has_layer: false, nodes: [], empty: true` —
  registered project but **no `.claude/project/` dir** ("no project layer"
  state; mirrors S3 config-absent). Empty/absent is **200, not 404**.
- `404 NOT_FOUND` — `:name` not in the registry, OR `name` contains `/`/`\`/blank.
- `500 VAULT_UNREADABLE` — the vault registry itself is unreadable (reuses S1/S2
  error). A missing/unreadable **project path on disk** is NOT a 500: it
  degrades to `has_layer: false` (the project root is gone → no layer), surfaced
  as the "no project layer" state (live read, no swallow — §6 of the convention).

### 5.2 `GET /api/projects/:name/layer/file?path=<rel>` — status cases
- `200 LayerFileResponse` — `rel` resolved inside the layer root and is a file
  (content text, or `too_large`/`binary` with `content: null`).
- `400 BAD_REQUEST` — `path` query param absent/empty/malformed.
- `403 PATH_FORBIDDEN` — `rel` escaped the layer root (`..`, absolute, symlink
  out, NUL) OR resolved to a non-regular-file (dir, device). **Never reads.**
- `404 NOT_FOUND` — `:name` not registered, OR the contained file does not exist
  on disk (valid `rel`, but no such file). The error code distinguishes
  "forbidden" (escape attempt) from "not found" (legit miss) for the auditor.
- `500 VAULT_UNREADABLE` — vault registry unreadable.

> **Error envelope** is the uniform shape from `conventions/api-contract.md`:
> `{ error: { code, message, detail? } }`. Codes used:
> `NOT_FOUND | PATH_FORBIDDEN | BAD_REQUEST | VAULT_UNREADABLE`.

---

## 6. Affected Services & Repositories

File paths follow the Express layered architecture
(`route → service → repository → domain`) established by S1–S3 and
`kuraka.config.yaml#architecture.layers`.

| File | Action | Description |
|------|--------|-------------|
| `packages/contracts/src/index.ts` | ALTER | Add `LayerNode` (recursive), `LayerTreeResponse`, `LayerFileResponse` zod schemas + inferred types. |
| `backend/src/repositories/projectReader.ts` | ALTER (or new `layerReader.ts`) | Add `walkLayerTree(layerRoot)` (bounded, sorted, symlink-flagging) + `readLayerFile(layerRoot, rel)` (the **contained resolver** of §3 — the security core). Recommend a **new `layerReader.ts`** to keep the resolver isolated for Phase 5.5. |
| `backend/src/services/projectLayer.ts` | CREATE | Resolve `:name` → registry → `project.path` → layer root; orchestrate tree-walk; return the typed empty/`has_layer:false` state. |
| `backend/src/routes/projects.ts` | ALTER | Add the two `GET .../layer` and `.../layer/file` routes with the 404/400/403/500 mapping (§5). Reuse the existing `:name` guard. |
| `frontend/src/...ProjectDetail (Layer tab)` | ALTER/CREATE | Render the Project Layer tab: tree component (collapsible, jade dir icons / muted file icons) + preview pane; wire react-query to the two endpoints; first-class empty/forbidden/too-large/binary states. Exact paths per the frontend layout established by S2/S3 (refinement pins them). |
| `backend/src/repositories/layerReader.test.ts` | CREATE | Unit tests incl. **traversal attempts** (`../`, absolute, NUL, symlink-out), too-large, binary, empty-dir, absent-dir. |
| `backend/src/services/projectLayer.test.ts` | CREATE | Service tests incl. flag-drift (`has_project_layer` false but dir present, and vice-versa), missing project path. |

> No symbol is being removed/renamed in this story → the mandatory removal-grep
> rule does not trigger. New symbols only.

---

## 7. Dependencies & Risks

### Dependencies
- **S1** (registry / `findProjectByName`, `ProjectSummary.path`) — resolution chain.
- **S2** (Project Detail header + tabs shell) — the tab host exists.
- **S3** (Config tab) — the "absent/empty → first-class 200 state" pattern to mirror.
- Existing convention `conventions/fs-and-vault-safety.md` §5/§6 — the
  path-containment base this REQ specializes.

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Path traversal** (client-supplied `rel` escapes the layer root via `../`, absolute path, or symlink) | **High** | The §3 containment resolver: normalize-reject `..`/absolute/NUL, then `realpath` + `startsWith(realRoot + sep)`, then `isFile()`. Typed `403 PATH_FORBIDDEN`, never read. Dedicated **Phase 5.5** audit. |
| Symlink pointing outside the root (TOCTOU-ish) | Medium | Compare **realpaths** (resolves the symlink) at read time, not just at walk time; re-validate on each file read. |
| Large or binary file blows up the preview / payload | Medium | 1 MiB cap (`too_large`), NUL/non-UTF-8 binary detection (`binary`) → `content: null`, UI shows a "cannot preview" state. Lazy file-read endpoint keeps the tree payload small. |
| Deep/huge tree (pathological) hangs the walk | Low | `MAX_DEPTH` + `MAX_ENTRIES` caps with `truncated: true`. Live max depth ≈ 2. |
| **`has_project_layer` flag drift** (registry flag ≠ live dir) | Medium | **GATE0-confirmed**: backend stats the live dir; flag is a hint only. `has_layer` computed from disk. |
| Project path on disk missing/moved | Low | Degrade to `has_layer: false` (200), not a 500 — surfaced as "no project layer". |
| Leaking absolute server paths in errors | Low | `PATH_FORBIDDEN.detail` carries only the offending `rel`, never the resolved absolute path. |

---

## 8. Proposed Stories

**Recommendation: a BE/FE split behind the frozen contract** (allowed by
`workflow.parallel_implementation: true`, and the schema is frozen in Phase 3
before either starts). The security-critical work concentrates in S4a, so it
can be reviewed/tested independently; S4b consumes the typed contract.

| # | Title | Complexity | Dependencies |
|---|-------|------------|--------------|
| S4a | Backend: layer tree-walk + **contained file-read** + 2 endpoints + contracts (the §3 resolver is the heart; full traversal/limit test suite) | M | S1, S2 |
| S4b | Frontend: Project Layer tab — collapsible tree (jade/muted icons) + preview pane + empty/forbidden/too-large/binary states | M | S4a contract frozen |

> If refinement prefers a single S4, keep it — but the contract MUST be frozen
> (Phase 3) before implementation, and the Phase 5.5 security review is
> non-negotiable either way.

---

## GATE0 result (live-data validation — LL-010 / LL-008)

**PASS — no blocker; recommended decisions applied.**
- Sampled all 8 registered projects' live `.claude/project/` dirs.
- **Flag drift confirmed** (2/8): `bol-cert-no-deudor` flag=`false` but dir
  present; `sie_v2` flag=`true` but dir **absent** → contract computes
  `has_layer` from the live stat, never the flag.
- **"No project layer" is real**: `sie_v2` has none → first-class 200 empty
  state required (mirrors S3 config-absent).
- File shape: all `.md` except one 0-byte `.gitkeep`; largest file ~27 KB
  (1 MiB cap is generous); 0 symlinks today (defense still mandatory).
- Names are externally-owned → `z.string()`, **no `z.enum`** (LL-008); the only
  enum is the app-derived `type: "dir" | "file"` discriminator.
