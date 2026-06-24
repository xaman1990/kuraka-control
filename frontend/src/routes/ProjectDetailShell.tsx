import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ProjectDetail } from "@kuraka-control/contracts";
import { fetchProjectDetail, NotFoundError } from "../api/projectDetail.js";
import { AppShell } from "../components/AppShell.js";
import { GovernanceBadge } from "../components/GovernanceBadge.js";
import { DriftBadge } from "../components/DriftBadge.js";
import { ConfigCard } from "../components/ConfigCard.js";

// ── Inert action buttons (S7) ─────────────────────────────────────────────────

interface InertPillProps {
  label: string;
}

function InertPill({ label }: InertPillProps) {
  return (
    <button
      type="button"
      aria-disabled="true"
      className="inline-flex items-center gap-1 rounded-full text-xs font-medium"
      style={{
        padding: "9px 14px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-3)",
        cursor: "default",
        opacity: 0.6,
      }}
    >
      {label}
    </button>
  );
}

// ── Tabs bar (inert visual shell) ─────────────────────────────────────────────

const TAB_LABELS = ["Config", "Project Layer", "RETRO", "Telemetría", "Agentes"] as const;

function TabsBar() {
  return (
    <div
      className="flex items-end gap-0"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* Tab content arrives in S3-S5 */}
      {TAB_LABELS.map((tab, i) => {
        const isActive = i === 0;
        return (
          <div
            key={tab}
            className="text-sm font-medium"
            style={{
              padding: "8px 0",
              marginRight: "26px",
              color: isActive ? "var(--text)" : "var(--text-3)",
              borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "default",
            }}
          >
            {tab}
          </div>
        );
      })}
    </div>
  );
}

// ── Project header ────────────────────────────────────────────────────────────

interface DetailHeaderProps {
  project: ProjectDetail;
}

function DetailHeader({ project }: DetailHeaderProps) {
  return (
    <div className="flex flex-col" style={{ gap: "22px" }}>
      {/* Breadcrumb */}
      <p className="text-xs" style={{ color: "var(--text-3)", fontSize: "13px" }}>
        <Link
          to="/projects"
          className="hover:underline"
          style={{ color: "var(--text-3)" }}
        >
          Proyectos
        </Link>
        {" / "}
        <span>{project.name}</span>
      </p>

      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: name + badges */}
        <div className="flex items-center gap-3 flex-wrap" style={{ gap: "14px" }}>
          <h1
            className="font-bold"
            style={{ color: "var(--text)", fontSize: "26px", lineHeight: 1.2 }}
          >
            {project.name}
          </h1>
          <GovernanceBadge governance={project.governance} />
          <DriftBadge drift={project.drift} />
        </div>

        {/* Right: inert action pills (S7) */}
        <div className="flex items-center" style={{ gap: "10px" }}>
          {/* S7 */}
          <InertPill label="Re-mount" />
          <InertPill label="Validate" />
          <InertPill label="Sync" />
        </div>
      </div>

      {/* Tabs */}
      <TabsBar />
    </div>
  );
}

// ── State panels ──────────────────────────────────────────────────────────────

function LoadingPanel() {
  return (
    <div
      className="flex items-center justify-center flex-1"
      style={{ color: "var(--text-2)" }}
    >
      <p className="text-sm">Loading…</p>
    </div>
  );
}

function NotFoundPanel({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center">
      <p className="text-base font-semibold" style={{ color: "var(--text)" }}>
        Project not found
      </p>
      <p className="text-sm" style={{ color: "var(--text-2)" }}>
        <code>{name}</code> is not registered in the vault.
      </p>
      <Link
        to="/projects"
        className="text-xs mt-2 hover:underline"
        style={{ color: "var(--jade)" }}
      >
        Back to Proyectos
      </Link>
    </div>
  );
}

function ErrorPanel({ error }: { error: unknown }) {
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-lg"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--accent)",
        maxWidth: "480px",
      }}
    >
      <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
        Could not load project
      </p>
      <p className="text-xs" style={{ color: "var(--text-2)" }}>
        {message}
      </p>
    </div>
  );
}

// ── ProjectDetailShell ────────────────────────────────────────────────────────

/**
 * ProjectDetailShell — /projects/:name route.
 *
 * Fetches GET /api/projects/:name via fetchProjectDetail (dedicated fetch —
 * not the list cache). Renders four states:
 *   loading   → spinner text
 *   not-found → friendly "project not registered" panel (404)
 *   error     → network/parse error panel
 *   data      → Pencil header (breadcrumb + name + badges + inert actions + inert tabs)
 */
export function ProjectDetailShell() {
  const { name } = useParams<{ name: string }>();
  const location = useLocation();

  const { data, isLoading, isError, error } = useQuery<ProjectDetail, Error>({
    queryKey: ["project", name],
    queryFn: () => fetchProjectDetail(name!),
    enabled: name !== undefined && name !== "",
    retry: (failureCount, err) => {
      if (err instanceof NotFoundError) return false;
      return failureCount < 2;
    },
  });

  const isNotFound = isError && error instanceof NotFoundError;

  return (
    <AppShell activePath={location.pathname}>
      {isLoading && <LoadingPanel />}

      {isNotFound && <NotFoundPanel name={name ?? ""} />}

      {isError && !isNotFound && (
        <div style={{ padding: "32px" }}>
          <ErrorPanel error={error} />
        </div>
      )}

      {!isLoading && !isError && data && (
        <div
          className="flex flex-col"
          style={{ padding: "32px", gap: "22px" }}
        >
          <DetailHeader project={data} />
          {/* Config tab content (S3) — other tabs inert until S4+ */}
          <ConfigCard config={data.config} />
        </div>
      )}
    </AppShell>
  );
}
