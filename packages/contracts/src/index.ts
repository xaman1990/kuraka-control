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
  kuraka_version: z.string(),
  has_project_layer: z.boolean(),
  default_mode: z.string(),
  focus_scope: z.string().nullable(),
  status: z.enum(["active", "paused", "onboarding", "archived"]),
  last_mount: z.string().nullable(),
  last_sync: z.string().nullable(),
  tags: z.array(z.string()),
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
