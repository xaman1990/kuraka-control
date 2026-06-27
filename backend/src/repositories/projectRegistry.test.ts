/**
 * Unit tests for listProjects (repository layer).
 *
 * AC-30: real temp dir (node:fs/promises + node:os + node:path).
 * - happy: one valid .md → returns 1 parsed project
 * - empty: zero .md files → returns []
 * - degrade: one valid + one malformed .md → returns only the valid one
 * - unreadable: non-existent vaultRoot → rejects with VaultUnreadableError
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listProjects, VaultUnreadableError } from "./projectRegistry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a temp dir under os.tmpdir() and returns its path. */
async function _makeTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-registry-test-"));
}

/** Returns the content of a valid project frontmatter .md file. */
function _makeValidProjectMd(overrides: Record<string, string | boolean | string[]> = {}): string {
  const {
    name = "sie_v2",
    filePath = "/Users/xmn/Desarrollos/sie_v2",
    stack = "python-fastapi / vue-pinia",
    kuraka_version = "0.3.4",
    has_project_layer = true,
    default_mode = "normal",
    status = "active",
    repo_url = "https://github.com/org/sie_v2",
    focus_scope = "",
    last_mount = "2026-06-01",
    last_sync = "",
    tags = ["backend", "frontend"],
  } = overrides as Record<string, unknown>;

  const tagsYaml = Array.isArray(tags)
    ? tags.map((t) => `\n  - ${t}`).join("")
    : "";

  return `---
name: ${name}
path: ${filePath}
stack: ${stack}
kuraka_version: ${kuraka_version}
has_project_layer: ${has_project_layer}
default_mode: ${default_mode}
status: ${status}
repo_url: ${repo_url}
focus_scope: ${focus_scope}
last_mount: ${last_mount}
last_sync: ${last_sync}
tags:${tagsYaml}
---

# Project notes
`;
}

// ---------------------------------------------------------------------------
// Fixture lifecycle
// ---------------------------------------------------------------------------

let tempVaultRoot: string;

beforeEach(async () => {
  tempVaultRoot = await _makeTempDir();
  // Create the projects/ subdirectory expected by listProjects
  await fs.mkdir(path.join(tempVaultRoot, "projects"));
});

afterEach(async () => {
  await fs.rm(tempVaultRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("listProjects — happy path", () => {
  it("should return one ProjectSummary when projects/ contains one valid .md file", async () => {
    // Arrange
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "sie_v2.md"),
      _makeValidProjectMd(),
      "utf-8",
    );

    // Act
    const results = await listProjects({ vaultRoot: tempVaultRoot });

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("sie_v2");
    expect(results[0]?.governance).toBe("project");
    expect(results[0]?.status).toBe("active");
  });

  it("should normalize empty string last_sync to null in returned record", async () => {
    // Arrange — last_sync is "" in the file
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "sie_v2.md"),
      _makeValidProjectMd({ last_sync: "" }),
      "utf-8",
    );

    // Act
    const results = await listProjects({ vaultRoot: tempVaultRoot });

    // Assert
    expect(results[0]?.last_sync).toBeNull();
  });

  it("should coerce a numeric kuraka_version from YAML to a string", async () => {
    // Arrange — YAML writes 0.3 without quotes; gray-matter parses as number
    const content = `---
name: sie_v2
path: /Users/xmn/Desarrollos/sie_v2
stack: python-fastapi
kuraka_version: 0.3
has_project_layer: true
default_mode: normal
status: active
repo_url:
focus_scope:
last_mount: 2026-06-01
last_sync:
tags: []
---
`;
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "sie_v2.md"),
      content,
      "utf-8",
    );

    // Act
    const results = await listProjects({ vaultRoot: tempVaultRoot });

    // Assert
    expect(results[0]?.kuraka_version).toBe("0.3");
    expect(typeof results[0]?.kuraka_version).toBe("string");
  });

  it("should return multiple projects when projects/ contains multiple valid .md files", async () => {
    // Arrange
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "sie_v2.md"),
      _makeValidProjectMd({ name: "sie_v2" }),
      "utf-8",
    );
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "kuraka_control.md"),
      _makeValidProjectMd({ name: "kuraka_control", filePath: "/Users/xmn/Desarrollos/kuraka-control" }),
      "utf-8",
    );

    // Act
    const results = await listProjects({ vaultRoot: tempVaultRoot });

    // Assert
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(["kuraka_control", "sie_v2"]);
  });
});

