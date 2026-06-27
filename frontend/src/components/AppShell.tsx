import { ReactNode } from "react";
import { NavItem } from "./NavItem.js";

// ── Nav groups ────────────────────────────────────────────────────────────────

interface NavGroup {
  label: string;
  items: Array<{ label: string; href?: string }>;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "OBSERVAR",
    items: [
      { label: "Resumen" },
      { label: "Proyectos", href: "/projects" },
      { label: "Agentes" },
    ],
  },
  {
    label: "DESARROLLAR",
    items: [
      { label: "Cockpit" },
      { label: "Backlog" },
      { label: "Artefactos" },
    ],
  },
  {
    label: "MEJORAR",
    items: [{ label: "RETRO Triage", href: "/triage" }, { label: "Insights" }],
  },
  {
    label: "SISTEMA",
    items: [{ label: "Coordinación" }, { label: "Onboard" }],
  },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  activePath: string;
}

/**
 * Sidebar — app-wide navigation chrome.
 * Renders brand mark + NAV_GROUPS. Active item is determined by activePath.
 * Extracted from ProjectsPage (S2 shared-layout follow-up).
 */
export function Sidebar({ activePath }: SidebarProps) {
  return (
    <aside
      className="flex flex-col gap-2 shrink-0 overflow-y-auto"
      style={{
        width: "248px",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        padding: "18px",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 mb-4">
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          aria-hidden="true"
        >
          <rect width="22" height="22" rx="5" fill="var(--accent)" />
          <path
            d="M6 16 L11 6 L16 16"
            stroke="var(--bg)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span
          className="text-sm font-bold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Kuraka Control
        </span>
      </div>

      {/* Nav groups */}
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-2">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-1 px-3"
            style={{ color: "var(--text-3)" }}
          >
            {group.label}
          </p>
          <nav className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavItem
                key={item.label}
                label={item.label}
                href={item.href ?? null}
                active={item.href !== undefined && item.href === activePath}
              />
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────

interface AppShellProps {
  activePath: string;
  children: ReactNode;
}

/**
 * AppShell — shared page chrome: Sidebar (248 px) + main content slot.
 * All routes that need the sidebar use this wrapper.
 */
export function AppShell({ activePath, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      <Sidebar activePath={activePath} />
      <main className="flex flex-col flex-1 min-w-0">{children}</main>
    </div>
  );
}
