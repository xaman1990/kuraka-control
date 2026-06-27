/**
 * Repository — project detail fs-adapters (S2).
 *
 * Provides:
 *   findProjectByName — looks up a single registry entry by name (reuses listProjects).
 *   readLockVersion   — reads <projectPath>/kuraka.lock and returns the kuraka_version string.
 *   readVaultVersion  — reads <vaultRoot>/kuraka-init.py and extracts DEFAULT_VERSION.
 *
 * All read functions degrade gracefully: they return null on absent/unreadable files
 * or missing fields, and never throw. Fs access is isolated here; domain stays pure.
 *
 * Security (SCHEMA-FROZEN-S2.md §4): projectPath comes from the registry's `path` field
 * (trusted source). The request-level `:name` param is NEVER interpolated into a fs path.
 */
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import { listProjects } from "./projectRegistry.js";
import type { ProjectConfig, ProjectSummary } from "@kuraka-control/contracts";
import { curateProjectConfig } from "../domain/projectConfig.js";

/** Anchored regex to extract DEFAULT_VERSION from kuraka-init.py (FROZEN). */
const DEFAULT_VERSION_RE = /^DEFAULT_VERSION\s*=\s*["']([^"']+)["']/m;

/**
 * Finds a project summary by name from the vault registry.
 * Returns null when the name is not found; propagates VaultUnreadableError when
 * the projects directory is missing/unreadable.
 */
export async function findProjectByName(
  name: string,
  opts: { vaultRoot: string },
): Promise<ProjectSummary | null> {
  const projects = await listProjects({ vaultRoot: opts.vaultRoot });
  return projects.find((p) => p.name === name) ?? null;
}

/**
 * Reads <projectPath>/kuraka.lock and returns the kuraka_version value as a string.
 * Returns null on: file absent (ENOENT), permission error, YAML parse failure,
 * or missing / empty kuraka_version field. Never throws.
 *
 * The lock file is YAML (may contain # comments) — parsed with the `yaml` package,
 * NOT JSON.parse (SCHEMA-FROZEN-S2.md §4).
 */
export async function readLockVersion(projectPath: string): Promise<string | null> {
  const lockPath = path.join(projectPath, "kuraka.lock");
  try {
    const content = await fs.readFile(lockPath, "utf-8");
    const parsed = yaml.parse(content) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const value = record["kuraka_version"];
    if (value === undefined || value === null || value === "") return null;
    // Coerce to string: a two-dot value like 0.3 parses as a float in YAML
    return String(value);
  } catch {
    // Covers ENOENT, EACCES, YAML parse errors — all collapse to null
    return null;
  }
}

/**
 * Reads <projectPath>/kuraka.config.yaml and curates it into a ProjectConfig.
 * Returns null on: file absent (ENOENT), permission error (EACCES), YAML parse
 * failure, or parsed value not a plain object — via try/catch, never throws.
 *
 * Mirrors readLockVersion exactly in its degrade pattern. The curation is
 * delegated to curateProjectConfig (pure domain fn — no fs, no env).
 *
 * Security: projectPath comes from the registry's trusted `path` field;
 * never interpolated from the request :name param. Read-only — no writes,
 * no subprocesses. (SCHEMA-FROZEN-S3.md §4)
 */
export async function readProjectConfig(projectPath: string): Promise<ProjectConfig | null> {
  const configPath = path.join(projectPath, "kuraka.config.yaml");
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const parsed = yaml.parse(content) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return curateProjectConfig(parsed);
  } catch {
    // Covers ENOENT, EACCES, YAML parse errors — all collapse to null
    return null;
  }
}

/**
 * Reads <vaultRoot>/kuraka-init.py and extracts the DEFAULT_VERSION constant.
 * Uses the FROZEN anchored regex. Returns null on: file absent, unreadable,
 * or regex miss. Read-only — never executed as a subprocess. Never throws.
 */
export async function readVaultVersion(vaultRoot: string): Promise<string | null> {
  const initPyPath = path.join(vaultRoot, "kuraka-init.py");
  try {
    const content = await fs.readFile(initPyPath, "utf-8");
    const match = DEFAULT_VERSION_RE.exec(content);
    if (match === null) {
      process.stderr.write("[projectReader] readVaultVersion: DEFAULT_VERSION not found in kuraka-init.py\n");
      return null;
    }
    return match[1] ?? null;
  } catch (err) {
    process.stderr.write(
      `[projectReader] readVaultVersion: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  }
}
