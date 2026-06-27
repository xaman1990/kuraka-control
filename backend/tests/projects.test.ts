/**
 * Integration tests for GET /api/projects (AC-31) and S4 layer endpoints.
 *
 * Spins an Express app on a random port (no supertest needed — Node 22 has
 * native fetch). Vault path is injected via a real temp dir so the full
 * stack (route → service → repository → domain) executes without mocks.
 *
 * Cases:
 *   - 200 + { projects: [...], empty: false } — populated vault
 *   - 200 + { projects: [], empty: true }    — empty vault
 *   - 500 + { error: { code: "VAULT_UNREADABLE", detail: { path: <root> } } } — missing vault
 *   S4 layer endpoint cases (T1 integration coverage via createApp harness):
 *   - GET /api/projects/:name/layer — 200 tree, 200 has_layer:false, 404 unknown
 *   - GET /api/projects/:name/layer/file — 200 content, 403 traversal, 404 no file
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/index.js";
import { ProjectListResponse, ProjectDetail, LayerTreeResponse, LayerFileResponse } from "@kuraka-control/contracts";

/** Starts an Express app on a random OS-assigned port; returns { server, baseUrl }. */
async function _startServer(
  app: ReturnType<typeof createApp>,
): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

/** Stops a server and waits for it to close. */
async function _stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

// ---------------------------------------------------------------------------
// Helpers — minimal valid project .md content
// ---------------------------------------------------------------------------

function _makeValidProjectMd(name: string = "sie_v2"): string {
  return `---
name: ${name}
path: /Users/xmn/Desarrollos/${name}
stack: python-fastapi / vue-pinia
kuraka_version: "0.3.4"
has_project_layer: true
default_mode: normal
status: active
repo_url: https://github.com/org/${name}
focus_scope:
last_mount: 2026-06-01
last_sync:
tags:
  - backend
  - frontend
---

# ${name}
`;
}

// ---------------------------------------------------------------------------
// Temp vault lifecycle
// ---------------------------------------------------------------------------

let tempVaultRoot: string;
let server: http.Server;
let baseUrl: string;

afterEach(async () => {
  if (server) await _stopServer(server);
  if (tempVaultRoot) await fs.rm(tempVaultRoot, { recursive: true, force: true });
});

async function _setupVault(withProjectsMd: boolean, projectName?: string): Promise<void> {
  tempVaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-projects-integration-"));
  await fs.mkdir(path.join(tempVaultRoot, "projects"));
  if (withProjectsMd) {
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", `${projectName ?? "sie_v2"}.md`),
      _makeValidProjectMd(projectName ?? "sie_v2"),
      "utf-8",
    );
  }
}

// ---------------------------------------------------------------------------
// 200 — populated vault
// ---------------------------------------------------------------------------

describe("GET /api/projects — populated vault", () => {
  beforeEach(async () => {
    await _setupVault(true, "sie_v2");
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  it("should return 200 with projects array and empty: false", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);

    // Assert — status
    expect(response.status).toBe(200);

    // Assert — shape
    const body = await response.json() as unknown;
    const parsed = ProjectListResponse.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.empty).toBe(false);
    expect(parsed.data.projects).toHaveLength(1);
  });

  it("should return a project with the correct name from the vault file", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as { projects: Array<{ name: string }> };

    // Assert
    expect(body.projects[0]?.name).toBe("sie_v2");
  });

  it("should return a project with governance: 'project' (server-derived constant)", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as { projects: Array<{ governance: string }> };

    // Assert
    expect(body.projects[0]?.governance).toBe("project");
  });

  it("should return null for empty-string nullable fields (last_sync is empty in fixture)", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as { projects: Array<{ last_sync: string | null }> };

    // Assert — last_sync was "" in frontmatter; must be null in response
    expect(body.projects[0]?.last_sync).toBeNull();
  });

  it("should return Content-Type: application/json", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);

    // Assert
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });
});

// ---------------------------------------------------------------------------
// 200 — empty vault
// ---------------------------------------------------------------------------

