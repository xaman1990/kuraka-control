/**
 * Service — project detail use-case (S2).
 *
 * Orchestrates: registry lookup → parallel fs reads → drift computation → assembly.
 * Does not touch fs directly — repository adapters do that.
 *
 * Returns "NOT_FOUND" (sentinel string) when the name is not in the registry.
 * VaultUnreadableError (from listProjects / findProjectByName) propagates to the
 * caller unchanged so the route can map it to 500.
 */
import type { ProjectDetail } from "@kuraka-control/contracts";
import { env } from "../config/env.js";
import { findProjectByName, readLockVersion, readProjectConfig, readVaultVersion } from "../repositories/projectReader.js";
import { computeDrift } from "../domain/drift.js";

export interface GetProjectDetailOptions {
  vaultRoot?: string;
}

/**
 * Returns a ProjectDetail for the named project, or the sentinel "NOT_FOUND"
 * when the name is not in the registry.
 *
 * Absent lock / unreadable vault version / missing project path on disk all
 * degrade to a drift state and return 200 — never 500 for those conditions.
 */
export async function getProjectDetail(
  name: string,
  opts: GetProjectDetailOptions = {},
): Promise<ProjectDetail | "NOT_FOUND"> {
  const vaultRoot = opts.vaultRoot ?? env.vaultRoot;

  const summary = await findProjectByName(name, { vaultRoot });
  if (summary === null) return "NOT_FOUND";

  // Read lock, vault version, and project config in parallel — none throws.
  const [lock_version, vault_version, config] = await Promise.all([
    readLockVersion(summary.path),
    readVaultVersion(vaultRoot),
    readProjectConfig(summary.path),   // S3 addition; never throws; null = absent/malformed
  ]);

  const state = computeDrift(lock_version, vault_version);

  // registry_matches_lock: null when lock is absent; string equality otherwise.
  const registry_matches_lock =
    lock_version === null ? null : lock_version === summary.kuraka_version;

  const drift = {
    state,
    lock_version,
    vault_version,
    registry_version: summary.kuraka_version,
    registry_matches_lock,
  };

  return { ...summary, drift, config };
}
