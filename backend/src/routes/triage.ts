/**
 * Route — triage routes (mounted under /api in index.ts).
 *
 * GET /triage  → 200 TriageListResponse | 500 ApiError(VAULT_UNREADABLE)
 *
 * `createTriageRouter` accepts an optional vaultRoot so that createApp()
 * can inject a test-specific vault path without mutating process.env.
 *
 * Empty store (no .md files in retro-triage/) → 200 { docs: [], empty: true }.
 * Missing/unreadable retro-triage/ dir        → 500 VAULT_UNREADABLE.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { getTriageList } from "../services/triageList.js";
import { VaultUnreadableError } from "../repositories/projectRegistry.js";

/** Error code constant — never a magic string (mirror projects route). */
const ERROR_CODE_VAULT_UNREADABLE = "VAULT_UNREADABLE" as const;

export interface TriageRouterOptions {
  vaultRoot?: string;
}

export function createTriageRouter(options: TriageRouterOptions = {}): Router {
  const router = Router();

  router.get("/triage", async (_req: Request, res: Response) => {
    try {
      const payload = await getTriageList({ vaultRoot: options.vaultRoot });
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