describe("GET /api/projects — empty vault", () => {
  beforeEach(async () => {
    await _setupVault(false); // no .md files
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  it("should return 200 with empty projects array and empty: true", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);

    // Assert — status
    expect(response.status).toBe(200);

    // Assert — shape
    const body = await response.json() as { projects: unknown[]; empty: boolean };
    expect(body.projects).toEqual([]);
    expect(body.empty).toBe(true);
  });

  it("should validate against ProjectListResponse schema when vault is empty", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as unknown;

    // Assert
    const parsed = ProjectListResponse.safeParse(body);
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 500 — vault unreadable (missing directory)
// ---------------------------------------------------------------------------

describe("GET /api/projects — vault unreadable", () => {
  it("should return 500 with VAULT_UNREADABLE error code when vault does not exist", async () => {
    // Arrange
    const nonExistentVault = path.join(
      os.tmpdir(),
      "kuraka-integration-missing-" + Date.now(),
    );
    const started = await _startServer(createApp({ vaultRoot: nonExistentVault }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/projects`);

    // Assert — status
    expect(response.status).toBe(500);

    // Assert — error envelope
    const body = await response.json() as {
      error: { code: string; message: string; detail: { path: string } };
    };
    expect(body.error.code).toBe("VAULT_UNREADABLE");
  });

  it("should include the vault ROOT path in detail.path (not the projects/ subdir)", async () => {
    // Arrange — this is the §5 regression guard: detail.path must be env.vaultRoot
    const nonExistentVault = path.join(
      os.tmpdir(),
      "kuraka-integration-missing-path-" + Date.now(),
    );
    const started = await _startServer(createApp({ vaultRoot: nonExistentVault }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as {
      error: { detail: { path: string } };
    };

    // Assert — must be the vault root, not vault/projects
    expect(body.error.detail.path).toBe(nonExistentVault);
    expect(body.error.detail.path).not.toContain("projects");
  });

  it("should include a human-readable message in the error envelope", async () => {
    // Arrange
    const nonExistentVault = path.join(
      os.tmpdir(),
      "kuraka-integration-msg-" + Date.now(),
    );
    const started = await _startServer(createApp({ vaultRoot: nonExistentVault }));
    server = started.server;
    baseUrl = started.baseUrl;

    // Act
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json() as { error: { message: string } };

    // Assert
    expect(typeof body.error.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:name — 200 with kuraka.lock present (up_to_date)
// ---------------------------------------------------------------------------

/** Writes a kuraka.lock with the given version into `projectDir`. */
async function _writeLockFile(projectDir: string, version: string): Promise<void> {
  await fs.writeFile(
    path.join(projectDir, "kuraka.lock"),
    `# kuraka.lock\nkuraka_version: "${version}"\nmounted_at: 2026-06-07\nvault: /some/path\n`,
    "utf-8",
  );
}

/** Writes a vault kuraka-init.py with DEFAULT_VERSION into `vaultDir`. */
async function _writeInitPy(vaultDir: string, version: string): Promise<void> {
  await fs.writeFile(
    path.join(vaultDir, "kuraka-init.py"),
    `DEFAULT_VERSION = "${version}"\nFRAMEWORK_NAME = "kuraka"\n`,
    "utf-8",
  );
}

describe("GET /api/projects/:name — 200 with kuraka.lock present", () => {
  let projectDir: string;

  beforeEach(async () => {
    // Arrange — vault with one project whose path points to a temp dir that has a lock
    await _setupVault(true, "kuraka-control");

    // Create a separate temp dir to act as the project's local path on disk
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-project-lock-"));
    await _writeLockFile(projectDir, "0.3.4");
    await _writeInitPy(tempVaultRoot, "0.3.4");

    // Rewrite the project .md so its `path` points to projectDir
    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "kuraka-control.md"),
      `---
name: kuraka-control
path: ${projectDir}
stack: node-express+react
kuraka_version: "0.3.4"
has_project_layer: true
default_mode: normal
status: active
repo_url:
focus_scope:
last_mount: 2026-06-07
last_sync:
tags: []
---

# kuraka-control
`,
      "utf-8",
    );

    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it("should return 200 for a registered project with a kuraka.lock", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/kuraka-control`);

    // Assert
    expect(response.status).toBe(200);
  });

  it("should return Content-Type application/json", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/kuraka-control`);

    // Assert
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("should return a response that passes ProjectDetail zod validation", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/kuraka-control`);
    const body = await response.json() as unknown;

    // Assert — full contract shape check
    const parsed = ProjectDetail.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      console.error("Zod errors:", parsed.error.issues);
    }
  });

  it("should return drift.state 'up_to_date' when lock version equals vault version", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/kuraka-control`);
    const body = await response.json() as { drift: { state: string } };

    // Assert
    expect(body.drift.state).toBe("up_to_date");
  });

  it("should return lock_version and vault_version matching the fixture values", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/kuraka-control`);
    const body = await response.json() as {
      drift: { lock_version: string; vault_version: string };
    };

    // Assert
    expect(body.drift.lock_version).toBe("0.3.4");
    expect(body.drift.vault_version).toBe("0.3.4");
  });

  it("should return registry_matches_lock true when lock version equals registry version", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/kuraka-control`);
    const body = await response.json() as { drift: { registry_matches_lock: boolean } };

    // Assert
    expect(body.drift.registry_matches_lock).toBe(true);
  });

  it("should carry the project name and governance in the response", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/kuraka-control`);
    const body = await response.json() as { name: string; governance: string };

    // Assert
    expect(body.name).toBe("kuraka-control");
    expect(body.governance).toBe("project");
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:name — 200 with drift.state 'not_pinned' (no lock file)
// ---------------------------------------------------------------------------

describe("GET /api/projects/:name — 200 with drift.state not_pinned (no kuraka.lock)", () => {
  let projectDir: string;

  beforeEach(async () => {
    // Arrange — vault with one project whose path has NO kuraka.lock
    await _setupVault(true, "sie_v2");

    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-project-no-lock-"));
    // Deliberately do NOT write a kuraka.lock in projectDir
    await _writeInitPy(tempVaultRoot, "0.3.4");

    await fs.writeFile(
      path.join(tempVaultRoot, "projects", "sie_v2.md"),
      `---
name: sie_v2
path: ${projectDir}
stack: python-fastapi
kuraka_version: "0.3.4"
has_project_layer: true
default_mode: normal
status: active
repo_url:
focus_scope:
last_mount: 2026-06-01
last_sync:
tags: []
---

# sie_v2
`,
      "utf-8",
    );

    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it("should return 200 for a project without a kuraka.lock", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/sie_v2`);

    // Assert
    expect(response.status).toBe(200);
  });

  it("should return drift.state 'not_pinned' when no kuraka.lock is present", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/sie_v2`);
    const body = await response.json() as { drift: { state: string } };

    // Assert
    expect(body.drift.state).toBe("not_pinned");
  });

  it("should return lock_version null and registry_matches_lock null when not_pinned", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/sie_v2`);
    const body = await response.json() as {
      drift: { lock_version: null; registry_matches_lock: null };
    };

    // Assert — nullability coherence biconditional from SCHEMA-FROZEN-S2.md §1
    expect(body.drift.lock_version).toBeNull();
    expect(body.drift.registry_matches_lock).toBeNull();
  });

  it("should pass ProjectDetail zod validation even when not_pinned", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/sie_v2`);
    const body = await response.json() as unknown;

    // Assert
    const parsed = ProjectDetail.safeParse(body);
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:name — 404 NOT_FOUND for unregistered name
// ---------------------------------------------------------------------------

describe("GET /api/projects/:name — 404 for unregistered project name", () => {
  beforeEach(async () => {
    // Arrange — vault with one known project; we'll query an unregistered name
    await _setupVault(true, "sie_v2");
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  it("should return 404 for a name that is not registered in the vault", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/nonexistent`);

    // Assert
    expect(response.status).toBe(404);
  });

  it("should return error.code NOT_FOUND in the response body", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/nonexistent`);
    const body = await response.json() as { error: { code: string } };

    // Assert
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("should include the project name in the error message", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/nonexistent`);
    const body = await response.json() as { error: { message: string } };

    // Assert
    expect(body.error.message).toContain("nonexistent");
  });

  it("should include the name in error.detail", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/nonexistent`);
    const body = await response.json() as { error: { detail: { name: string } } };

    // Assert
    expect(body.error.detail.name).toBe("nonexistent");
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:name — path-separator and blank :name validation
// ---------------------------------------------------------------------------

describe("GET /api/projects/:name — path-separator and blank name rejected", () => {
  beforeEach(async () => {
    // Arrange — we need a running server; vault content doesn't matter for validation
    await _setupVault(false);
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  it("should return 404 when :name contains a forward slash (path-separator injection)", async () => {
    // Arrange — fetch URL-encodes '/' as '%2F'; the route receives the decoded value
    // Express receives this as a separate path segment, so we test a name that is
    // blank after the split (double-slash) or via URL-encoding.
    // We URL-encode the slash so it reaches the handler as part of the param.
    const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent("../../etc/passwd")}`);

    // Assert — rejected before any fs access
    expect(response.status).toBe(404);
  });

  it("should return error.code NOT_FOUND for a path-traversal attempt", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent("../../etc/passwd")}`);
    const body = await response.json() as { error: { code: string } };

    // Assert
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("should return 404 when :name is all whitespace (blank name)", async () => {
    // Arrange — URL-encode a space so it reaches the route handler
    const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent("   ")}`);

    // Assert
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// S4 — GET /api/projects/:name/layer integration tests
// ---------------------------------------------------------------------------

