import { Link } from "react-router-dom";
import { Governance } from "@kuraka-control/contracts";
import { Badge } from "./Badge.js";
import { GovernanceBadge } from "./GovernanceBadge.js";

/**
 * KNOWN_STATUS_VARIANT — maps known vault status values to Badge variants.
 * Unknown statuses fall back to "neutral" and display the literal string.
 * Co-located here (not in contracts) because the status vocabulary is
 * owned by the vault, not the API seam (AC-15).
 */
export const KNOWN_STATUS_VARIANT: Record<string, "accent" | "jade" | "neutral" | "muted"> = {
  active: "jade",
  paused: "neutral",
  onboarding: "accent",
  archived: "muted",
  mapped: "accent",
};

interface ProjectCardProps {
  name: string;
  stack: string;
  status: string;
  governance: Governance;
  kuraka_version?: string | null;
}

/**
 * ProjectCard — summarizes a registered project with stack, status, governance,
 * and version. The whole card is a clickable link to /projects/:name (AC-16).
 * No hard-coded colors (uses CSS tokens). Props use snake_case to mirror
 * ProjectSummary fields directly (AC-17).
 */
export function ProjectCard({
  name,
  stack,
  status,
  governance,
  kuraka_version = null,
}: ProjectCardProps) {
  const badgeVariant = KNOWN_STATUS_VARIANT[status] ?? "neutral";

  return (
    <Link
      to={`/projects/${name}`}
      className="flex flex-col gap-3 p-4 rounded-lg no-underline"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className="text-base font-semibold leading-tight"
          style={{ color: "var(--text)" }}
        >
          {name}
        </h3>
        <GovernanceBadge governance={governance} />
      </div>

      <p
        className="text-sm"
        style={{ color: "var(--text-2)" }}
      >
        {stack}
      </p>

      <div className="flex items-center justify-between gap-2">
        <Badge variant={badgeVariant}>{status}</Badge>
        {kuraka_version !== null && (
          <span
            className="text-xs font-mono"
            style={{ color: "var(--text-3)" }}
          >
            v{kuraka_version}
          </span>
        )}
      </div>
    </Link>
  );
}
