import type { ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TriageFinding } from "@kuraka-control/contracts";
import {
  TRIAGE_ERROR_PATH_FORBIDDEN,
  TRIAGE_ERROR_WRITE_FAILED,
} from "@kuraka-control/contracts";
import { routeFinding, deferTriage, rejectTriage } from "../api/triage.js";
import type { TriageActionError } from "../api/triage.js";

// ── Inline error display ──────────────────────────────────────────────────────

interface ActionErrorProps {
  error: unknown;
}

function ActionError({ error }: ActionErrorProps) {
  if (error === null || error === undefined) return null;

  const e = error as TriageActionError;
  let message = "Action failed.";

  if (e?.code === TRIAGE_ERROR_PATH_FORBIDDEN) {
    message = "Write not permitted (path forbidden).";
  } else if (e?.code === TRIAGE_ERROR_WRITE_FAILED) {
    message = "Write failed — check vault permissions.";
  } else if (e?.code === "NOT_FOUND") {
    message = "Finding not found.";
  } else if (e?.code === "BAD_REQUEST") {
    message = "Invalid request.";
  } else if (e?.message) {
    message = e.message;
  }

  return (
    <span
      role="alert"
      style={{
        fontSize: "11px",
        color: "var(--accent)",
        marginLeft: "8px",
        display: "inline-block",
      }}
    >
      {message}
    </span>
  );
}

// ── FindingRoutingControl — per-row routing select ─────────────────────────────

export interface FindingRoutingControlProps {
  docId: string;
  finding: TriageFinding;
}

/**
 * FindingRoutingControl — small <select> for framework/project routing on a finding.
 * Calls routeFinding on change; disables while in flight; shows inline error on failure.
 */
export function FindingRoutingControl({ docId, finding }: FindingRoutingControlProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (routing: "framework" | "project") =>
      routeFinding(docId, {
        finding_id: finding.id ?? "",
        routing,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["triage"] });
    },
  });

  const currentRouting = finding.routing?.toLowerCase();
  const isKnownRouting =
    currentRouting === "framework" || currentRouting === "project";
  const selectValue = isKnownRouting ? (currentRouting as "framework" | "project") : "";

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as "framework" | "project";
    if (!value) return;
    if (!finding.id) return;
    mutation.mutate(value);
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
      <select
        value={selectValue}
        onChange={handleChange}
        disabled={mutation.isPending || !finding.id}
        aria-disabled={mutation.isPending || !finding.id}
        aria-label={`Routing for finding ${finding.id ?? "unknown"}`}
        style={{
          fontSize: "12px",
          padding: "2px 6px",
          borderRadius: "4px",
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--text-2)",
          cursor: mutation.isPending ? "wait" : "pointer",
          opacity: mutation.isPending ? 0.6 : 1,
        }}
      >
        <option value="">—</option>
        <option value="framework">framework</option>
        <option value="project">project</option>
      </select>
      {mutation.isError && <ActionError error={mutation.error} />}
    </span>
  );
}

// ── DocLevelActions — Defer + Reject buttons for the card header ───────────────

export interface DocLevelActionsProps {
  docId: string;
}

/**
 * DocLevelActions — card-level Defer and Reject buttons.
 * Uses card-level API calls (no finding_id). Invalidates ["triage"] on success.
 */
export function DocLevelActions({ docId }: DocLevelActionsProps) {
  const queryClient = useQueryClient();

  const deferMutation = useMutation({
    mutationFn: () => deferTriage(docId, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["triage"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectTriage(docId, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["triage"] });
    },
  });

  const anyPending = deferMutation.isPending || rejectMutation.isPending;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => deferMutation.mutate()}
        disabled={anyPending}
        aria-disabled={anyPending}
        style={{
          fontSize: "12px",
          padding: "4px 12px",
          borderRadius: "6px",
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--text-2)",
          cursor: anyPending ? "wait" : "pointer",
          opacity: anyPending ? 0.6 : 1,
        }}
      >
        {deferMutation.isPending ? "Deferring…" : "Defer"}
      </button>

      <button
        type="button"
        onClick={() => rejectMutation.mutate()}
        disabled={anyPending}
        aria-disabled={anyPending}
        style={{
          fontSize: "12px",
          padding: "4px 12px",
          borderRadius: "6px",
          border: "1px solid var(--accent)",
          background: "var(--surface-2)",
          color: "var(--accent)",
          cursor: anyPending ? "wait" : "pointer",
          opacity: anyPending ? 0.6 : 1,
        }}
      >
        {rejectMutation.isPending ? "Rejecting…" : "Reject"}
      </button>

      {deferMutation.isError && <ActionError error={deferMutation.error} />}
      {rejectMutation.isError && <ActionError error={rejectMutation.error} />}
    </div>
  );
}
