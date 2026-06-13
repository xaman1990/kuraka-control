import { Governance } from "@kuraka-control/contracts";
import { GovernanceBadge } from "./GovernanceBadge.js";

interface AgentCardProps {
  name: string;
  agentKey: string;
  governance: Governance;
}

/**
 * AgentCard — displays an agent with its per-agent color dot and governance badge.
 * The dot color is resolved dynamically via `var(--ag-${agentKey})` — never a literal.
 * (AC-G2: no hard-coded colors in .tsx).
 */
export function AgentCard({ name, agentKey, governance }: AgentCardProps) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ background: `var(--ag-${agentKey})` }}
        role="img"
        aria-label={`${agentKey} color indicator`}
      />

      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span
          className="text-sm font-medium truncate"
          style={{ color: "var(--text)" }}
        >
          {name}
        </span>
        <span
          className="text-xs font-mono truncate"
          style={{ color: "var(--text-3)" }}
        >
          {agentKey}
        </span>
      </div>

      <GovernanceBadge governance={governance} />
    </div>
  );
}
