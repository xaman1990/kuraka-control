/**
 * Service — triage list use-case (S5a, READ-ONLY).
 *
 * Calls the triage reader repository, computes the `empty` flag, and returns a
 * validated TriageListResponse. Does not touch fs directly (repository does).
 */
import type { TriageListResponse } from "@kuraka-control/contracts";
import { listTriageDocs } from "../repositories/triageReader.js";
import { env } from "../config/env.js";

export interface GetTriageListOptions {
  vaultRoot?: string;
}

/**
 * Returns all triage docs from the vault retro-triage store.
 *
 * @param options.vaultRoot — vault root override for tests (defaults to env.vaultRoot).
 * @throws {VaultUnreadableError} propagated from the repository when the vault
 *   retro-triage directory is missing or unreadable.
 */
export async function getTriageList(
  options: GetTriageListOptions = {},
): Promise<TriageListResponse> {
  const vaultRoot = options.vaultRoot ?? env.vaultRoot;
  const docs = await listTriageDocs({ vaultRoot });

  return {
    docs,
    empty: docs.length === 0,
  };
}
