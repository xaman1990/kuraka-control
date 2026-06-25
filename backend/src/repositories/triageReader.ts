/**
 * Repository — reads <vault>/retro-triage/*.md and returns TriageDoc[].
 *
 * Mirrors projectRegistry.ts patterns:
 *   - Missing/unreadable dir → throws VaultUnreadableError (reused from projectRegistry).
 *   - Per-file errors → skip + stderr log, never abort the batch.
 *   - Files whose basename starts with "_" (e.g. _TEMPLATE.md) are excluded.
 *
 * Fs access is isolated here; domain layer stays pure.
 */
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import type { TriageDoc } from "@kuraka-control/contracts";
import { parseTriageDoc } from "../domain/triage.js";
import { VaultUnreadableError } from "./projectRegistry.js";

export interface TriageReaderOptions {
  /** Absolute path to the vault root (injected so tests can use a temp dir). */
  vaultRoot: string;
}

/**
 * Walks `<vaultRoot>/retro-triage/*.md`, excluding `_*` files (templates).
 * Parses each; returns all valid TriageDoc records.
 * Malformed files are skipped (logged to stderr).
 *
 * @throws {VaultUnreadableError} when the retro-triage directory is missing or unreadable.
 */
export async function listTriageDocs(
  options: TriageReaderOptions,
): Promise<TriageDoc[]> {
  const triageDir = path.join(options.vaultRoot, "retro-triage");

  let entries: Dirent[];
  try {
    entries = await fs.readdir(triageDir, { withFileTypes: true });
  } catch (err) {
    throw new VaultUnreadableError(options.vaultRoot, err);
  }

  const mdFiles = entries.filter(
    (e) =>
      e.isFile() &&
      e.name.endsWith(".md") &&
      !e.name.startsWith("_"),
  );

  const results: TriageDoc[] = [];

  for (const entry of mdFiles) {
    const filePath = path.join(triageDir, entry.name);
    const id = entry.name.replace(/\.md$/, "");

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = parseTriageDoc(content);
      results.push({ id, ...parsed });
    } catch (err) {
      process.stderr.write(
        `[triageReader] skipped ${entry.name}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  return results;
}
