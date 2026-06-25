/**
 * Route — triage routes (mounted under /api in index.ts).
 *
 * GET  /triage              → 200 TriageListResponse | 500 ApiError(VAULT_UNREADABLE)
 * POST /triage/:id/route    → 200 TriageActionResponse | 400/403/404/500
 * POST /triage/:id/defer    → 200 TriageActionResponse | 403/404/500
 * POST /triage/:id/reject   → 200 TriageActionResponse | 403/404/500
 *
 * `createTriageRouter` accepts an optional vaultRoot so that createApp()
 * can inject a test-specific vault path without mutating process.env.
 *
 * Empty store (no .md files in retro-triage/) → 200 { docs: [], empty: true }.
 * Missing/unreadable retro-triage/ dir        → 500 VAULT_UNREADABLE.
 *
 * Error-code constants: module-level, never magic strings (SCHEMA-FROZEN-S5b-1 §8).
 */
import { Router } from "express";
import type { Request, Response } from "express";
import {
  TriageRouteRequest,
  TriageDeferRequest,
  TriageRejectRequest,
} from "@kuraka-control/contracts";
import { getTriageList } from "../services/triageList.js";
import {
  routeFinding,
  deferTriage,
  rejectTriage,
} from "../services/triageActions.js";
import { VaultUnreadableError } from "../repositories/projectRegistry.js";
import { WriteFirewallError } from "../repositories/writeFirewall.js";

// ── Error code constants — never magic strings ───────────────────────────────

const ERROR_CODE_VAULT_UNREADABLE = "VAULT_UNREADABLE" as const;
const ERROR_CODE_NOT_FOUND = "NOT_FOUND" as const;
const ERROR_CODE_BAD_REQUEST = "BAD_REQUEST" as const;
const ERROR_CODE_PATH_FORBIDDEN = "PATH_FORBIDDEN" as const;
const ERROR_CODE_WRITE_FAILED = "WRITE_FAILED" as const;

// ── Router factory ───────────────────────────────────────────────────────────

export interface TriageRouterOptions {
  vaultRoot?: string;
}

export function createTriageRouter(options: TriageRouterOptions = {}): Router {
  const router = Router();

  // ── GET /triage ─────────────────────────────────────────────────────────

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

  // ── Shared :id guard ─────────────────────────────────────────────────────

  /**
   * Guard: reject blank `:id` or any containing path separators.
   * Returns false and sends a 404 if the id is invalid.
   * Mirrors the `:name` guard in routes/projects.ts.
   */
  function validateId(id: string, res: Response): boolean {
    if (!id || id.trim() === "" || id.includes("/") || id.includes("\\")) {
      res.status(404).json({
        error: {
          code: ERROR_CODE_NOT_FOUND,
          message: `Triage document '${id}' not found`,
          detail: { id },
        },
      });
      return false;
    }
    return true;
  }

  // ── Shared error handler for write actions ────────────────────────────────

  function handleWriteError(err: unknown, id: string, res: Response): void {
    if (err instanceof WriteFirewallError) {
      if (err.code === ERROR_CODE_PATH_FORBIDDEN) {
        res.status(403).json({
          error: {
            code: ERROR_CODE_PATH_FORBIDDEN,
            message: "Write denied by the WriteFirewall",
            detail: { id },   // NEVER the absolute path (SEC5/SEC10)
          },
        });
        return;
      }
      if (err.code === ERROR_CODE_WRITE_FAILED) {
        res.status(500).json({
          error: {
            code: ERROR_CODE_WRITE_FAILED,
            message: "Write failed",
            detail: { id },
          },
        });
        return;
      }
    }
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
    // Unexpected error — re-throw so Express default handler logs it.
    throw err;
  }

  // ── POST /triage/:id/route ────────────────────────────────────────────────

  router.post("/triage/:id/route", async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!validateId(id ?? "", res)) return;

    const parseResult = TriageRouteRequest.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODE_BAD_REQUEST,
          message: "Invalid request body",
          detail: {},
        },
      });
      return;
    }

    const { finding_id, routing } = parseResult.data;

    try {
      const result = await routeFinding({
        id: id!,
        finding_id,
        routing,
        vaultRoot: options.vaultRoot,
      });

      if (result === "NOT_FOUND") {
        res.status(404).json({
          error: {
            code: ERROR_CODE_NOT_FOUND,
            message: `Triage document or finding '${id}' not found`,
            detail: { id },
          },
        });
        return;
      }

      if (result === "BAD_REQUEST") {
        res.status(400).json({
          error: {
            code: ERROR_CODE_BAD_REQUEST,
            message: "finding_id is required for route action",
            detail: { id },
          },
        });
        return;
      }

      res.json({ doc: result });
    } catch (err) {
      handleWriteError(err, id!, res);
    }
  });

  // ── POST /triage/:id/defer ────────────────────────────────────────────────

  router.post("/triage/:id/defer", async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!validateId(id ?? "", res)) return;

    const parseResult = TriageDeferRequest.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODE_BAD_REQUEST,
          message: "Invalid request body",
          detail: {},
        },
      });
      return;
    }

    const { finding_id } = parseResult.data;

    try {
      const result = await deferTriage({
        id: id!,
        finding_id,
        vaultRoot: options.vaultRoot,
      });

      if (result === "NOT_FOUND") {
        res.status(404).json({
          error: {
            code: ERROR_CODE_NOT_FOUND,
            message: `Triage document or finding '${id}' not found`,
            detail: { id },
          },
        });
        return;
      }

      if (result === "BAD_REQUEST") {
        res.status(400).json({
          error: {
            code: ERROR_CODE_BAD_REQUEST,
            message: "Bad request",
            detail: { id },
          },
        });
        return;
      }

      res.json({ doc: result });
    } catch (err) {
      handleWriteError(err, id!, res);
    }
  });

  // ── POST /triage/:id/reject ───────────────────────────────────────────────

  router.post("/triage/:id/reject", async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!validateId(id ?? "", res)) return;

    const parseResult = TriageRejectRequest.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODE_BAD_REQUEST,
          message: "Invalid request body",
          detail: {},
        },
      });
      return;
    }

    const { finding_id } = parseResult.data;

    try {
      const result = await rejectTriage({
        id: id!,
        finding_id,
        vaultRoot: options.vaultRoot,
      });

      if (result === "NOT_FOUND") {
        res.status(404).json({
          error: {
            code: ERROR_CODE_NOT_FOUND,
            message: `Triage document or finding '${id}' not found`,
            detail: { id },
          },
        });
        return;
      }

      if (result === "BAD_REQUEST") {
        res.status(400).json({
          error: {
            code: ERROR_CODE_BAD_REQUEST,
            message: "Bad request",
            detail: { id },
          },
        });
        return;
      }

      res.json({ doc: result });
    } catch (err) {
      handleWriteError(err, id!, res);
    }
  });

  return router;
}
