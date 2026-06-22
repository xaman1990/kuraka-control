/**
 * Route — GET /projects (mounted under /api in index.ts).
 *
 * Returns 200 ProjectListResponse on success.
 * Returns 500 ApiError{ code: "VAULT_UNREADABLE" } when the vault directory
 * is missing or unreadable.
 *
 * `createProjectsRouter` accepts an optional vaultRoot so that createApp()
 * can inject a test-specific vault path without mutating process.env.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { getProjectList } from "../services/projectList.js";
import { VaultUnreadableError } from "../repositories/projectRegistry.js";

/** Error code constant — never a magic string. */
const ERROR_CODE_VAULT_UNREADABLE = "VAULT_UNREADABLE" as const;

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

  return router;
}

/** Default singleton export for backward compatibility (used by legacy imports). */
export const projectsRouter = createProjectsRouter();
