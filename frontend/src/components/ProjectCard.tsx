import { Governance } from "@kuraka-control/contracts";
import { Badge } from "./Badge.js";
import { GovernanceBadge } from "./GovernanceBadge.js";

type ProjectStatus = "active" | "paused" | "onboarding" | "archived";

interface ProjectCardProps {
  name: string;
  stack: string;
  status: ProjectStatus;
  governance: Governance;
  kurakaVersion?: string | null;
}

const statusVariant: Record<ProjectStatus, "accent" | "jade" | "neutral" | "muted"> = {
  active: "jade",
  paused: "neutral",
  onboarding: "accent",
  archived: "muted",
};

/**
 * ProjectCard — summarizes a project with its stack, status, governance, and version.
 * No hard-coded colors (AC-G2). Status rendered via Badge (delegates color to tokens).
 */
export function ProjectCard({
  name,
  stack,
  status,
  governance,
  kurakaVersion = null,
}: ProjectCardProps) {
  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-lg"
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
        <Badge variant={statusVariant[status]}>{status}</Badge>
        {kurakaVersion !== null && (
          <span
            className="text-xs font-mono"
            style={{ color: "var(--text-3)" }}
          >
            v{kurakaVersion}
          </span>
        )}
      </div>
    </div>
  );
}
