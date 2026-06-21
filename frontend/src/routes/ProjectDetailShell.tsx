import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ProjectListResponse } from "@kuraka-control/contracts";
import { fetchProjects } from "../api/projects.js";
import { Badge } from "../components/Badge.js";
import { GovernanceBadge } from "../components/GovernanceBadge.js";
import { KNOWN_STATUS_VARIANT } from "../components/ProjectCard.js";

/**
 * ProjectDetailShell — /projects/:name route.
 * Reads ProjectSummary from the ["projects"] react-query list cache by name.
 * No new fetch: if the cache is warm (navigated from ProjectsPage), the data
 * is available immediately. On deep-link / refresh, react-query refetches the
 * list then resolves the name. If the name is still not found, renders a
 * not-found state. Detail content arrives in S2–S4.
 */
export function ProjectDetailShell() {
  const { name } = useParams<{ name: string }>();

  const { data, isLoading } = useQuery<ProjectListResponse, Error>({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg)", color: "var(--text-2)" }}
      >
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  const project = data?.projects.find((p) => p.name === name) ?? null;

  if (project === null) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg)" }}
      >
        <div className="flex flex-col gap-2 text-center">
          <p
            className="text-base font-semibold"
            style={{ color: "var(--text)" }}
          >
            Project not found
          </p>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            <code>{name}</code> is not registered in the vault.
          </p>
        </div>
      </div>
    );
  }

  const badgeVariant = KNOWN_STATUS_VARIANT[project.status] ?? "neutral";

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg)", padding: "32px" }}
    >
      <div className="flex flex-col gap-6" style={{ maxWidth: "720px" }}>
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1
              className="text-2xl font-bold"
              style={{ color: "var(--text)" }}
            >
              {project.name}
            </h1>
            <GovernanceBadge governance={project.governance} />
          </div>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            {project.stack}
          </p>
          <div className="flex items-center gap-3">
            <Badge variant={badgeVariant}>{project.status}</Badge>
            {project.kuraka_version !== null && (
              <span
                className="text-xs font-mono"
                style={{ color: "var(--text-3)" }}
              >
                v{project.kuraka_version}
              </span>
            )}
          </div>
        </div>

        {/* Placeholder */}
        <div
          className="p-4 rounded-lg"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Detail content arriving in S2–S4.
          </p>
        </div>
      </div>
    </div>
  );
}
