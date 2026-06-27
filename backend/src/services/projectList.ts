/**
 * Service — project list use-case.
 *
 * Calls the registry repository, computes the `empty` flag, and returns a
 * validated ProjectListResponse. Does not touch fs directly (repository does).
 */
import { ProjectListResponse } from "@kuraka-control/contracts";
import { listProjects } from "../repositories/projectRegistry.js";
import { env } from "../config/env.js";

export interface GetProjectListOptions {
  vaultRoot?: string;
}

/**
 * Returns all registered projects from the vault registry.
 *
 * @param options.vaultRoot — vault root override for tests (defaults to env.vaultRoot).
 * @throws {VaultUnreadableError} propagated from the repository when the vault
 *   projects directory is missing or unreadable.
 */
export async function getProjectList(
  options: GetProjectListOptions = {},
): Promise<ProjectListResponse> {
  const vaultRoot = options.vaultRoot ?? env.vaultRoot;
  const projects = await listProjects({ vaultRoot });

  return {
    projects,
    empty: projects.length === 0,
  };
}
