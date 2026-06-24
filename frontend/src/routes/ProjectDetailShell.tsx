import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ProjectDetail } from "@kuraka-control/contracts";
import { fetchProjectDetail, NotFoundError } from "../api/projectDetail.js";
import { AppShell } from "../components/AppShell.js";
import { GovernanceBadge } from "../components/GovernanceBadge.js";
import { DriftBadge } from "../components/DriftBadge.js";
import { ConfigCard } from "../components/ConfigCard.js";
import { LayerTabContent } from "../components/LayerTabContent.js";

// ── Tab definitions ───────────────────────────────────────────────────────────

type ActiveTab = "config" | "layer";

const INTERACTIVE_TABS: Array<{ id: ActiveTab; label: string }> = [
  { id: "config", label: "Config" },
  { id: "layer", label: "Project Layer" },
];

const INERT_TAB_LABELS = ["RETRO", "Telemetría", "Agentes"] as const;

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

// ── Tabs bar ──────────────────────────────────────────────────────────────────

interface TabsBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

function TabsBar({ activeTab, onTabChange }: TabsBarProps) {
  return (
    <div
      className="flex items-end gap-0"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {INTERACTIVE_TABS.map(({ id, label }) => {
        const isActive = id === activeTab;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className="text-sm font-medium"
            style={{
              padding: "8px 0",
              marginRight: "26px",
              color: isActive ? "var(--text)" : "var(--text-3)",
              cursor: "pointer",
              background: "none",
              border: "none",
              borderBottomWidth: "2px",
              borderBottomStyle: "solid",
              borderBottomColor: isActive ? "var(--accent)" : "transparent",
            }}
          >
            {label}
          </button>
        );
      })}

      {INERT_TAB_LABELS.map((label) => (
        <div
          key={label}
          className="text-sm font-medium"
          style={{
            padding: "8px 0",
            marginRight: "26px",
            color: "var(--text-3)",
            borderBottom: "2px solid transparent",
            cursor: "default",
            opacity: 0.5,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

// ── Project header ────────────────────────────────────────────────────────────

interface DetailHeaderProps {
  project: ProjectDetail;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

function DetailHeader({ project, activeTab, onTabChange }: DetailHeaderProps) {
  return (
    <div className="flex flex-col" style={{ gap: "22px" }}>
      {/* Breadcrumb */}
      <p className="text-xs" style={{ color: "var(--text-3)", fontSize: "13px" }}>
        <Link to="/projects" className="hover:underline" style={{ color: "var(--text-3)" }}>
          Proyectos
        </Link>
        {" / "}
        <span>{project.name}</span>
      </p>

      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap" style={{ gap: "14px" }}>
          <h1 className="font-bold" style={{ color: "var(--text)", fontSize: "26px", lineHeight: 1.2 }}>
            {project.name}
          </h1>
          <GovernanceBadge governance={project.governance} />
          <DriftBadge drift={project.drift} />
        </div>
        <div className="flex items-center" style={{ gap: "10px" }}>
          <InertPill label="Re-mount" />
          <InertPill label="Validate" />
          <InertPill label="Sync" />
        </div>
      </div>

      {/* Tabs */}
      <TabsBar activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  );
}

// ── Loading / error panels ────────────────────────────────────────────────────

function LoadingPanel() {
  return (
    <div className="flex items-center justify-center flex-1" style={{ color: "var(--text-2)" }}>
      <p className="text-sm">Loading…</p>
    </div>
  );
}

function NotFoundPanel({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center">
      <p className="text-base font-semibold" style={{ color: "var(--text)" }}>Project not found</p>
      <p className="text-sm" style={{ color: "var(--text-2)" }}>
        <code>{name}</code> is not registered in the vault.
      </p>
      <Link to="/projects" className="text-xs mt-2 hover:underline" style={{ color: "var(--jade)" }}>
        Back to Proyectos
      </Link>
    </div>
  );
}

function ErrorPanel({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-lg"
      style={{ background: "var(--surface)", border: "1px solid var(--accent)", maxWidth: "480px" }}
    >
      <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Could not load project</p>
      <p className="text-xs" style={{ color: "var(--text-2)" }}>{message}</p>
    </div>
  );
}

// ── ProjectDetailShell ────────────────────────────────────────────────────────

/**
 * ProjectDetailShell — /projects/:name route.
 *
 * Fetches GET /api/projects/:name via fetchProjectDetail.
 * Local activeTab state: "config" (default) | "layer".
 *   "config"  → ConfigCard
 *   "layer"   → LayerTabContent (lazy fetch, enabled only when active)
 * RETRO / Telemetría / Agentes tabs remain inert.
 */
export function ProjectDetailShell() {
  const { name } = useParams<{ name: string }>();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<ActiveTab>("config");

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
        <div className="flex flex-col" style={{ padding: "32px", gap: "22px" }}>
          <DetailHeader project={data} activeTab={activeTab} onTabChange={setActiveTab} />
          {activeTab === "config" && <ConfigCard config={data.config} />}
          {activeTab === "layer" && (
            <LayerTabContent name={data.name} enabled={activeTab === "layer"} />
          )}
        </div>
      )}
    </AppShell>
  );
}
