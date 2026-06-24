# SCHEMA-FROZEN-S4 — Project Layer browser (tree + contained file-read)

> **FROZEN AT 2026-06-24T00:00:00Z — NO CHANGES DURING IMPLEMENTATION**
>
> Authoritative for **Phase 4 (implementation)** AND the **Phase 5.5 security
> checklist**. S4's tree/file are **SEPARATE endpoints**, NOT part of
> `ProjectDetail` — they do not extend or touch `SCHEMA-FROZEN-S1/S2/S3`
> (`ProjectSummary`, `Drift`, `ProjectConfig` are untouched). Any deviation
> requires a new architect-review cycle, not an inline edit.

## 0. What this freezes

1. The EXACT zod for `LayerNode` (recursive via `z.lazy`), `LayerTreeResponse`,
   `LayerFileResponse`.
2. The EXACT **containment algorithm** for the file-read resolver (copy-ready,
   with the pre-resolve rejections and the `+ path.sep` boundary).
3. The **caps** as named module-level constants.
4. The **binary / too-large** rules (stat-before-read).
5. The **two-endpoint** shape + the 200/400/403/404/500 error mapping.

This freeze ALIGNS with `.claude/project/conventions/fs-and-vault-safety.md`
§5 (path containment: reject `..`/symlink escapes), §6 (live reads, no stale
cache), and §1 (read-only — S4 calls no writer/spawner).

---

## 1. EXACT zod for `packages/contracts/src/index.ts` (additions)

Append as a **new, self-contained block** (NOT inside `ProjectSummary.extend`).
Do NOT touch `ProjectSummary`, `DriftState`, `Drift`, `ProjectConfig`,
`ProjectDetail`, `ApiError`, or `Governance`.

```ts
/** Recursive layer tree node. z.lazy is REQUIRED for the self-reference;
 *  an explicit type annotation (LayerNodeShape) is REQUIRED for z.lazy. */
export type LayerNodeShape = {
  name: string;
  type: "dir" | "file";
  rel_path: string;
  size_bytes: number | null;
  children?: LayerNodeShape[];
};

export const LayerNode: z.ZodType<LayerNodeShape> = z.lazy(() =>
  z.object({
    name: z.string(),                       // basename, externally-owned → z.string()
    type: z.enum(["dir", "file"]),          // APP-DERIVED discriminator — the ONLY enum (LL-008)
    rel_path: z.string(),                   // POSIX rel path under the layer root
    size_bytes: z.number().nullable(),      // file: stat.size; dir: null
    children: z.array(LayerNode).optional(),// present iff type === "dir"
  }),
);

export const LayerTreeResponse = z.object({
  has_layer: z.boolean(),                   // computed from LIVE dir stat, NOT registry flag
  root_rel: z.string(),                     // constant ".claude/project"
  nodes: z.array(LayerNode),                // [] when dir absent OR empty
  empty: z.boolean(),                       // true ⇔ has_layer && nodes.length === 0
  truncated: z.boolean(),                   // true ⇔ MAX_DEPTH or MAX_ENTRIES cap hit
});
export type LayerTreeResponse = z.infer<typeof LayerTreeResponse>;

export const LayerFileResponse = z.object({
  rel_path: z.string(),                     // echo of the VALIDATED rel (never the abs path)
  name: z.string(),                         // basename
  content: z.string().nullable(),           // null ⇔ too_large || binary
  size_bytes: z.number(),                   // actual stat.size on disk
  truncated: z.boolean(),                   // reserved; v1 ALWAYS false
  too_large: z.boolean(),                   // true ⇔ size_bytes > LAYER_FILE_MAX_BYTES
  binary: z.boolean(),                      // true ⇔ NUL byte in first BINARY_SAMPLE_BYTES
});
export type LayerFileResponse = z.infer<typeof LayerFileResponse>;
```

### Frozen field-nullability coherence (these biconditionals MUST hold)

**`LayerNode`:**
- `type === "file"` ⇒ `size_bytes` is a `number` (from `stat.size`) AND
  `children` is **absent** (key omitted).
- `type === "dir"` ⇒ `size_bytes === null` AND `children` is **present**
  (an array, possibly empty). The frozen contract types `size_bytes` as
  `z.number().nullable()` (dir → `null`); the REQ's "size_bytes optional on
  dirs" prose is RESOLVED to **`null` on dirs** (one field shape, not optional).

