# SCHEMA-FROZEN-S3 — Project Detail `config` projection

> **FROZEN AT 2026-06-23T00:00:00Z — NO CHANGES DURING IMPLEMENTATION**
>
> Authoritative for Phase 4. Extends `SCHEMA-FROZEN-S2` (`ProjectDetail` + `drift`)
> and `SCHEMA-FROZEN-S1` (`ProjectSummary`). This freeze adds **one** field —
> `config: ProjectConfig | null` — onto `ProjectDetail` by **composition**.
> S2's `drift` and S1's `ProjectSummary` are untouched. Any deviation requires a
> new architect-review cycle, not an inline edit.

## 0. What this freezes

1. The EXACT zod for `ProjectConfig` (curated, permissive — [LL-008]).
2. The `ProjectDetail` composition `+ config` (does NOT redefine `drift`).
3. The raw-yaml → `ProjectConfig` **curation mapping** (yaml path → field, null-on-absent).
4. The **config-absent rule** (`config: null`, first-class, never 404/500).
5. The fs-safety boundary (path from trusted registry, safe yaml parse, no traversal).

---

## 1. EXACT zod for `packages/contracts/src/index.ts` (additions)

Append AFTER the frozen `Drift` / `ProjectDetail` block from S2. Do NOT touch
`ProjectSummary`, `DriftState`, `Drift`, `ApiError`, or `Governance`.

```ts
/** Curated projection of <project>/kuraka.config.yaml (S3).
 *  Every VALUE field mirrors an EXTERNALLY-OWNED vocabulary → z.string()/z.number(),
 *  ALL nullable. NO z.enum (LL-008). architecture_layers defaults to [] (never null).
 *  The raw parse is NOT validated strictly: unknown keys are curated away & ignored. */
export const ProjectConfig = z.object({
  backend_language: z.string().nullable(),   // stack.backend.language
  backend_framework: z.string().nullable(),  // stack.backend.framework
  frontend_language: z.string().nullable(),  // stack.frontend.language
  frontend_framework: z.string().nullable(), // stack.frontend.framework
  architecture_layers: z.array(z.string()),  // architecture.layers — [] when absent/empty/not-an-array
  state_mgmt: z.string().nullable(),         // stack.frontend.state_mgmt
  naming_language: z.string().nullable(),    // conventions.naming_language
  max_file_loc: z.number().nullable(),       // conventions.max_file_loc
  max_function_loc: z.number().nullable(),   // conventions.max_function_loc
  default_mode: z.string().nullable(),       // workflow.default_mode
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;

/** Detail = frozen summary + S2 drift + S3 config. Composition, NOT redefinition. */
export const ProjectDetail = ProjectSummary.extend({
  drift: Drift,                       // FROZEN by SCHEMA-FROZEN-S2 — unchanged
  config: ProjectConfig.nullable(),   // null = no/unreadable/malformed config file
});
export type ProjectDetail = z.infer<typeof ProjectDetail>;
```

> **Composition rule (FROZEN):** `config` is added as a sibling key inside the
> SAME `ProjectSummary.extend({ drift, config })` object literal that S2 froze
> (or a second `.extend({ config })` chained on the S2 shape — both are
> equivalent and acceptable). It is **NOT** a redefinition of `ProjectDetail`.
> `drift` MUST remain present and identical to SCHEMA-FROZEN-S2 §1.

### Frozen field rules

| Field | zod | Null / `[]` ⇔ | Notes |
|-------|-----|----------------|-------|
| `backend_language` | `z.string().nullable()` | `null` ⇔ `stack.backend.language` absent/non-string | externally-owned, open vocab |
| `backend_framework` | `z.string().nullable()` | `null` ⇔ `stack.backend.framework` absent/non-string | |
| `frontend_language` | `z.string().nullable()` | `null` ⇔ `stack.frontend.language` absent/non-string | frontend section may be absent entirely |
| `frontend_framework` | `z.string().nullable()` | `null` ⇔ `stack.frontend.framework` absent/non-string | |
| `architecture_layers` | `z.array(z.string())` | `[]` ⇔ `architecture.layers` absent / null / not-an-array | **NEVER null** — first-class empty list. Non-string members coerced/dropped (see §3). |
| `state_mgmt` | `z.string().nullable()` | `null` ⇔ `stack.frontend.state_mgmt` absent/non-string | open set {signals, zustand, redux, …} |
| `naming_language` | `z.string().nullable()` | `null` ⇔ `conventions.naming_language` absent/non-string | open {english, spanish, mixed} — **no z.enum** |
| `max_file_loc` | `z.number().nullable()` | `null` ⇔ `conventions.max_file_loc` absent OR not a number | do NOT coerce strings → number |
| `max_function_loc` | `z.number().nullable()` | `null` ⇔ `conventions.max_function_loc` absent OR not a number | do NOT coerce strings → number |
| `default_mode` | `z.string().nullable()` | `null` ⇔ `workflow.default_mode` absent/non-string | open {normal, brownfield} — **no z.enum** |

