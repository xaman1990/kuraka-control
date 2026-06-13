import { Governance } from "@kuraka-control/contracts";

interface GovernanceDotProps {
  governance: Governance;
  size?: "sm" | "md";
}

const sizeClass: Record<"sm" | "md", string> = {
  sm: "w-2 h-2",
  md: "w-3 h-3",
};

/**
 * GovernanceDot — a small colored circle indicating governance mode.
 * Gold = framework, jade = project (ADR-007 / AC-G1).
 * No hard-coded colors (AC-G2).
 */
export function GovernanceDot({ governance, size = "md" }: GovernanceDotProps) {
  const colorVar =
    governance === "framework" ? "var(--gov-framework)" : "var(--gov-project)";

  return (
    <span
      className={`inline-block rounded-full flex-shrink-0 ${sizeClass[size]}`}
      style={{ background: colorVar }}
      role="img"
      aria-label={`governance: ${governance}`}
    />
  );
}