**`LayerTreeResponse`:**
- `empty === true` ⇔ `has_layer === true && nodes.length === 0`.
  (Absent dir → `has_layer:false, nodes:[], empty:true` — see §4.)
- `truncated` is a **required boolean** (`z.boolean()`), default `false`.
  The REQ §4.2 marked it `truncated?` (optional); the frozen contract makes it
  **required** to match the story C1 zod (`truncated: z.boolean()`) and remove
  ambiguity on the seam. Backend MUST always emit it.

**`LayerFileResponse` (FROZEN biconditional):**
- `content === null` ⇔ (`too_large === true` OR `binary === true`).
- `too_large === true` ⇒ `binary === false` AND the file was **never read**
  (stat-before-read, §3 cap). `size_bytes` is still the real size.
- `binary === true` ⇒ `too_large === false` (size was within cap, file WAS read
  to sample the prefix).
- Empty file (`size_bytes === 0`) ⇒ `content === ""`, `binary === false`,
  `too_large === false`. Empty is NOT an error (`.gitkeep` precedent;
  api-contract.md "empty is not an error").
- `truncated` is ALWAYS `false` in v1 (whole-file-or-null; reserved field).

### Casing (FROZEN)
All fields **snake_case** — pure projection of an external fs source
(api-contract.md "seam casing mirrors the source 1:1; no camelCase boundary").
The shared zod schema is the single type source on both sides
(`LayerTreeResponse.parse(json)` / `LayerFileResponse.parse(json)` on the
frontend). `type: z.enum(["dir","file"])` is the ONLY enum (app-derived); all
other strings are `z.string()` (LL-008).

---

## 2. Caps — module-level named constants (FROZEN — no magic numbers)

Declared at the top of `backend/src/repositories/layerReader.ts`:

```ts
export const LAYER_FILE_MAX_BYTES = 1_048_576; // 1 MiB — preview size cap
export const BINARY_SAMPLE_BYTES  = 8192;      // bytes scanned for a NUL (0x00)
export const MAX_DEPTH            = 8;          // tree-walk depth cap
export const MAX_ENTRIES          = 2000;       // tree-walk total-node cap
export const LAYER_ROOT_REL       = ".claude/project"; // constant root_rel
```

- Exceeding `MAX_DEPTH` or `MAX_ENTRIES` → stop descending / stop adding nodes,
  set `truncated: true`, return the partial tree (never hang).
- `size_bytes > LAYER_FILE_MAX_BYTES` → `too_large: true`, `content: null`,
  **file is NEVER read into memory** (the `stat.size` check happens BEFORE any
  `fs.readFile`).
- Binary detection: read the (within-cap) file into a `Buffer`, scan the first
  `BINARY_SAMPLE_BYTES` bytes for `0x00`; if found → `binary: true`,
  `content: null`.

---

## 3. EXACT containment algorithm (FROZEN — Phase 5.5 audits this verbatim)

`readLayerFile(projectPath: string, rel: string)` — `projectPath` is the
**trusted** registry `project.path` (never the request `:name`). `rel` is
**fully untrusted** (client-supplied). The resolver returns a typed result;
the route maps it to 400/403/404/200.