### Casing (FROZEN)
`config` and all sub-fields are **snake_case**, consistent with the S1/S2 seam.
The shared zod schema is the single type source on both sides
(`ProjectDetail.parse(json)` on the frontend).

---

## 2. Raw-yaml → `ProjectConfig` curation mapping (FROZEN)

The repository performs a **pure-ish curation** of the parsed yaml object into
the `ProjectConfig` shape. The function signature:

```
curateProjectConfig(raw: unknown): ProjectConfig
```

is **pure** (no fs, no env) and unit-testable in isolation. `readProjectConfig`
does the fs read + parse, then calls `curateProjectConfig` (or inlines the same
defensive reads). Either factoring is acceptable; the **mapping** below is frozen.

| `ProjectConfig` field | yaml path (optional-chained off `raw`) | Absent / wrong-type → |
|-----------------------|-----------------------------------------|------------------------|
| `backend_language` | `raw.stack?.backend?.language` | `null` |
| `backend_framework` | `raw.stack?.backend?.framework` | `null` |
| `frontend_language` | `raw.stack?.frontend?.language` | `null` |
| `frontend_framework` | `raw.stack?.frontend?.framework` | `null` |
| `state_mgmt` | `raw.stack?.frontend?.state_mgmt` | `null` |
| `architecture_layers` | `raw.architecture?.layers` | `[]` (when absent / null / not array). If array: keep string members; coerce/skip non-strings → produce `string[]`. |
| `naming_language` | `raw.conventions?.naming_language` | `null` |
| `max_file_loc` | `raw.conventions?.max_file_loc` | `null` unless `typeof === "number"` |
| `max_function_loc` | `raw.conventions?.max_function_loc` | `null` unless `typeof === "number"` |
| `default_mode` | `raw.workflow?.default_mode` | `null` |

### Mapping rules (FROZEN)

- **String fields:** assign only when `typeof value === "string"`; otherwise
  `null`. (A yaml value that parses as a number/boolean for a string slot → `null`,
  not `String(value)`. These slots are vocabularies, not stamps.)
- **Number fields** (`max_file_loc`, `max_function_loc`): assign only when
  `typeof value === "number"`; **do not coerce** a string `"400"` → `400`.
  Non-number → `null` (AC-B4).
- **`architecture_layers`:** `Array.isArray(raw.architecture?.layers)` →
  `.filter(x => typeof x === "string")` (drop non-string members);
  else `[]`. Never `null`.
- **Top-level `language`/`runtime` shape (waCert):** the curation reads ONLY the
  nested `stack.backend.*` / `stack.frontend.*` paths above. A config that puts
  `language`/`runtime` as **top-level siblings** of `backend`/`frontend` under
  `stack` simply yields `null` for the nested fields — **no crash, no special
  case** (those values are out of the curated subset; ignored by design).
- **Unknown extra keys** anywhere in `raw` (`auth`, `database`, `confidence`,
  `identifier_style`, `country_dimension`, …) are **ignored** — there is no
  strict schema on the raw parse, only on the curated output.
- **`raw` not a plain object** (string/array/number/null from a degenerate yaml)
  → whole-object `null` (see §3, handled by `readProjectConfig`, before curation).

### Live-validated against `kuraka.config.yaml` (this repo)

| Field | Live value |
|-------|-----------|
| `backend_language` | `"typescript"` (`stack.backend.language`, L26) |
| `backend_framework` | `"express"` (L27) |
| `frontend_language` | `"typescript"` (L36) |
| `frontend_framework` | `"react"` (L37) |
| `state_mgmt` | `"zustand"` (L39) |
| `architecture_layers` | populated list under `architecture.layers` (L57) |
| `naming_language` | `"english"` (L74) |
| `max_file_loc` | `400` (L79) |
| `max_function_loc` | `50` (L80) |
| `default_mode` | `"normal"` (L87) |

---

## 3. Config-absent rule (FROZEN — first-class `null`, mirrors S2 `not_pinned`)

