/**
 * Route — GET /projects (mounted under /api in index.ts).
 *
 * Returns 200 ProjectListResponse on success.
 * Returns 500 ApiError{ code: "VAULT_UNREADABLE" } when the vault directory
 * is missing or unreadable.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { getProjectList } from "../services/projectList.js";
import { VaultUnreadableError } from "../repositories/projectRegistry.js";

/** Error code constant — never a magic string. */
const ERROR_CODE_VAULT_UNREADABLE = "VAULT_UNREADABLE" as const;

export const projectsRouter = Router();

projectsRouter.get("/projects", async (_req: Request, res: Response) => {
  try {
    const payload = await getProjectList();
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
