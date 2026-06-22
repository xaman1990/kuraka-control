import type { Drift, DriftState } from "@kuraka-control/contracts";
import { Badge, BadgeVariant } from "./Badge.js";

// ── Display map ───────────────────────────────────────────────────────────────

interface DriftDisplay {
  variant: BadgeVariant;
  label: string;
}

/**
 * DRIFT_DISPLAY_MAP — module-level owner of the drift → display mapping (LL-009).
 * Each entry defines the Badge variant and a base label for the drift state.
 * Version hints are appended at render time for "behind" and "ahead" states.
 */
export const DRIFT_DISPLAY_MAP: Record<DriftState, DriftDisplay> = {
  up_to_date: { variant: "jade",    label: "up to date" },
  behind:     { variant: "warning", label: "behind"     },
  ahead:      { variant: "accent",  label: "ahead"      },
  not_pinned: { variant: "muted",   label: "not pinned" },
  unknown:    { variant: "muted",   label: "unknown"    },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLabel(drift: Drift): string {
  const base = DRIFT_DISPLAY_MAP[drift.state]?.label ?? drift.state;

  if (
    (drift.state === "behind" || drift.state === "ahead") &&
    drift.lock_version !== null &&
    drift.vault_version !== null
  ) {
    return `${base} · ${drift.lock_version} → ${drift.vault_version}`;
  }

  return base;
}

function resolveVariant(state: DriftState): BadgeVariant {
  return DRIFT_DISPLAY_MAP[state]?.variant ?? "neutral";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DriftBadgeProps {
  drift: Drift;
}

/**
 * DriftBadge — pill showing framework drift state.
 * Pill style: fill=surface-2, stroke=<state color>, radius-pill, small label.
 * When state is "behind" or "ahead" and both versions are present, appends
 * "· {lock_version} → {vault_version}" to the label.
 * When registry_matches_lock is false, renders an adjacent "registry stamp out
 * of date" chip (AC-26).
 * No hard-coded colors — all via CSS vars from tokens.css.
 */
export function DriftBadge({ drift }: DriftBadgeProps) {
  const label = buildLabel(drift);
  const variant = resolveVariant(drift.state);

  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant={variant}>{label}</Badge>
      {drift.registry_matches_lock === false && (
        <Badge variant="muted">registry stamp out of date</Badge>
      )}
    </span>
  );
}
