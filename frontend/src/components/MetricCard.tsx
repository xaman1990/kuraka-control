import { Governance } from "@kuraka-control/contracts";
import { GovernanceDot } from "./GovernanceDot.js";

interface MetricCardProps {
  label: string;
  value: string | number;
  governance?: Governance | null;
  hint?: string | null;
}

/**
 * MetricCard — displays a single KPI with optional governance indicator and hint.
 * No hard-coded colors (AC-G2).
 */
export function MetricCard({ label, value, governance = null, hint = null }: MetricCardProps) {
  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-lg"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--text-3)" }}
        >
          {label}
        </span>
        {governance !== null && (
          <GovernanceDot governance={governance} size="sm" />
        )}
      </div>

      <span
        className="text-2xl font-bold tabular-nums"
        style={{ color: "var(--text)" }}
      >
        {value}
      </span>

      {hint !== null && (
        <span
          className="text-xs"
          style={{ color: "var(--text-2)" }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