// ---------------------------------------------------------------------------
// Empty directory
// ---------------------------------------------------------------------------

describe("listProjects — empty directory", () => {
  it("should return an empty array when projects/ contains zero .md files", async () => {
    // Arrange — projects/ dir exists but is empty (created in beforeEach)

    // Act
    const results = await listProjects({ vaultRoot: tempVaultRoot });

    // Assert
    expect(results).toEqual([]);
  });

  it("should ignore non-.md files in the projects/ directory", async () => {
    // Arrange
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "README.txt"),
      "this is not a project file",
      "utf-8",
    );

    // Act
    const results = await listProjects({ vaultRoot: tempVaultRoot });

    // Assert
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fault tolerance — malformed file skipped, valid file still returned
// ---------------------------------------------------------------------------

describe("listProjects — fault tolerance", () => {
  it("should skip a malformed .md and still return the valid project", async () => {
    // Arrange — one valid file, one with invalid frontmatter (missing name)
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "sie_v2.md"),
      _makeValidProjectMd({ name: "sie_v2" }),
      "utf-8",
    );
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "bad.md"),
      `---
path: /some/path
stack: unknown
kuraka_version: "0.1"
has_project_layer: false
default_mode: normal
status: active
tags: []
---
# Missing name field
`,
      "utf-8",
    );

    // Act
    const results = await listProjects({ vaultRoot: tempVaultRoot });

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("sie_v2");
  });

  it("should skip a file with completely invalid YAML and still return valid projects", async () => {
    // Arrange — one valid file, one with YAML that gray-matter cannot parse
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "sie_v2.md"),
      _makeValidProjectMd({ name: "sie_v2" }),
      "utf-8",
    );
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "corrupt.md"),
      `---
: this: is: not: valid: yaml: [unclosed bracket
---
`,
      "utf-8",
    );

    // Act — call directly; VaultUnreadableError would only fire if the dir is unreadable,
    // not when a single file has bad YAML (per-file fault tolerance)
    const results = await listProjects({ vaultRoot: tempVaultRoot });

    // Assert — corrupt.md is skipped; valid sie_v2.md is still included
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("sie_v2");
  });

  it("should not throw when all files are malformed — returns empty array", async () => {
    // Arrange
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "bad.md"),
      "---\npath: /no-name\n---\n",
      "utf-8",
    );

    // Act / Assert
    const results = await listProjects({ vaultRoot: tempVaultRoot });
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// VaultUnreadableError — dir missing/unreadable
// ---------------------------------------------------------------------------

describe("listProjects — VaultUnreadableError", () => {
  it("should reject with VaultUnreadableError when vaultRoot does not exist", async () => {
    // Arrange
    const nonExistentVault = path.join(os.tmpdir(), "kuraka-does-not-exist-" + Date.now());

    // Act / Assert
    await expect(
      listProjects({ vaultRoot: nonExistentVault }),
    ).rejects.toBeInstanceOf(VaultUnreadableError);
  });

  it("should include the vault root path in the VaultUnreadableError", async () => {
    // Arrange
    const nonExistentVault = path.join(os.tmpdir(), "kuraka-missing-" + Date.now());

    // Act
    let caughtError: unknown;
    try {
      await listProjects({ vaultRoot: nonExistentVault });
    } catch (err) {
      caughtError = err;
    }

    // Assert
    expect(caughtError).toBeInstanceOf(VaultUnreadableError);
    expect((caughtError as VaultUnreadableError).vaultPath).toBe(nonExistentVault);
  });

  it("should reject with VaultUnreadableError when projects/ subdir is missing", async () => {
    // Arrange — vaultRoot exists but has no projects/ subdir
    const vaultWithoutProjects = await _makeTempDir();
    // (do NOT create projects/ dir)

    try {
      // Act / Assert
      await expect(
        listProjects({ vaultRoot: vaultWithoutProjects }),
      ).rejects.toBeInstanceOf(VaultUnreadableError);
    } finally {
      await fs.rm(vaultWithoutProjects, { recursive: true, force: true });
    }
  });
});