```ts
import path from "node:path";
import { promises as fs } from "node:fs";

// Result sentinels (the route maps each to an HTTP status):
//   "BAD_REQUEST"  → 400   (empty/missing rel)
//   "FORBIDDEN"    → 403   (escape attempt OR non-regular-file)
//   "NOT_FOUND"    → 404   (rel valid & contained, but no such file on disk)
//   LayerFileResponse → 200

async function readLayerFile(projectPath: string, rel: string) {
  // ── Step 1 — pre-resolve rejections (NO fs touch) ─────────────────────────
  if (rel === undefined || rel === null || rel === "") return "BAD_REQUEST";
  if (rel.includes("\0")) return "FORBIDDEN";          // NUL byte
  if (path.isAbsolute(rel)) return "FORBIDDEN";        // POSIX absolute (/etc/…)
  if (/^[A-Za-z]:[\\/]/.test(rel)) return "FORBIDDEN"; // Windows drive (C:\…) —
                                                       //   path.isAbsolute is
                                                       //   FALSE on POSIX, so an
                                                       //   explicit guard is needed
  const normalized = path.normalize(rel);
  if (normalized.startsWith("..")) return "FORBIDDEN";             // "../x", ".."
  if (normalized.split(path.sep).includes("..")) return "FORBIDDEN"; // any ".." seg

  // ── Step 2 — resolve under the trusted layer root ─────────────────────────
  const root      = path.resolve(projectPath, LAYER_ROOT_REL); // ".claude/project"
  const candidate = path.resolve(root, rel);

  // ── Step 3 — realpath BOTH sides (resolves symlinks) ──────────────────────
  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = await fs.realpath(root);
  } catch {
    // Root itself unresolvable (project path moved / no layer dir):
    // the file cannot exist → 404 (NOT a 500). The tree endpoint reports
    // has_layer:false for the same condition (§4).
    return "NOT_FOUND";
  }
  try {
    realTarget = await fs.realpath(candidate);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return "NOT_FOUND"; // legit miss
    if (code === "EACCES") return "FORBIDDEN";                       // perm denied
    return "NOT_FOUND"; // any other realpath failure → treat as not-found, never 500
  }

  // ── Step 4 — containment check (EXACT boundary — the security seam) ────────
  // realRoot equality alone would let the ROOT DIR itself pass; Step 5 rejects
  // it (dir, not a file). The `+ path.sep` is REQUIRED so "/x/proj-evil" cannot
  // pass a naive startsWith("/x/proj"). Compare REALPATHS so a symlink whose
  // target escapes the root is caught here.
  if (realTarget !== realRoot &&
      !realTarget.startsWith(realRoot + path.sep)) {
    return "FORBIDDEN";
  }

  // ── Step 5 — must be a regular file ───────────────────────────────────────
  const stat = await fs.stat(realTarget);       // realTarget already exists (Step 3)
  if (!stat.isFile()) return "FORBIDDEN";        // dir / FIFO / socket / device

  // ── Step 6 — caps + binary (stat-before-read) ─────────────────────────────
  const size_bytes = stat.size;
  if (size_bytes > LAYER_FILE_MAX_BYTES) {
    return { rel_path: rel, name: path.basename(rel), content: null,
             size_bytes, truncated: false, too_large: true, binary: false };
  }
  const buf = await fs.readFile(realTarget);     // safe: size already within cap
  const sample = buf.subarray(0, BINARY_SAMPLE_BYTES);
  if (sample.includes(0x00)) {
    return { rel_path: rel, name: path.basename(rel), content: null,
             size_bytes, truncated: false, too_large: false, binary: true };
  }
  return { rel_path: rel, name: path.basename(rel), content: buf.toString("utf8"),
           size_bytes, truncated: false, too_large: false, binary: false };
}
```

### Frozen security invariants (Phase 5.5 checklist — must ALL hold)

| # | Invariant | Where |
|---|-----------|-------|
| SEC1 | `..` traversal rejected before any fs touch (`startsWith("..")` + `.includes("..")` segment check on the **normalized** path) | Step 1 |
| SEC2 | Absolute paths rejected before any fs touch — **both** POSIX (`path.isAbsolute`) **and** Windows-drive (`/^[A-Za-z]:[\\/]/`) | Step 1 |
| SEC3 | NUL byte (`\0`) rejected before any fs touch | Step 1 |
| SEC4 | Symlink whose realpath escapes the root → 403 (realpath of candidate + `startsWith` on realpaths) | Steps 3–4 |
| SEC5 | No absolute server path in any 403/404 body — `detail` carries only `{ rel }` | route mapping (§5) |
| SEC6 | File content NEVER read when `size_bytes > LAYER_FILE_MAX_BYTES` (stat-before-read) | Step 6 |
| SEC7 | `layerReader.ts` has ZERO `fs.writeFile` / `fs.mkdir` / `fs.rm` / `spawn` / `exec` | whole module |
| SEC8 | `fs.realpath` called on BOTH `root` and `candidate` before the `startsWith` compare | Step 3 |
| SEC9 | `realpath(root)` failure → 404, never a 500/crash (project moved / no layer dir) | Step 3 |
| SEC10 | The resolved absolute path is NEVER echoed; `rel_path` echoes the **validated `rel`**, not `realTarget` | Step 6 / §5 |

