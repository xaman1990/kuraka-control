/**
 * Route — project routes (mounted under /api in index.ts).
 *
 * GET /projects         → 200 ProjectListResponse | 500 ApiError(VAULT_UNREADABLE)
 * GET /projects/:name   → 200 ProjectDetail      | 404 ApiError(NOT_FOUND)
 *
 * `createProjectsRouter` accepts an optional vaultRoot so that createApp()
 * can inject a test-specific vault path without mutating process.env.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { getProjectList } from "../services/projectList.js";
import { getProjectDetail } from "../services/projectDetail.js";
import { getLayerTree, getLayerFile } from "../services/projectLayer.js";
import { VaultUnreadableError } from "../repositories/projectRegistry.js";

/** Error code constants — never magic strings. */
const ERROR_CODE_VAULT_UNREADABLE = "VAULT_UNREADABLE" as const;
const ERROR_CODE_NOT_FOUND = "NOT_FOUND" as const;
const ERROR_CODE_PATH_FORBIDDEN = "PATH_FORBIDDEN" as const;
const ERROR_CODE_BAD_REQUEST = "BAD_REQUEST" as const;

export interface ProjectsRouterOptions {
  vaultRoot?: string;
}

export function createProjectsRouter(options: ProjectsRouterOptions = {}): Router {
  const router = Router();

  router.get("/projects", async (_req: Request, res: Response) => {
    try {
      const payload = await getProjectList({ vaultRoot: options.vaultRoot });
      res.json(payload);
    } catch (err) {
      if (err instanceof VaultUnreadableError) {
        res.status(500).json({
          error: {
            code: ERROR_CODE_VAULT_UNREADABLE,
            message: "Cannot read the Kuraka vault",
            detail: { path: err.vaultPath },
          },
        });
        return;
      }
      // Unexpected error — re-throw so Express default handler logs it
      throw err;
    }
  });

  router.get("/projects/:name", async (req: Request, res: Response) => {
    const { name } = req.params;

    // Defense in depth: reject blank or path-separator-containing names.
    // The name never reaches the filesystem regardless, but this catches
    // malformed requests early.
    if (
      !name ||
      name.trim() === "" ||
      name.includes("/") ||
      name.includes("\\")
    ) {
      res.status(404).json({
        error: {
          code: ERROR_CODE_NOT_FOUND,
          message: `Project '${name}' is not registered in the vault`,
          detail: { name },
        },
      });
      return;
    }

    try {
      const result = await getProjectDetail(name, { vaultRoot: options.vaultRoot });

      if (result === "NOT_FOUND") {
        res.status(404).json({
          error: {
            code: ERROR_CODE_NOT_FOUND,
            message: `Project '${name}' is not registered in the vault`,
            detail: { name },
          },
        });
        return;
      }

      res.json(result);
    } catch (err) {
      if (err instanceof VaultUnreadableError) {
        res.status(500).json({
          error: {
            code: ERROR_CODE_VAULT_UNREADABLE,
            message: "Cannot read the Kuraka vault",
            detail: { path: err.vaultPath },
          },
        });
        return;
      }
      // Unexpected error — re-throw so Express default handler logs it
      throw err;
    }
  });

  // ── GET /projects/:name/layer ───────────────────────────────────────────────
  // Returns LayerTreeResponse (200) or NOT_FOUND (404) or VAULT_UNREADABLE (500).
  // An absent .claude/project/ dir degrades to has_layer:false (200), never 404.
  router.get("/projects/:name/layer", async (req: Request, res: Response) => {
    const { name } = req.params;

    // Defense in depth: reject blank or path-separator-containing names.
    if (
      !name ||
      name.trim() === "" ||
      name.includes("/") ||
      name.includes("\\")
    ) {
      res.status(404).json({
        error: {
          code: ERROR_CODE_NOT_FOUND,
          message: `Project '${name}' is not registered in the vault`,
          detail: { name },
        },
      });
      return;
    }

    try {
      const result = await getLayerTree(name, { vaultRoot: options.vaultRoot });

      if (result === "NOT_FOUND") {
        res.status(404).json({
          error: {
            code: ERROR_CODE_NOT_FOUND,
            message: `Project '${name}' is not registered in the vault`,
            detail: { name },
          },
        });
        return;
      }

      res.json(result);
    } catch (err) {
      if (err instanceof VaultUnreadableError) {
        res.status(500).json({
          error: {
            code: ERROR_CODE_VAULT_UNREADABLE,
            message: "Cannot read the Kuraka vault",
            detail: { path: err.vaultPath },
          },
        });
        return;
      }
      throw err;
    }
  });

  // ── GET /projects/:name/layer/file?path=<rel> ───────────────────────────────
  // Returns LayerFileResponse (200), BAD_REQUEST (400), PATH_FORBIDDEN (403),
  // NOT_FOUND (404), or VAULT_UNREADABLE (500).
  // The :name registry guard fires BEFORE any path containment work.
  router.get("/projects/:name/layer/file", async (req: Request, res: Response) => {
    const { name } = req.params;

    // Defense in depth: reject blank or path-separator-containing names (same
    // guard as the tree endpoint — fires before looking at ?path).
    if (
      !name ||
      name.trim() === "" ||
      name.includes("/") ||
      name.includes("\\")
    ) {
      res.status(404).json({
        error: {
          code: ERROR_CODE_NOT_FOUND,
          message: `Project '${name}' is not registered in the vault`,
          detail: { name },
        },
      });
      return;
    }

    // Extract ?path query parameter as the rel string.
    const rel = typeof req.query["path"] === "string" ? req.query["path"] : "";

    try {
      const result = await getLayerFile(name, rel, { vaultRoot: options.vaultRoot });

      if (result === "BAD_REQUEST") {
        res.status(400).json({
          error: {
            code: ERROR_CODE_BAD_REQUEST,
            message: "Missing 'path' query parameter",
            detail: { rel: "" },
          },
        });
        return;
      }

      if (result === "FORBIDDEN") {
        // SEC5 / SEC10: detail carries only { rel } — never the resolved absolute path.
        res.status(403).json({
          error: {
            code: ERROR_CODE_PATH_FORBIDDEN,
            message: "Path escapes the layer root",
            detail: { rel },
          },
        });
        return;
      }

      if (result === "NOT_FOUND") {
        res.status(404).json({
          error: {
            code: ERROR_CODE_NOT_FOUND,
            message: "File not found",
            detail: { rel },
          },
        });
        return;
      }

      res.json(result);
    } catch (err) {
      if (err instanceof VaultUnreadableError) {
        res.status(500).json({
          error: {
            code: ERROR_CODE_VAULT_UNREADABLE,
            message: "Cannot read the Kuraka vault",
            detail: { path: err.vaultPath },
          },
        });
        return;
      }
      throw err;
    }
  });

  return router;
}

/** Default singleton export for backward compatibility (used by legacy imports). */
export const projectsRouter = createProjectsRouter();