/** Writes a minimal vault project .md with a given `path` field. */
async function _makeVaultProjectMd(
  vaultRoot: string,
  projectName: string,
  projectPath: string,
  hasProjectLayer: boolean = true,
): Promise<void> {
  await fs.writeFile(
    path.join(vaultRoot, "projects", `${projectName}.md`),
    `---
name: ${projectName}
path: ${projectPath}
stack: node-express+react
kuraka_version: "0.3.4"
has_project_layer: ${hasProjectLayer}
default_mode: normal
status: active
repo_url:
focus_scope:
last_mount: 2026-06-07
last_sync:
tags: []
---

# ${projectName}
`,
    "utf-8",
  );
}

describe("GET /api/projects/:name/layer — 200 populated tree (S4 integration)", () => {
  let projectDir: string;

  beforeEach(async () => {
    await _setupVault(false);
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-layer-int-"));
    // Create .claude/project/ with one file inside
    const layerRoot = path.join(projectDir, ".claude", "project");
    await fs.mkdir(layerRoot, { recursive: true });
    await fs.writeFile(path.join(layerRoot, "conventions.md"), "# conventions");

    await _makeVaultProjectMd(tempVaultRoot, "layer-project", projectDir);
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it("should return 200 with has_layer:true when .claude/project/ exists", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/layer-project/layer`);

    // Assert
    expect(response.status).toBe(200);
    const body = await response.json() as unknown;
    const parsed = LayerTreeResponse.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.has_layer).toBe(true);
      expect(parsed.data.root_rel).toBe(".claude/project");
      expect(parsed.data.nodes.length).toBeGreaterThan(0);
    }
  });

  it("should include the conventions.md file in the tree nodes", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/layer-project/layer`);
    const body = await response.json() as { nodes: Array<{ name: string; type: string }> };

    // Assert
    expect(body.nodes.some((n) => n.name === "conventions.md" && n.type === "file")).toBe(true);
  });
});

