import { Governance } from "@kuraka-control/contracts";

interface GovernanceBadgeProps {
  governance: Governance;
  label?: string | null;
}

/**
 * GovernanceBadge — shows the governance mode as a small pill.
 * Gold = framework, jade = project (ADR-007 / AC-G1).
 * No hard-coded colors (AC-G2) — all via CSS vars from tokens.css.
 */
export function GovernanceBadge({ governance, label }: GovernanceBadgeProps) {
  const colorVar =
    governance === "framework" ? "var(--gov-framework)" : "var(--gov-project)";

  const displayLabel = label ?? governance;

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{
        border: `1px solid ${colorVar}`,
        color: colorVar,
        background: "var(--surface-2)",
      }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: colorVar }}
        aria-hidden="true"
      />
      {displayLabel}
    </span>
  );
}
