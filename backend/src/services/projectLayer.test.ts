/**
 * Unit tests for projectLayer service (S4 — T2).
 *
 * Mocks findProjectByName (from projectReader) at the vitest module level.
 * Uses REAL temp dirs for walkLayerTree / readLayerFile to exercise the
 * integration seam and catch flag-drift cases (B2 / SCHEMA-FROZEN-S4.md §4).
 *
 * Coverage:
 *   getLayerTree  — unknown name sentinel, flag-drift (has_project_layer
 *                   disagrees with real dir), project path absent on disk.
 *   getLayerFile  — unknown name sentinel, contained file success, traversal
 *                   attack forwarded as FORBIDDEN, absent file as NOT_FOUND.
 *
 * Flag-drift is the key invariant: has_layer in the response reflects the
 * REAL directory existence (live fs.stat), NEVER the registry flag.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProjectSummary } from "@kuraka-control/contracts";

// Mock projectReader — must be declared before the import under test.
vi.mock("../repositories/projectReader.js", () => ({
  findProjectByName: vi.fn(),
  readLockVersion: vi.fn(),
  readVaultVersion: vi.fn(),
  readProjectConfig: vi.fn(),
}));

import { getLayerTree, getLayerFile } from "./projectLayer.js";
import { findProjectByName } from "../repositories/projectReader.js";

// ---------------------------------------------------------------------------
// Typed mock
// ---------------------------------------------------------------------------

const mockFindProjectByName = vi.mocked(findProjectByName);

// ---------------------------------------------------------------------------
// Temp dir lifecycle
// ---------------------------------------------------------------------------

let tempProjectDir: string;

beforeEach(async () => {
  // Each test gets a fresh "project directory" on disk.
  tempProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-layer-svc-test-"));
  vi.resetAllMocks();
});

afterEach(async () => {
  await fs.rm(tempProjectDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid ProjectSummary pointing to tempProjectDir. */
function _makeProjectSummary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    name: "test-project",
    path: tempProjectDir,
    stack: "node-express+react",
    kuraka_version: "0.3.4",
    has_project_layer: true,       // registry flag — may disagree with real dir
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

/** Creates .claude/project/ under tempProjectDir and returns its abs path. */
async function _makeLayerRoot(): Promise<string> {
  const layerRoot = path.join(tempProjectDir, ".claude", "project");
  await fs.mkdir(layerRoot, { recursive: true });
  return layerRoot;
}