> **Audit note (ordering is load-bearing):** Step 1 rejections run BEFORE Step 3
> realpath, so a malicious `rel` never reaches the filesystem. Step 4 uses
> **realpaths** (not `candidate`) so an intermediate symlinked directory that
> escapes the root is caught (realpath resolves the whole chain). Step 5 runs
> AFTER containment so a contained-but-non-file (the root dir itself via
> `rel="."`, a FIFO, a device) is rejected as 403, never read.

---

## 4. Tree walk (FROZEN behavior)

`walkLayerTree(layerRoot, projectPath)` (in `layerReader.ts`):

- **Ordering:** within each level, **dirs first then files**, each group sorted
  alphabetically by `name` (deterministic). Dotfiles (`.gitkeep`) are
  **included** (visible).
- **`rel_path`:** POSIX relative path under the layer root (`path.posix`
  join of ancestor names), e.g. `conventions/typescript.md`. This is the exact
  value the file-read endpoint takes back as `?path=`.
- **Symlinks:** use `withFileTypes` / `dirent.isSymbolicLink()`. Symlinked
  **directories are NOT followed** (no descent). Symlinked **files** appear as
  file entries and are **re-validated on read** by the §3 realpath check.
- **`size_bytes`:** files → `stat.size`; dirs → `null`.
- **Caps:** stop at `MAX_DEPTH` / `MAX_ENTRIES`, set `truncated: true`, return
  the partial tree.
- **`has_layer`:** computed from a **live `fs.stat`** of `layerRoot`
  (`isDirectory()`), **NEVER** from the registry `has_project_layer` flag
  (flag-drift is GATE0-confirmed: `bol-cert-no-deudor` flag=false but present;
  `sie_v2` flag=true but absent).

---