describe("GET /api/projects/:name/layer — 200 has_layer:false when dir absent (S4 integration)", () => {
  let projectDir: string;

  beforeEach(async () => {
    await _setupVault(false);
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-layer-absent-"));
    // Do NOT create .claude/project/ — registry flag disagrees (flag-drift test)
    await _makeVaultProjectMd(tempVaultRoot, "no-layer-project", projectDir, true);
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it("should return 200 with has_layer:false when .claude/project/ does not exist (flag-drift)", async () => {
    // Act — registry says has_project_layer:true but dir is absent
    const response = await fetch(`${baseUrl}/api/projects/no-layer-project/layer`);

    // Assert — 200 (not 404), has_layer reflects REAL fs state
    expect(response.status).toBe(200);
    const body = await response.json() as unknown;
    const parsed = LayerTreeResponse.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.has_layer).toBe(false);
      expect(parsed.data.nodes).toEqual([]);
      expect(parsed.data.empty).toBe(true);
    }
  });
});

describe("GET /api/projects/:name/layer — 404 for unknown name (S4 integration)", () => {
  beforeEach(async () => {
    await _setupVault(false);
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  it("should return 404 NOT_FOUND for a project name not in the vault", async () => {
    // Act
    const response = await fetch(`${baseUrl}/api/projects/ghost-project/layer`);

    // Assert
    expect(response.status).toBe(404);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// S4 — GET /api/projects/:name/layer/file integration tests
// ---------------------------------------------------------------------------

describe("GET /api/projects/:name/layer/file — 200 content (S4 integration)", () => {
  let projectDir: string;

  beforeEach(async () => {
    await _setupVault(false);
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "kuraka-layer-file-int-"));
    const layerRoot = path.join(projectDir, ".claude", "project");
    await fs.mkdir(layerRoot, { recursive: true });
    await fs.writeFile(
      path.join(layerRoot, "typescript.md"),
      "# TypeScript conventions",
      "utf-8",
    );

    await _makeVaultProjectMd(tempVaultRoot, "file-project", projectDir);
    const started = await _startServer(createApp({ vaultRoot: tempVaultRoot }));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it("should return 200 with file content for a valid contained rel path", async () => {
    // Act
    const response = await fetch(
      `${baseUrl}/api/projects/file-project/layer/file?path=typescript.md`,
    );

    // Assert
    expect(response.status).toBe(200);
    const body = await response.json() as unknown;
    const parsed = LayerFileResponse.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.content).toBe("# TypeScript conventions");
      expect(parsed.data.rel_path).toBe("typescript.md");
      expect(parsed.data.binary).toBe(false);
      expect(parsed.data.too_large).toBe(false);
    }
  });

  it("should return 403 PATH_FORBIDDEN for a traversal attack in ?path (SEC1 at route level)", async () => {
    // Act
    const response = await fetch(
      `${baseUrl}/api/projects/file-project/layer/file?path=${encodeURIComponent("../../../../etc/passwd")}`,
    );

    // Assert — route maps FORBIDDEN sentinel to 403
    expect(response.status).toBe(403);
    const body = await response.json() as { error: { code: string; detail: { rel: string } } };
    expect(body.error.code).toBe("PATH_FORBIDDEN");
    // SEC5/SEC10: detail carries only rel, not the resolved absolute path
    expect(body.error.detail.rel).toBe("../../../../etc/passwd");
    expect(body.error.detail).not.toHaveProperty("abs");
  });

  it("should return 404 NOT_FOUND for a valid contained rel that does not exist", async () => {
    // Act
    const response = await fetch(
      `${baseUrl}/api/projects/file-project/layer/file?path=nonexistent.md`,
    );

    // Assert
    expect(response.status).toBe(404);
    const body = await response.json() as { error: { code: string; detail: { rel: string } } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.detail.rel).toBe("nonexistent.md");
  });

  it("should return 400 BAD_REQUEST when ?path query parameter is missing", async () => {
    // Act — no ?path= at all
    const response = await fetch(
      `${baseUrl}/api/projects/file-project/layer/file`,
    );

    // Assert
    expect(response.status).toBe(400);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe("BAD_REQUEST");
  });
});