`readProjectConfig(projectPath: string): Promise<ProjectConfig | null>` reads
`path.join(projectPath, "kuraka.config.yaml")` and **degrades to `null`, never
throws** — exactly like `readLockVersion` / `readVaultVersion` (verified live in
`backend/src/repositories/projectReader.ts`: `try { fs.readFile → yaml.parse } catch { return null }`).

Returns **`null`** (whole-object) when ANY of:

| Condition | Detection |
|-----------|-----------|
| File absent | `fs.readFile` `ENOENT` |
| File unreadable | `fs.readFile` `EACCES` (perm) |
| Malformed YAML | `yaml.parse` throws (caught) |
| Parsed value not a plain object | `typeof !== "object" \|\| parsed === null \|\| Array.isArray(parsed)` → `null` |

Returns a **populated `ProjectConfig`** (with per-field `null`/`[]`) when the
file parses to a plain object — even if **every** curated section is missing
(yields all-`null` + `layers: []`). A parseable-but-sparse config is NOT the
same as an absent config: sparse → object of nulls; absent → whole-object `null`.

### API behavior (FROZEN — extends SCHEMA-FROZEN-S2 §6)

`GET /api/projects/:name`:

- **200** → `ProjectDetail` = `{ ...summary, drift, config }`.
  `config` is a `ProjectConfig` object OR `null`.
- **`config: null` is NEVER 404 / 500.** Absent/unreadable/malformed config is a
  first-class state, mirroring `drift.state === "not_pinned"`. The route does NOT
  branch on config presence; the curated `null` flows straight to the response.
- **404** unchanged from S2 — only when `:name` is not in the registry
  (`ApiError` `code: "NOT_FOUND"`).
- **Never 500** for any config-file condition. (S2's "never 500 for fs" guarantee
  now also covers `kuraka.config.yaml`.)

### Service composition (FROZEN)

In `getProjectDetail` (`backend/src/services/projectDetail.ts`), add
`readProjectConfig(summary.path)` to the **existing `Promise.all`** and include
`config` in the assembled object:

```ts
const [lock_version, vault_version, config] = await Promise.all([
  readLockVersion(summary.path),
  readVaultVersion(vaultRoot),
  readProjectConfig(summary.path),   // ← S3 addition; never throws
]);
// ... existing drift assembly unchanged ...
return { ...summary, drift, config };   // config: ProjectConfig | null
```

`summary.path` is the trusted registry path (confirmed: `ProjectSummary.path`
exists, `packages/contracts/src/index.ts:50`).

---

## 4. fs-safety (FROZEN — unchanged trust boundary from S2 §4)

- **Path source = the registry's trusted `project.path`** (`summary.path`), joined
  via `path.join(projectPath, "kuraka.config.yaml")`. The request **`:name` is
  NEVER interpolated into a filesystem path** — it is only a registry lookup key
  (`findProjectByName`). No path-traversal surface added.
- **Safe parse:** `yaml.parse` (the `yaml` dep, already used by `readLockVersion`)
  performs **data-only** parsing — no code execution, no custom tags, no
  anchors-as-exec. NOT `JSON.parse` (the config has comments + bare scalars).
- **Read-only:** `fs.readFile` only. No write, no subprocess, no `child_process`,
  no `..`/symlink escape. Stays in the repository (fs-adapter) layer; the curation
  is pure (no fs). Same trust boundary as S2 — **Phase 5.5 skip is justified**.

---

## 5. Testability seams (FROZEN — for Phase 6)

- `curateProjectConfig(raw)` — **pure**, unit-testable with hand-built `raw`
  objects (full, partial, empty `stack:`, top-level-`language` shape, non-object).
- `readProjectConfig(projectPath)` — testable with **temp dirs** (write a fixture
  `kuraka.config.yaml`, assert the curated result; omit the file → `null`; write
  malformed yaml → `null`). Identical fixture pattern to `readLockVersion` tests.
- `getProjectDetail` — assert `config` populated when fixture present, `config: null`
  when absent; **both return the 200 `ProjectDetail` shape** (no throw).

Required test vectors (FROZEN, from story T1–T4):
1. Full config → all 10 fields populated.
2. Partial (frontend-only, no `state_mgmt`) → those fields `null`, present ones set.
3. Empty `stack:` → all 4 stack fields + `state_mgmt` `null`; `layers: []` if no `architecture`.
4. Absent file → whole-object `null`.
5. Malformed YAML → whole-object `null`.
6. Top-level `stack.language` (waCert) shape → no crash; nested fields `null`.
7. `max_file_loc: "400"` (string) → `null` (no coercion).

---

**FROZEN AT 2026-06-23T00:00:00Z — NO CHANGES DURING IMPLEMENTATION**