/** Writes a UTF-8 file at a rel path under the layer root. */
async function _writeLayerFile(relPath: string, content: string): Promise<void> {
  const layerRoot = path.join(tempProjectDir, ".claude", "project");
  await fs.mkdir(layerRoot, { recursive: true });
  const abs = path.join(layerRoot, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

// ===========================================================================
// getLayerTree — NOT_FOUND sentinel
// ===========================================================================

describe("getLayerTree — unknown project name → NOT_FOUND sentinel", () => {
  it("should return the string 'NOT_FOUND' when findProjectByName returns null", async () => {
    // Arrange
    mockFindProjectByName.mockResolvedValue(null);

    // Act
    const result = await getLayerTree("nonexistent", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });

  it("should call findProjectByName with the supplied name and vaultRoot", async () => {
    // Arrange
    mockFindProjectByName.mockResolvedValue(null);

    // Act
    await getLayerTree("my-project", { vaultRoot: "/custom/vault" });

    // Assert — service passes name and vaultRoot to the repository
    expect(mockFindProjectByName).toHaveBeenCalledWith("my-project", {
      vaultRoot: "/custom/vault",
    });
  });
});

// ===========================================================================
// getLayerTree — flag-drift: has_project_layer:false in registry but dir present
// ===========================================================================

describe("getLayerTree — flag-drift: registry flag false but dir present → has_layer:true", () => {
  it("should return has_layer:true when the real .claude/project/ dir exists even if registry flag is false", async () => {
    // Arrange — registry says has_project_layer:false but we create the real dir
    const summary = _makeProjectSummary({ has_project_layer: false });
    mockFindProjectByName.mockResolvedValue(summary);
    await _makeLayerRoot();

    // Act
    const result = await getLayerTree("test-project", { vaultRoot: "/fake/vault" });

    // Assert — has_layer reflects REAL dir, not the registry flag
    expect(result).not.toBe("NOT_FOUND");
    if (typeof result === "object") {
      expect(result.has_layer).toBe(true);
    }
  });

  it("should populate nodes when dir is present (registry flag is irrelevant to tree content)", async () => {
    // Arrange
    const summary = _makeProjectSummary({ has_project_layer: false });
    mockFindProjectByName.mockResolvedValue(summary);
    const layerRoot = await _makeLayerRoot();
    await fs.writeFile(path.join(layerRoot, "conventions.md"), "# conventions");

    // Act
    const result = await getLayerTree("test-project", { vaultRoot: "/fake/vault" });

    // Assert
    expect(result).not.toBe("NOT_FOUND");
    if (typeof result === "object") {
      expect(result.has_layer).toBe(true);
      expect(result.nodes.length).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// getLayerTree — flag-drift: has_project_layer:true in registry but dir absent
// ===========================================================================

describe("getLayerTree — flag-drift: registry flag true but dir absent → has_layer:false", () => {
  it("should return has_layer:false when registry says true but .claude/project/ does not exist", async () => {
    // Arrange — registry says has_project_layer:true but we do NOT create the dir
    const summary = _makeProjectSummary({ has_project_layer: true });
    mockFindProjectByName.mockResolvedValue(summary);
    // Deliberately do NOT create .claude/project/ in tempProjectDir

    // Act
    const result = await getLayerTree("test-project", { vaultRoot: "/fake/vault" });

    // Assert — has_layer reflects REAL absence, not the registry flag
    expect(result).not.toBe("NOT_FOUND");
    if (typeof result === "object") {
      expect(result.has_layer).toBe(false);
      expect(result.nodes).toEqual([]);
      expect(result.empty).toBe(true);
    }
  });
});

// ===========================================================================
// getLayerTree — project path missing on disk
// ===========================================================================

describe("getLayerTree — project path missing on disk → has_layer:false, 200 (never 500)", () => {
  it("should return has_layer:false when the project path does not exist on disk", async () => {
    // Arrange — point the registry to a path that doesn't exist on disk
    const nonExistentPath = path.join(os.tmpdir(), "kuraka-svc-missing-" + Date.now());
    const summary = _makeProjectSummary({ path: nonExistentPath });
    mockFindProjectByName.mockResolvedValue(summary);

    // Act
    const result = await getLayerTree("test-project", { vaultRoot: "/fake/vault" });

    // Assert — degrades gracefully to has_layer:false (B4 — not a 500)
    expect(result).not.toBe("NOT_FOUND");
    if (typeof result === "object") {
      expect(result.has_layer).toBe(false);
      expect(result.nodes).toEqual([]);
      expect(result.empty).toBe(true);
      expect(result.truncated).toBe(false);
    }
  });

  it("should never throw when the project path is missing on disk", async () => {
    // Arrange
    const nonExistentPath = path.join(os.tmpdir(), "kuraka-svc-throws-" + Date.now());
    const summary = _makeProjectSummary({ path: nonExistentPath });
    mockFindProjectByName.mockResolvedValue(summary);

    // Act / Assert — must resolve, not reject
    await expect(
      getLayerTree("test-project", { vaultRoot: "/fake/vault" }),
    ).resolves.not.toThrow();
  });
});

// ===========================================================================
// getLayerTree — uses project.path from registry, NOT the :name param
// ===========================================================================

describe("getLayerTree — resolution uses registry project.path, not the :name param", () => {
  it("should walk the path from the registry entry, not a path derived from the name", async () => {
    // Arrange — use a name that is completely different from the temp dir name
    const summary = _makeProjectSummary({
      name: "my-project",
      path: tempProjectDir, // the REAL path from the registry
    });
    mockFindProjectByName.mockResolvedValue(summary);
    const layerRoot = await _makeLayerRoot();
    await fs.writeFile(path.join(layerRoot, "sentinel.md"), "# sentinel");

    // Act — request with a name that has nothing to do with the file path
    const result = await getLayerTree("my-project", { vaultRoot: "/fake/vault" });

    // Assert — finds the file because it used project.path, not the name
    expect(result).not.toBe("NOT_FOUND");
    if (typeof result === "object") {
      expect(result.has_layer).toBe(true);
      const names = result.nodes.map((n) => n.name);
      expect(names).toContain("sentinel.md");
    }
  });
});

// ===========================================================================
// getLayerFile — NOT_FOUND sentinel
// ===========================================================================

describe("getLayerFile — unknown project name → NOT_FOUND sentinel", () => {
  it("should return the string 'NOT_FOUND' when findProjectByName returns null", async () => {
    // Arrange
    mockFindProjectByName.mockResolvedValue(null);

    // Act
    const result = await getLayerFile("nonexistent", "conventions/ts.md", {
      vaultRoot: "/fake/vault",
    });

    // Assert
    expect(result).toBe("NOT_FOUND");
  });
});

// ===========================================================================
// getLayerFile — successful file read
// ===========================================================================

describe("getLayerFile — valid contained file → LayerFileResponse", () => {
  it("should return the file content for a valid contained rel path", async () => {
    // Arrange
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    await _writeLayerFile("conventions/typescript.md", "# TypeScript conventions");

    // Act
    const result = await getLayerFile("test-project", "conventions/typescript.md", {
      vaultRoot: "/fake/vault",
    });

    // Assert
    expect(typeof result).toBe("object");
    if (typeof result === "object" && result !== null && !["BAD_REQUEST", "FORBIDDEN", "NOT_FOUND"].includes(result as string)) {
      const response = result as { content: string; rel_path: string; binary: boolean; too_large: boolean };
      expect(response.content).toBe("# TypeScript conventions");
      expect(response.rel_path).toBe("conventions/typescript.md");
      expect(response.binary).toBe(false);
      expect(response.too_large).toBe(false);
    }
  });
});

// ===========================================================================
// getLayerFile — traversal attack forwarded as FORBIDDEN
// ===========================================================================

describe("getLayerFile — traversal rel forwarded to readLayerFile → FORBIDDEN", () => {
  it("should return FORBIDDEN for a traversal rel '../../../../etc/passwd'", async () => {
    // Arrange
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    await _makeLayerRoot();

    // Act
    const result = await getLayerFile(
      "test-project",
      "../../../../etc/passwd",
      { vaultRoot: "/fake/vault" },
    );

    // Assert — service passes the rel through to readLayerFile which returns FORBIDDEN
    expect(result).toBe("FORBIDDEN");
  });

  it("should return FORBIDDEN for an absolute rel '/etc/passwd'", async () => {
    // Arrange
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    await _makeLayerRoot();

    // Act
    const result = await getLayerFile("test-project", "/etc/passwd", {
      vaultRoot: "/fake/vault",
    });

    // Assert
    expect(result).toBe("FORBIDDEN");
  });

  it("should return BAD_REQUEST for an empty rel", async () => {
    // Arrange
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    await _makeLayerRoot();

    // Act
    const result = await getLayerFile("test-project", "", {
      vaultRoot: "/fake/vault",
    });

    // Assert
    expect(result).toBe("BAD_REQUEST");
  });
});

// ===========================================================================
// getLayerFile — absent file → NOT_FOUND (not a crash)
// ===========================================================================

describe("getLayerFile — valid contained rel but file absent → NOT_FOUND", () => {
  it("should return NOT_FOUND when the rel is valid but the file does not exist in the layer", async () => {
    // Arrange — layer root exists but the specific file does not
    const summary = _makeProjectSummary();
    mockFindProjectByName.mockResolvedValue(summary);
    await _makeLayerRoot();

    // Act
    const result = await getLayerFile(
      "test-project",
      "conventions/nonexistent.md",
      { vaultRoot: "/fake/vault" },
    );

    // Assert
    expect(result).toBe("NOT_FOUND");
  });
});
