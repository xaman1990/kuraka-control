/**
 * Service — project layer use-case (S4).
 *
 * Orchestrates:
 *   getLayerTree: :name → registry → project.path → walkLayerTree → typed response.
 *   getLayerFile: :name → registry → project.path → readLayerFile → typed response.
 *
 * Returns "NOT_FOUND" sentinel when :name is not in the registry.
 * VaultUnreadableError (from findProjectByName) propagates to the route unchanged.
 * Absent layer dir degrades to has_layer:false (200), NOT a 404.
 *
 * Security: projectPath comes from the trusted registry `path` field.
 * The request-level :name is NEVER interpolated into a filesystem path.
 */
import type { LayerTreeResponse, LayerFileResponse } from "@kuraka-control/contracts";
import { env } from "../config/env.js";
import { findProjectByName } from "../repositories/projectReader.js";
import { walkLayerTree, readLayerFile } from "../repositories/layerReader.js";
import type { LayerReadResult } from "../repositories/layerReader.js";

export interface GetLayerOptions {
  vaultRoot?: string;
}

/**
 * Returns a LayerTreeResponse for the named project, or the sentinel "NOT_FOUND"
 * when the name is not in the registry.
 *
 * An absent .claude/project/ directory (has_layer:false) is a 200 response,
 * mirroring the S3 config-absent pattern.
 */
export async function getLayerTree(
  name: string,
  opts: GetLayerOptions = {},
): Promise<LayerTreeResponse | "NOT_FOUND"> {
  const vaultRoot = opts.vaultRoot ?? env.vaultRoot;

  const summary = await findProjectByName(name, { vaultRoot });
  if (summary === null) return "NOT_FOUND";

  // walkLayerTree never throws — absent dir degrades to has_layer:false.
  return walkLayerTree(summary.path);
}

/**
 * Returns a LayerFileResponse for a contained file, or a sentinel:
 *   "NOT_FOUND"  — :name not in registry.
 *   LayerReadResult — the typed containment result from readLayerFile
 *                     (may be "BAD_REQUEST", "FORBIDDEN", "NOT_FOUND", or a response).
 *
 * The route maps these to 400 / 403 / 404 / 200 respectively.
 */
export async function getLayerFile(
  name: string,
  rel: string,
  opts: GetLayerOptions = {},
): Promise<LayerFileResponse | LayerReadResult> {
  const vaultRoot = opts.vaultRoot ?? env.vaultRoot;

  const summary = await findProjectByName(name, { vaultRoot });
  if (summary === null) return "NOT_FOUND";

  return readLayerFile(summary.path, rel);
}
