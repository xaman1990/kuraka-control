import { ReactNode } from "react";

type BadgeVariant = "neutral" | "accent" | "jade" | "muted";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, { color: string; borderColor: string; background: string }> = {
  neutral: {
    background: "var(--surface-2)",
    borderColor: "var(--border)",
    color: "var(--text-2)",
  },
  accent: {
    background: "var(--surface-2)",
    borderColor: "var(--accent)",
    color: "var(--accent)",
  },
  jade: {
    background: "var(--surface-2)",
    borderColor: "var(--jade)",
    color: "var(--jade)",
  },
  muted: {
    background: "var(--surface-2)",
    borderColor: "var(--border)",
    color: "var(--text-3)",
  },
};

/**
 * Badge — generic status/label pill.
 * Variants: neutral | accent | jade | muted.
 * No hard-coded colors (AC-G2) — all via CSS vars from tokens.css.
 */
export function Badge({ children, variant = "neutral" }: BadgeProps) {
  const styles = variantStyles[variant];

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{
        background: styles.background,
        border: `1px solid ${styles.borderColor}`,
        color: styles.color,
      }}
    >
      {children}
    </span>
  );
}
