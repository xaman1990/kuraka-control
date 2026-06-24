import { ProjectConfig } from "@kuraka-control/contracts";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Renders a muted dash for absent values — never displays "null" or blank. */
function dash(): string {
  return "—";
}

function joinStack(lang: string | null, framework: string | null): string | null {
  const parts = [lang, framework].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  return parts.join(" / ");
}

function formatLimits(fileLoc: number | null, fnLoc: number | null): string | null {
  const parts: string[] = [];
  if (fileLoc !== null) parts.push(`file ${fileLoc}`);
  if (fnLoc !== null) parts.push(`fn ${fnLoc}`);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

// ── Row mapping ───────────────────────────────────────────────────────────────

/**
 * CONFIG_ROW_MAP — module-level owner of the config field → display mapping (LL-009).
 * Each entry is a [label, value | null] tuple; null means the row is hidden.
 */
export function buildConfigRows(
  config: ProjectConfig,
): Array<{ label: string; value: string }> {
  const candidates: Array<{ label: string; value: string | null }> = [
    { label: "Stack backend", value: joinStack(config.backend_language, config.backend_framework) },
    { label: "Stack frontend", value: joinStack(config.frontend_language, config.frontend_framework) },
    {
      label: "Architecture",
      value: config.architecture_layers.length > 0
        ? config.architecture_layers.join(" → ")
        : null,
    },
    { label: "Store",    value: config.state_mgmt },
    { label: "Naming",   value: config.naming_language },
    { label: "Limits",   value: formatLimits(config.max_file_loc, config.max_function_loc) },
    { label: "Workflow", value: config.default_mode },
  ];

  return candidates
    .filter((row): row is { label: string; value: string } => row.value !== null);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ConfigRowProps {
  label: string;
  value: string;
  isLast: boolean;
}

function ConfigRow({ label, value, isLast }: ConfigRowProps) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "11px 0",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        gap: "24px",
      }}
    >
      <span
        className="text-xs font-medium shrink-0"
        style={{ color: "var(--text-3)", fontSize: "13px", fontWeight: 500 }}
      >
        {label}
      </span>
      <span
        className="text-xs text-right"
        style={{ color: "var(--text)", fontSize: "13px" }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Empty panel ───────────────────────────────────────────────────────────────

function ConfigEmptyPanel() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      style={{
        padding: "48px 24px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card, 10px)",
        textAlign: "center",
      }}
    >
      <p
        className="text-sm font-medium"
        style={{ color: "var(--text-2)" }}
      >
        No <code>kuraka.config.yaml</code> in this project
      </p>
      <p
        className="text-xs"
        style={{ color: "var(--text-3)" }}
      >
        This project has no Kuraka config file.
      </p>
    </div>
  );
}

// ── ConfigCard ────────────────────────────────────────────────────────────────

interface ConfigCardProps {
  config: ProjectConfig | null;
}

/**
 * ConfigCard — renders the curated kuraka.config.yaml projection as labeled rows.
 * When config is null (absent/unreadable), shows a neutral empty-state panel.
 * No hard-coded colors — all via CSS vars from tokens.css.
 *
 * Row logic lives in buildConfigRows (exported for tests, per LL-009).
 * Rows whose source fields are all null are omitted — never displays "null".
 */
export function ConfigCard({ config }: ConfigCardProps) {
  if (config === null) {
    return <ConfigEmptyPanel />;
  }

  const rows = buildConfigRows(config);

  // If every field is absent we still show the card (sparse config ≠ absent config).
  const headerLabel = "Configuration";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card, 10px)",
        padding: "24px",
        width: "100%",
      }}
    >
      {/* Card header */}
      <div
        className="flex items-center gap-2"
        style={{ paddingBottom: "16px" }}
      >
        {/* Config icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="2.5" stroke="var(--text-2)" strokeWidth="1.5" />
          <path
            d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41"
            stroke="var(--text-2)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span
          className="font-semibold"
          style={{ color: "var(--text)", fontSize: "15px", fontWeight: 600 }}
        >
          {headerLabel}
        </span>
      </div>

      {/* Rows */}
      {rows.length > 0 ? (
        rows.map((row, index) => (
          <ConfigRow
            key={row.label}
            label={row.label}
            value={row.value}
            isLast={index === rows.length - 1}
          />
        ))
      ) : (
        <p
          className="text-xs"
          style={{ color: "var(--text-3)", paddingTop: "8px" }}
        >
          {dash()} No config fields found
        </p>
      )}
    </div>
  );
}
