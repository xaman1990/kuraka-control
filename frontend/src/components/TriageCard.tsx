import { useNavigate } from "react-router-dom";
import type { KeyboardEvent } from "react";
import type { TriageDoc, TriageFinding } from "@kuraka-control/contracts";
import { Badge } from "./Badge.js";
import type { BadgeVariant } from "./Badge.js";
import { GovernanceBadge } from "./GovernanceBadge.js";

// ── Severity variant map (LL-009: declared once, exported) ────────────────────

/** Maps externally-owned severity strings to Badge variants. Neutral fallback. */
export const SEVERITY_VARIANT_MAP: Record<string, BadgeVariant> = {
  HIGH: "accent",
  MED: "warning",
  LOW: "neutral",
  CRITICAL: "accent",
};

export function severityVariant(severity: string | null): BadgeVariant {
  if (severity === null) return "neutral";
  return SEVERITY_VARIANT_MAP[severity.toUpperCase()] ?? "neutral";
}

// ── Routing badge helper ──────────────────────────────────────────────────────

/**
 * Routing badge — two-color governance (F5).
 * `null` routing → neutral Badge.
 * Value containing "framework" (case-insensitive) → GovernanceBadge framework (gold).
 * Otherwise → GovernanceBadge project (jade).
 */
export function RoutingBadge({ routing }: { routing: string | null }) {
  if (routing === null) {
    return <Badge variant="neutral">—</Badge>;
  }
  const lower = routing.toLowerCase();
  if (lower.includes("framework")) {
    return <GovernanceBadge governance="framework" label={routing} />;
  }
  return <GovernanceBadge governance="project" label={routing} />;
}

// ── TriageCard ────────────────────────────────────────────────────────────────

export interface TriageCardProps {
  /** The individual finding row */
  finding: TriageFinding;
  /** Parent doc's id — used to navigate to /triage/:id */
  docId: TriageDoc["id"];
  /** Parent doc's project name — context label */
  docProject: TriageDoc["project"];
  /** Parent doc's date — context label */
  docDate: TriageDoc["date"];
}

/**
 * TriageCard — one card per finding, per the Pencil design spec.
 * Width: 240px. Sections:
 *   Title  — finding text ($text, 13px)
 *   Meta   — routing badge + severity badge
 *   Target — target_file ($text-3, 11px, monospace)
 * Clicking navigates to the parent doc's detail at /triage/:docId.
 */
export function TriageCard({
  finding,
  docId,
  docProject,
  docDate,
}: TriageCardProps) {
  const navigate = useNavigate();

  function handleClick() {
    navigate(`/triage/${encodeURIComponent(docId)}`);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Triage finding: ${finding.finding ?? "untitled"}`}
      style={{
        width: "240px",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {/* Context: project + date */}
      {(docProject !== null || docDate !== null) && (
        <p
          style={{
            fontSize: "10px",
            color: "var(--text-3)",
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {[docProject, docDate].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* Title — finding description */}
      <p
        style={{
          fontSize: "13px",
          color: "var(--text)",
          margin: 0,
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}
      >
        {finding.finding ?? <em style={{ color: "var(--text-3)" }}>No description</em>}
      </p>

      {/* Meta — routing + severity badges */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
        <RoutingBadge routing={finding.routing} />
        <Badge variant={severityVariant(finding.severity)}>
          {finding.severity ?? "—"}
        </Badge>
      </div>

      {/* Target — target_file */}
      {finding.target_file !== null && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--text-3)",
            margin: 0,
            fontFamily: "monospace",
            wordBreak: "break-all",
            lineHeight: 1.4,
          }}
        >
          {finding.target_file}
        </p>
      )}
    </div>
  );
}
