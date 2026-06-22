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

/** Detail = the frozen summary + computed drift. Composition, NOT redefinition. */
export const ProjectDetail = ProjectSummary.extend({
  drift: Drift,
});
export type ProjectDetail = z.infer<typeof ProjectDetail>;