## 5. Endpoints + error mapping (FROZEN — two endpoints)

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/projects/:name/layer` | `200 LayerTreeResponse` |
| GET | `/api/projects/:name/layer/file?path=<rel>` | `200 LayerFileResponse` |

Resolution chain (both stages **trusted-on-the-left**): `:name` → registry
(`findProjectByName`) → `project.path` → `path.resolve(projectPath,
".claude/project")`. **`:name` is NEVER interpolated into a path** — only a
registry lookup key. Reuse the existing `:name` guard in `routes/projects.ts`
(rejects blank / `/` / `\` → 404). Add `ERROR_CODE_PATH_FORBIDDEN =
"PATH_FORBIDDEN"` and `ERROR_CODE_BAD_REQUEST = "BAD_REQUEST"` constants
alongside the existing `ERROR_CODE_NOT_FOUND` / `ERROR_CODE_VAULT_UNREADABLE`.

### `GET /api/projects/:name/layer`

| Status | When | Body |
|--------|------|------|
| 200 | dir exists (populated) | `LayerTreeResponse` `has_layer:true`, `nodes` filled |
| 200 | dir exists but empty | `has_layer:true, nodes:[], empty:true` |
| 200 | no `.claude/project/` dir, OR project path missing on disk | `has_layer:false, nodes:[], empty:true, truncated:false` |
| 404 | `:name` not in registry, OR `name` has `/`/`\`/blank | `ApiError NOT_FOUND`, `detail:{name}` |
| 500 | the **vault registry** itself is unreadable (`VaultUnreadableError`) | `ApiError VAULT_UNREADABLE` |

> A missing/unreadable **project path on disk** is NOT a 500 — it degrades to
> `has_layer:false` (200), mirroring S3 config-absent (fs-and-vault-safety §6:
> typed empty result, never swallow).

### `GET /api/projects/:name/layer/file?path=<rel>`

| Status | When | Body |
|--------|------|------|
| 200 | `rel` contained + regular file | `LayerFileResponse` (content, or `too_large`/`binary` with `content:null`) |
| 400 | `path` query absent/empty | `ApiError BAD_REQUEST`, `detail:{rel:""}` |
| 403 | escape (`..`/absolute/Windows-drive/NUL/symlink-out) OR non-regular-file | `ApiError PATH_FORBIDDEN`, `detail:{rel}` **only** |
| 404 | `:name` not registered, OR contained file does not exist (ENOENT/ENOTDIR), OR layer root unresolvable | `ApiError NOT_FOUND`, `detail:{rel}` |
| 500 | vault registry unreadable | `ApiError VAULT_UNREADABLE` |

Uniform envelope (api-contract.md): `{ error: { code, message, detail? } }`.
Codes used by S4: `NOT_FOUND | PATH_FORBIDDEN | BAD_REQUEST | VAULT_UNREADABLE`.
**403/404 `detail` carries ONLY `{ rel }`** — never the resolved absolute path
(leak-avoidance, SEC5/SEC10).

> **`name` guard wins on the file endpoint too:** when `:name` has `/`/`\`/blank,
> return 404 (registry-not-found semantics) BEFORE looking at `?path` — the same
> guard the tree endpoint and S2 use. The two-stage chain rejects an unknown
> `:name` as 404 prior to any containment work.

---

## 6. Layering (FROZEN)

| Layer | File | Responsibility |
|-------|------|----------------|
| repository (fs-adapter) | `backend/src/repositories/layerReader.ts` (CREATE) | `walkLayerTree` + `readLayerFile` (the §3 resolver). The ONLY place that touches the layer fs. Read-only. |
| service | `backend/src/services/projectLayer.ts` (CREATE) | `getLayerTree(name, opts)` + `getLayerFile(name, rel, opts)`: `:name`→registry→`project.path`→layer root; orchestrate; assemble typed responses; return `"NOT_FOUND"` sentinel when name absent. Thin. |
| route | `backend/src/routes/projects.ts` (ALTER) | the two `GET .../layer*` routes + status mapping (§5). Reuse `:name` guard + add `PATH_FORBIDDEN`/`BAD_REQUEST` codes. |
| contracts | `packages/contracts/src/index.ts` (ALTER) | the §1 zod block. Single type source both sides. |
| frontend | `frontend/src/api/projectLayer.ts`, `components/LayerCard.tsx`, `components/LayerPreview.tsx`, `routes/ProjectDetailShell.tsx` | API-only consumption; no fs. `ForbiddenError` mirrors the existing `NotFoundError` in `api/projectDetail.ts`. |

Reads hit disk **live per request** (no cache — fs-and-vault-safety §6). The
resolver is isolated in `layerReader.ts` so Phase 5.5 audits ONE file.

---

## 7. Testability seams (FROZEN — for Phase 6)

`readLayerFile` and `walkLayerTree` take `projectPath` (a temp dir) as an
argument → fully unit-testable with crafted inputs. Required vectors:

- **Containment (real temp dir + crafted inputs, prefer over mocks):**
  `../`, `../../etc/passwd`, `a/../../etc` → 403; absolute `/etc/passwd` → 403;
  Windows-drive `C:\x` → 403; NUL byte in `rel` → 403; **real symlink** (create
  a temp dir, `fs.symlink` to `/tmp`, request through it) escaping the root →
  403; `rel` resolving to a directory (incl. `rel="."`) → 403; valid contained
  `rel` but no file (ENOENT) → 404.
- **Caps/binary:** file `> LAYER_FILE_MAX_BYTES` → `too_large:true, content:null`
  (assert file NOT read — e.g. spy/large-fixture); NUL in first
  `BINARY_SAMPLE_BYTES` → `binary:true, content:null`; empty file →
  `content:"", binary:false, too_large:false`; valid text → `content` is the text.
- **Tree:** dirs-first-then-files alpha order; symlinked dir not followed;
  `MAX_DEPTH` cap → `truncated:true`; `MAX_ENTRIES` cap → `truncated:true`;
  absent layer dir → `has_layer:false`.
- **Service (flag-drift):** `has_project_layer:false` + dir present →
  `has_layer:true`; `has_project_layer:true` + dir absent → `has_layer:false`;
  project path missing → `has_layer:false, nodes:[], empty:true`; unknown name →
  `"NOT_FOUND"` sentinel.
- Imports at module top only; backend test imports use the `.js` ESM extension.

---

**FROZEN AT 2026-06-24T00:00:00Z — NO CHANGES DURING IMPLEMENTATION**
