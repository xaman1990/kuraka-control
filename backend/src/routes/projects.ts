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
import { VaultUnreadableError } from "../repositories/projectRegistry.js";

/** Error code constants — never magic strings. */
const ERROR_CODE_VAULT_UNREADABLE = "VAULT_UNREADABLE" as const;
const ERROR_CODE_NOT_FOUND = "NOT_FOUND" as const;

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

  return router;
}

/** Default singleton export for backward compatibility (used by legacy imports). */
export const projectsRouter = createProjectsRouter();
