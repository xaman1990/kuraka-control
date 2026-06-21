/**
 * Repository — reads <vault>/projects/*.md and returns ProjectSummary[].
 *
 * Fs access is isolated here; domain layer stays pure.
 * Per-file faults (bad YAML, missing name) are silently skipped (stderr log).
 * Dir missing/unreadable throws VaultUnreadableError for the route to map to 500.
 */
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { parseProjectFrontmatter } from "../domain/project.js";
import type { ProjectSummary } from "@kuraka-control/contracts";

/** Typed error thrown when the vault projects directory is missing or unreadable. */
export class VaultUnreadableError extends Error {
  readonly vaultPath: string;

  constructor(vaultPath: string, cause?: unknown) {
    super(`Cannot read the Kuraka vault at: ${vaultPath}`);
    this.name = "VaultUnreadableError";
    this.vaultPath = vaultPath;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export interface ProjectRegistryOptions {
  /** Absolute path to the vault root (injected so tests can use a temp dir). */
  vaultRoot: string;
}

/**
 * Walks `<vaultRoot>/projects/*.md`, parses frontmatter, and returns all valid
 * ProjectSummary records. Malformed files are skipped (logged to stderr).
 *
 * @throws {VaultUnreadableError} when the projects directory is missing or unreadable.
 */
export async function listProjects(
  options: ProjectRegistryOptions,
): Promise<ProjectSummary[]> {
  const projectsDir = path.join(options.vaultRoot, "projects");

  let entries: Dirent[];
  try {
    entries = await fs.readdir(projectsDir, { withFileTypes: true });
  } catch (err) {
    throw new VaultUnreadableError(projectsDir, err);
  }

  const mdFiles = entries.filter(
    (e) => e.isFile() && e.name.endsWith(".md"),
  );

  const results: ProjectSummary[] = [];

  for (const entry of mdFiles) {
    const filePath = path.join(projectsDir, entry.name);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = matter(content);
      const summary = parseProjectFrontmatter(parsed.data);
      if (summary === null) {
        process.stderr.write(
          `[projectRegistry] skipped ${entry.name}: invalid or missing required fields\n`,
        );
        continue;
      }
      results.push(summary);
    } catch (err) {
      process.stderr.write(
        `[projectRegistry] skipped ${entry.name}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  return results;
}
