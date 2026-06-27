import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { ProjectListResponse } from "@kuraka-control/contracts";
import { fetchProjects } from "../api/projects.js";
import { ProjectCard } from "../components/ProjectCard.js";
import { AppShell } from "../components/AppShell.js";

// ── Loading skeleton ──────────────────────────────────────────────────────────

function ProjectGridSkeleton() {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 p-4 rounded-lg animate-pulse"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            height: "120px",
          }}
        />
      ))}
    </div>
  );
}

// ── Error panel ───────────────────────────────────────────────────────────────

function VaultErrorPanel({ error }: { error: unknown }) {
  const vaultPath =
    (error as { detail?: { path?: string } } | null)?.detail?.path ?? null;

  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-lg"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--accent)",
      }}
    >
      <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
        Cannot read the Kuraka vault
      </p>
      {vaultPath !== null && (
        <p className="text-xs font-mono" style={{ color: "var(--text-3)" }}>
          {vaultPath}
        </p>
      )}
      <p className="text-xs" style={{ color: "var(--text-2)" }}>
        Check that <code>KURAKA_VAULT</code> points to a readable directory and
        restart the backend.
      </p>
    </div>
  );
}

// ── Projects page ─────────────────────────────────────────────────────────────

/**
 * ProjectsPage — /projects route.
 * Layout: AppShell (Sidebar 248 px) + Main area.
 * Fetches GET /api/projects via react-query and renders four states:
 *   loading → skeleton
 *   error   → vault-unreadable panel
 *   empty   → first-class empty message
 *   data    → responsive ProjectCard grid
 */
export function ProjectsPage() {
  const location = useLocation();

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery<ProjectListResponse, Error>({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const projectCount = data?.projects.length ?? 0;

  return (
    <AppShell activePath={location.pathname}>
      <div
        className="flex flex-col flex-1 min-w-0"
        style={{ padding: "32px", gap: "24px" }}
      >
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1
              className="text-xl font-semibold"
              style={{ color: "var(--text)" }}
            >
              Proyectos
            </h1>
            <p className="text-sm" style={{ color: "var(--text-2)" }}>
              {isLoading
                ? "Vault registry"
                : isError
                ? "Vault registry"
                : `Vault registry · ${projectCount} project${projectCount !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Content area */}
        {isLoading && <ProjectGridSkeleton />}

        {isError && <VaultErrorPanel error={error} />}

        {!isLoading && !isError && data?.empty === true && (
          <div
            className="flex flex-col gap-2 p-6 rounded-lg"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              No projects registered in the vault yet.
            </p>
            <p className="text-xs" style={{ color: "var(--text-2)" }}>
              Add a <code>.md</code> file to{" "}
              <code>{"<vault>/projects/"}</code> to register a project.
            </p>
          </div>
        )}

        {!isLoading && !isError && data && !data.empty && (
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "16px",
            }}
          >
            {data.projects.map((project) => (
              <ProjectCard
                key={project.name}
                name={project.name}
                stack={project.stack}
                status={project.status}
                governance={project.governance}
                kuraka_version={project.kuraka_version}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
