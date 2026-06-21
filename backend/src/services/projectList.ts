/**
 * Service — project list use-case.
 *
 * Calls the registry repository, computes the `empty` flag, and returns a
 * validated ProjectListResponse. Does not touch fs directly (repository does).
 */
import { ProjectListResponse } from "@kuraka-control/contracts";
import { listProjects } from "../repositories/projectRegistry.js";
import { env } from "../config/env.js";

/**
 * Returns all registered projects from the vault registry.
 *
 * @throws {VaultUnreadableError} propagated from the repository when the vault
 *   projects directory is missing or unreadable.
 */
export async function getProjectList(): Promise<ProjectListResponse> {
  const projects = await listProjects({ vaultRoot: env.vaultRoot });

  return {
    projects,
    empty: projects.length === 0,
  };
}
