/**
 * Unit tests for getProjectDetail service (AC-37, S3 addition).
 *
 * Mocks the four repository dependencies (findProjectByName, readLockVersion,
 * readVaultVersion, readProjectConfig) at the vitest module level. Verifies
 * that all 5 drift states are assembled correctly into ProjectDetail, that
 * "NOT_FOUND" is returned for unknown names, registry_matches_lock semantics
 * hold, and that config (ProjectConfig | null) flows through correctly (S3).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProjectSummary } from "@kuraka-control/contracts";
import { ProjectDetail } from "@kuraka-control/contracts";

// Mock the repository module — must be declared before the import under test.
vi.mock("../repositories/projectReader.js", () => ({
  findProjectByName: vi.fn(),
  readLockVersion: vi.fn(),
  readVaultVersion: vi.fn(),
  readProjectConfig: vi.fn(),
}));

import { getProjectDetail } from "./projectDetail.js";
import {
  findProjectByName,
  readLockVersion,
  readProjectConfig,
  readVaultVersion,
} from "../repositories/projectReader.js";

// ---------------------------------------------------------------------------
// Typed mocks
// ---------------------------------------------------------------------------

const mockFindProjectByName = vi.mocked(findProjectByName);
const mockReadLockVersion = vi.mocked(readLockVersion);
const mockReadVaultVersion = vi.mocked(readVaultVersion);
const mockReadProjectConfig = vi.mocked(readProjectConfig);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _makeProjectSummary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    name: "kuraka-control",
    path: "/Users/xmn/Desarrollos/kuraka-control",
    stack: "node-express+react",
    kuraka_version: "0.3.4",
    has_project_layer: true,
    default_mode: "normal",
    status: "active",
    repo_url: null,
    focus_scope: null,
    last_mount: "2026-06-07",
    last_sync: null,
    tags: [],
    governance: "project",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default config to null — first-class absent state (SCHEMA-FROZEN-S3.md §3).
  // Individual tests override when they need a populated config.
  mockReadProjectConfig.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// NOT_FOUND sentinel
// ---------------------------------------------------------------------------

describe("getProjectDetail — unknown name returns NOT_FOUND sentinel", () => {
  it("should return the string 'NOT_FOUND' when findProjectByName returns null", async () => {
    // Arrange
    mockFindProjectByName.mockResolvedValue(null);

    // Act
    const result = await getProjectDetail("nonexistent", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });

  it("should not call readLockVersion or readVaultVersion when the project is not found", async () => {
    // Arrange
    mockFindProjectByName.mockResolvedValue(null);

    // Act
    await getProjectDetail("nonexistent", { vaultRoot: "/fake/vault" });

    // Assert — no fs calls made for a missing project
    expect(mockReadLockVersion).not.toHaveBeenCalled();
    expect(mockReadVaultVersion).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Drift state: not_pinned (row 1 — lock null, short-circuit)
// ---------------------------------------------------------------------------

describe("getProjectDetail — drift.state 'not_pinned' when lock is absent", () => {
  it("should assemble drift.state not_pinned when readLockVersion returns null", async () => {
    // Arrange
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue(null);
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.drift.state).toBe("not_pinned");
  });

  it("should set lock_version to null and registry_matches_lock to null when not_pinned", async () => {
    // Arrange
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue(null);
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.drift.lock_version).toBeNull();
    expect(result.drift.registry_matches_lock).toBeNull();
  });

  it("should pass ProjectDetail zod validation when drift.state is not_pinned", async () => {
    // Arrange
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue(null);
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert — zod parse confirms the full contract shape
    expect(result).not.toBe("NOT_FOUND");
    const parsed = ProjectDetail.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Drift state: unknown (row 2 — lock present, vault null)
// ---------------------------------------------------------------------------

describe("getProjectDetail — drift.state 'unknown' when vault version unreadable", () => {
  it("should assemble drift.state unknown when readVaultVersion returns null", async () => {
    // Arrange
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue("0.3.4");
    mockReadVaultVersion.mockResolvedValue(null);

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.drift.state).toBe("unknown");
    expect(result.drift.lock_version).toBe("0.3.4");
    expect(result.drift.vault_version).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Drift state: up_to_date (row 4 — equal semver)
// ---------------------------------------------------------------------------

describe("getProjectDetail — drift.state 'up_to_date' when lock equals vault", () => {
  it("should assemble drift.state up_to_date and registry_matches_lock true", async () => {
    // Arrange
    const summary = _makeProjectSummary({ kuraka_version: "0.3.4" });
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue("0.3.4");
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.drift.state).toBe("up_to_date");
    expect(result.drift.lock_version).toBe("0.3.4");
    expect(result.drift.vault_version).toBe("0.3.4");
    expect(result.drift.registry_matches_lock).toBe(true);
  });

  it("should set registry_version to match summary.kuraka_version", async () => {
    // Arrange
    const summary = _makeProjectSummary({ kuraka_version: "0.3.4" });
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue("0.3.4");
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.drift.registry_version).toBe(summary.kuraka_version);
  });
});

// ---------------------------------------------------------------------------
// Drift state: behind (row 5 — lock < vault)
// ---------------------------------------------------------------------------

describe("getProjectDetail — drift.state 'behind' when lock is older than vault", () => {
  it("should assemble drift.state behind when lock version is less than vault version", async () => {
    // Arrange
    const summary = _makeProjectSummary({ kuraka_version: "0.3.2" });
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue("0.3.2");
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.drift.state).toBe("behind");
  });
});

// ---------------------------------------------------------------------------
// Drift state: ahead (row 6 — lock > vault)
// ---------------------------------------------------------------------------

describe("getProjectDetail — drift.state 'ahead' when lock is newer than vault", () => {
  it("should assemble drift.state ahead when lock version is greater than vault version", async () => {
    // Arrange
    const summary = _makeProjectSummary({ kuraka_version: "0.4.0" });
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue("0.4.0");
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.drift.state).toBe("ahead");
  });
});

// ---------------------------------------------------------------------------
// registry_matches_lock semantics
// ---------------------------------------------------------------------------

describe("getProjectDetail — registry_matches_lock semantics", () => {
  it("should set registry_matches_lock false when lock_version differs from registry kuraka_version", async () => {
    // Arrange — lock says 0.3.2 but registry stamp says 0.3.4 (stale stamp)
    const summary = _makeProjectSummary({ kuraka_version: "0.3.4" });
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue("0.3.2");
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.drift.registry_matches_lock).toBe(false);
  });

  it("should set registry_matches_lock true when lock_version matches registry kuraka_version", async () => {
    // Arrange
    const summary = _makeProjectSummary({ kuraka_version: "0.3.4" });
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue("0.3.4");
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.drift.registry_matches_lock).toBe(true);
  });

  it("should set registry_matches_lock null when lock_version is null (coherence biconditional)", async () => {
    // Arrange
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue(null);
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.drift.registry_matches_lock).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Assembled ProjectDetail carries ProjectSummary fields through
// ---------------------------------------------------------------------------

describe("getProjectDetail — ProjectDetail shape (summary fields preserved)", () => {
  it("should carry all ProjectSummary fields through to the returned ProjectDetail", async () => {
    // Arrange
    const summary = _makeProjectSummary({
      name: "kuraka-control",
      path: "/Users/xmn/Desarrollos/kuraka-control",
      stack: "node-express+react",
    });
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue("0.3.4");
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.name).toBe("kuraka-control");
    expect(result.path).toBe("/Users/xmn/Desarrollos/kuraka-control");
    expect(result.stack).toBe("node-express+react");
    expect(result.governance).toBe("project");
  });

  it("should pass ProjectDetail zod validation for all assembled drift states", async () => {
    // Arrange — up_to_date is a representative state; zod validates the whole shape
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue("0.3.4");
    mockReadVaultVersion.mockResolvedValue("0.3.4");

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert
    const parsed = ProjectDetail.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S3: config field — populated when file present; null when absent (B6, B7)
// ---------------------------------------------------------------------------

describe("getProjectDetail — S3 config field", () => {
  it("should include config: null when readProjectConfig returns null (absent file)", async () => {
    // Arrange
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue(null);
    mockReadVaultVersion.mockResolvedValue("0.3.4");
    mockReadProjectConfig.mockResolvedValue(null);

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert — config: null is first-class; response is still 200-shaped ProjectDetail
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.config).toBeNull();
    const parsed = ProjectDetail.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("should include config: ProjectConfig object when readProjectConfig returns a curated config", async () => {
    // Arrange
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    mockReadLockVersion.mockResolvedValue("0.3.4");
    mockReadVaultVersion.mockResolvedValue("0.3.4");
    mockReadProjectConfig.mockResolvedValue({
      backend_language: "typescript",
      backend_framework: "express",
      frontend_language: "typescript",
      frontend_framework: "react",
      architecture_layers: ["domain", "repository", "service", "route"],
      state_mgmt: "zustand",
      naming_language: "english",
      max_file_loc: 400,
      max_function_loc: 50,
      default_mode: "normal",
    });

    // Act
    const result = await getProjectDetail("kuraka-control", { vaultRoot: "/fake/vault" });

    // Assert — all 10 config fields present; zod validates full ProjectDetail
    expect(result).not.toBe("NOT_FOUND");
    if (result === "NOT_FOUND") return;
    expect(result.config).not.toBeNull();
    expect(result.config?.backend_language).toBe("typescript");
    expect(result.config?.backend_framework).toBe("express");
    expect(result.config?.max_file_loc).toBe(400);
    expect(result.config?.architecture_layers).toEqual([
      "domain",
      "repository",
      "service",
      "route",
    ]);
    const parsed = ProjectDetail.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});
