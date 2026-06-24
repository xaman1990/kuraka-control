/**
 * @kuraka-control/contracts
 *
 * The single source of truth for the HTTP API seam between backend (validation)
 * and frontend (types). zod schemas here; `z.infer` types both sides.
 *
 * Seeded by arki — minimal shapes for S1 (registry). Stories add schemas as
 * endpoints are built. See docs/arquitectura/adr-002-layout-workspaces.md.
 */
import { z } from "zod";

/** Per-agent color key — matches the 16 `--ag-*` tokens in tokens.css. */
export const AgentKey = z.enum([
  "amauta",
  "arki",
  "inti",
  "architect-reviewer",
  "code-reviewer",
  "backend-developer",
  "frontend-developer",
  "story-refiner",
  "deployment-verifier",
  "e2e-tester",
  "test-engineer",
  "final-auditor",
  "migration-reviewer",
  "pattern-detector",
  "po-analyst",
  "security-reviewer",
]);
export type AgentKey = z.infer<typeof AgentKey>;

/** Two-color governance (C6 / ADR-007). */
export const Governance = z.enum(["framework", "project"]);
export type Governance = z.infer<typeof Governance>;

/** Uniform error envelope (no silent failure — conventions/api-contract.md). */
export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    detail: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

/** Registry entry — projection of <vault>/projects/*.md frontmatter (S1). */
export const ProjectSummary = z.object({
  name: z.string(),
  path: z.string(),
  stack: z.string(),
  kuraka_version: z.coerce.string(),
  has_project_layer: z.boolean(),
  default_mode: z.string(),
  status: z.string(),
  repo_url: z.string().nullable(),
  focus_scope: z.string().nullable(),
  last_mount: z.string().nullable(),
  last_sync: z.string().nullable(),
  tags: z.array(z.string()),
  governance: z.literal("project"),
});
export type ProjectSummary = z.infer<typeof ProjectSummary>;

export const ProjectListResponse = z.object({
  projects: z.array(ProjectSummary),
  empty: z.boolean(),
});
export type ProjectListResponse = z.infer<typeof ProjectListResponse>;

/** Governance action result — surfaces subprocess facts (ADR-005). */
export const ActionResult = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number(),
  requiresRestart: z.boolean().optional(),
});
export type ActionResult = z.infer<typeof ActionResult>;

// ---- S2: Project Detail + Drift ------------------------------------------------

/** Drift state — app-owned closed vocabulary (LL-008 → z.enum is correct). */
export const DriftState = z.enum([
  "up_to_date",   // lock == vault  (segment-wise equal)
  "behind",       // lock <  vault
  "ahead",        // lock >  vault  (vault rolled back / pre-release lock)
  "not_pinned",   // no readable kuraka.lock on disk  (MAJORITY: 7/8 today)
  "unknown",      // vault version unreadable OR either version not semver
]);
export type DriftState = z.infer<typeof DriftState>;

export const Drift = z.object({
  state: DriftState,
  lock_version: z.string().nullable(),           // <project>/kuraka.lock kuraka_version; null if absent/unreadable/missing-field
  vault_version: z.string().nullable(),          // DEFAULT_VERSION from kuraka-init.py; null if unreadable/regex-miss
  registry_version: z.string(),                  // mirror of ProjectSummary.kuraka_version (already string in S1)
  registry_matches_lock: z.boolean().nullable(), // null when lock_version is null (nothing to compare)
});
export type Drift = z.infer<typeof Drift>;

// ---- S3: Project Config projection ----------------------------------------------

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

/** Detail = frozen summary + S2 drift + S3 config. Composition, NOT redefinition.
 *  drift FROZEN by SCHEMA-FROZEN-S2 — unchanged. */
export const ProjectDetail = ProjectSummary.extend({
  drift: Drift,                      // FROZEN by SCHEMA-FROZEN-S2 — unchanged
  config: ProjectConfig.nullable(),  // null = no/unreadable/malformed config file
});
export type ProjectDetail = z.infer<typeof ProjectDetail>;

// ---- S4: Project Layer tree + file-read -------------------------------------

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
    name: z.string(),                        // basename, externally-owned → z.string()
    type: z.enum(["dir", "file"]),           // APP-DERIVED discriminator — the ONLY enum (LL-008)
    rel_path: z.string(),                    // POSIX rel path under the layer root
    size_bytes: z.number().nullable(),       // file: stat.size; dir: null
    children: z.array(LayerNode).optional(), // present iff type === "dir"
  }),
);

export const LayerTreeResponse = z.object({
  has_layer: z.boolean(),                    // computed from LIVE dir stat, NOT registry flag
  root_rel: z.string(),                      // constant ".claude/project"
  nodes: z.array(LayerNode),                 // [] when dir absent OR empty
  empty: z.boolean(),                        // true ⇔ has_layer && nodes.length === 0
  truncated: z.boolean(),                    // true ⇔ MAX_DEPTH or MAX_ENTRIES cap hit
});
export type LayerTreeResponse = z.infer<typeof LayerTreeResponse>;

export const LayerFileResponse = z.object({
  rel_path: z.string(),                      // echo of the VALIDATED rel (never the abs path)
  name: z.string(),                          // basename
  content: z.string().nullable(),            // null ⇔ too_large || binary
  size_bytes: z.number(),                    // actual stat.size on disk
  truncated: z.boolean(),                    // reserved; v1 ALWAYS false
  too_large: z.boolean(),                    // true ⇔ size_bytes > LAYER_FILE_MAX_BYTES
  binary: z.boolean(),                       // true ⇔ NUL byte in first BINARY_SAMPLE_BYTES
});
export type LayerFileResponse = z.infer<typeof LayerFileResponse>;
