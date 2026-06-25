/**
 * Service — triage write actions (S5b-1).
 *
 * Three use-case functions: routeFinding, deferTriage, rejectTriage.
 * Each reads the target card, applies a pure domain transformation, writes
 * atomically through the WriteFirewall, then re-reads from disk to return
 * the fresh TriageDoc (disk truth — SCHEMA-FROZEN-S5b-1 §6/§7).
 *
 * String sentinels mirror projectLayer.ts: "NOT_FOUND" | "BAD_REQUEST".
 * WriteFirewallError propagates to the route layer uncaught.
 * VaultUnreadableError propagates to the route layer uncaught.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { TriageDoc } from "@kuraka-control/contracts";
import type { TriageRouting } from "@kuraka-control/contracts";
import { parseTriageDoc } from "../domain/triage.js";
import { setFindingCell, setFrontmatterDecision } from "../domain/triage.js";
import {
  writeTriageRecord,
  TRIAGE_RECORD_DIR,
} from "../repositories/writeFirewall.js";
import { env } from "../config/env.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type ActionResult = TriageDoc | "NOT_FOUND" | "BAD_REQUEST";

export interface RouteInput {
  id: string;
  finding_id?: string;
  routing: TriageRouting;
  vaultRoot?: string;
}

export interface DeferInput {
  id: string;
  finding_id?: string;
  vaultRoot?: string;
}

export interface RejectInput {
  id: string;
  finding_id?: string;
  vaultRoot?: string;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Read the raw card text; return null on ENOENT, rethrow anything else. */
async function readCard(cardPath: string): Promise<string | null> {
  try {
    return await fs.readFile(cardPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Re-read the written card from disk and return a fresh TriageDoc.
 * This is the "disk truth" re-read mandated by SCHEMA-FROZEN-S5b-1 §6.
 */
async function reReadCard(vaultRoot: string, id: string): Promise<TriageDoc> {
  const cardPath = path.join(vaultRoot, TRIAGE_RECORD_DIR, `${id}.md`);
  const written = await fs.readFile(cardPath, "utf-8");
  return { id, ...parseTriageDoc(written) };
}

// ── Public action functions ───────────────────────────────────────────────────

/**
 * Route a finding to "framework" or "project".
 *
 * finding_id is REQUIRED for route (a card has no single routing).
 * Absent finding_id → "BAD_REQUEST".
 * Unknown finding_id (setFindingCell no-op) → "NOT_FOUND".
 */
export async function routeFinding(input: RouteInput): Promise<ActionResult> {
  const vaultRoot = input.vaultRoot ?? env.vaultRoot;
  const triageDir = path.join(vaultRoot, TRIAGE_RECORD_DIR);
  const cardPath = path.join(triageDir, `${input.id}.md`);

  // finding_id is required for route action.
  if (!input.finding_id) {
    return "BAD_REQUEST";
  }

  const raw = await readCard(cardPath);
  if (raw === null) return "NOT_FOUND";

  const newText = setFindingCell(raw, input.finding_id, 2, input.routing);

  // No-op detection: setFindingCell returned unchanged text → unknown finding_id.
  if (newText === raw) return "NOT_FOUND";

  await writeTriageRecord(triageDir, `${input.id}.md`, newText);
  return reReadCard(vaultRoot, input.id);
}

/**
 * Defer a finding (col 5 → "deferred") or a whole card (frontmatter decision → "deferred").
 *
 * finding_id present → sets status cell for that row.
 * finding_id absent  → sets frontmatter `decision: deferred`.
 * Unknown finding_id → "NOT_FOUND".
 */
export async function deferTriage(input: DeferInput): Promise<ActionResult> {
  const vaultRoot = input.vaultRoot ?? env.vaultRoot;
  const triageDir = path.join(vaultRoot, TRIAGE_RECORD_DIR);
  const cardPath = path.join(triageDir, `${input.id}.md`);

  const raw = await readCard(cardPath);
  if (raw === null) return "NOT_FOUND";

  let newText: string;

  if (input.finding_id) {
    newText = setFindingCell(raw, input.finding_id, 5, "deferred");
    if (newText === raw) return "NOT_FOUND";
  } else {
    // Card-level defer: setFrontmatterDecision idempotent no-op is a valid success.
    newText = setFrontmatterDecision(raw, "deferred");
  }

  await writeTriageRecord(triageDir, `${input.id}.md`, newText);
  return reReadCard(vaultRoot, input.id);
}

/**
 * Reject a finding (col 5 → "rejected") or a whole card (frontmatter decision → "rejected").
 *
 * finding_id present → sets status cell for that row.
 * finding_id absent  → sets frontmatter `decision: rejected`.
 * Unknown finding_id → "NOT_FOUND".
 */
export async function rejectTriage(input: RejectInput): Promise<ActionResult> {
  const vaultRoot = input.vaultRoot ?? env.vaultRoot;
  const triageDir = path.join(vaultRoot, TRIAGE_RECORD_DIR);
  const cardPath = path.join(triageDir, `${input.id}.md`);

  const raw = await readCard(cardPath);
  if (raw === null) return "NOT_FOUND";

  let newText: string;

  if (input.finding_id) {
    newText = setFindingCell(raw, input.finding_id, 5, "rejected");
    if (newText === raw) return "NOT_FOUND";
  } else {
    // Card-level reject: setFrontmatterDecision idempotent no-op is a valid success.
    newText = setFrontmatterDecision(raw, "rejected");
  }

  await writeTriageRecord(triageDir, `${input.id}.md`, newText);
  return reReadCard(vaultRoot, input.id);
}
