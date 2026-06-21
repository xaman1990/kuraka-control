import { GovernanceBadge } from "../components/GovernanceBadge.js";
import { GovernanceDot } from "../components/GovernanceDot.js";
import { Badge } from "../components/Badge.js";
import { MetricCard } from "../components/MetricCard.js";
import { ProjectCard } from "../components/ProjectCard.js";
import { AgentCard } from "../components/AgentCard.js";
import { NavItem } from "../components/NavItem.js";

/**
 * Showcase — Phase 6.8 visual smoke-test for the S12 design-system.
 * Renders every design-system component at least once.
 * GovernanceBadge + GovernanceDot shown in BOTH colors side by side (AC-S1).
 */
export function Showcase() {
  return (
    <div
      className="min-h-screen p-8 space-y-12"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <header>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--accent)" }}
        >
          Design System Showcase — S12
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
          Visual proof for Phase 6.8 smoke test. Every component rendered at least once.
        </p>
      </header>

      {/* ── GovernanceBadge ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          GovernanceBadge
        </h2>
        <div className="flex flex-wrap gap-3 items-center">
          <GovernanceBadge governance="framework" />
          <GovernanceBadge governance="project" />
          <GovernanceBadge governance="framework" label="Kuraka Core" />
          <GovernanceBadge governance="project" label="My SaaS" />
        </div>
      </section>

      {/* ── GovernanceDot ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          GovernanceDot
        </h2>
        <div className="flex flex-wrap gap-4 items-center">
          <span className="flex items-center gap-2">
            <GovernanceDot governance="framework" size="sm" />
            <span className="text-sm" style={{ color: "var(--text-2)" }}>framework (sm)</span>
          </span>
          <span className="flex items-center gap-2">
            <GovernanceDot governance="project" size="sm" />
            <span className="text-sm" style={{ color: "var(--text-2)" }}>project (sm)</span>
          </span>
          <span className="flex items-center gap-2">
            <GovernanceDot governance="framework" size="md" />
            <span className="text-sm" style={{ color: "var(--text-2)" }}>framework (md)</span>
          </span>
          <span className="flex items-center gap-2">
            <GovernanceDot governance="project" size="md" />
            <span className="text-sm" style={{ color: "var(--text-2)" }}>project (md)</span>
          </span>
        </div>
      </section>

      {/* ── Badge ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          Badge
        </h2>
        <div className="flex flex-wrap gap-3 items-center">
          <Badge variant="neutral">neutral</Badge>
          <Badge variant="accent">accent</Badge>
          <Badge variant="jade">jade</Badge>
          <Badge variant="muted">muted</Badge>
        </div>
      </section>

      {/* ── MetricCard ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          MetricCard
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Active Projects"
            value={12}
            governance="framework"
          />
          <MetricCard
            label="Cycles Run"
            value={48}
            governance="project"
          />
          <MetricCard
            label="Stories Delivered"
            value={137}
            governance="framework"
            hint="Last 90 days"
          />
          <MetricCard
            label="Avg Cycle Time"
            value="2.4h"
            hint="Moving 7-day average"
          />
        </div>
      </section>

      {/* ── ProjectCard ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          ProjectCard
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ProjectCard
            name="kuraka-control"
            stack="React 18 + FastAPI + Tailwind v4"
            status="active"
            governance="framework"
            kuraka_version="0.9.2"
          />
          <ProjectCard
            name="sie-v2"
            stack="Vue 3 + Pinia + FastAPI"
            status="paused"
            governance="project"
          />
          <ProjectCard
            name="new-saas"
            stack="Next.js 14 + Prisma"
            status="onboarding"
            governance="project"
            kuraka_version="0.9.0"
          />
          <ProjectCard
            name="legacy-erp"
            stack="Django + jQuery"
            status="archived"
            governance="project"
          />
        </div>
      </section>

      {/* ── AgentCard ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          AgentCard
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <AgentCard
            name="PO Analyst"
            agentKey="po-analyst"
            governance="framework"
          />
          <AgentCard
            name="Backend Developer"
            agentKey="backend-developer"
            governance="project"
          />
          <AgentCard
            name="Security Reviewer"
            agentKey="security-reviewer"
            governance="framework"
          />
          <AgentCard
            name="Frontend Developer"
            agentKey="frontend-developer"
            governance="project"
          />
          <AgentCard
            name="Final Auditor"
            agentKey="final-auditor"
            governance="framework"
          />
          <AgentCard
            name="Amauta"
            agentKey="amauta"
            governance="framework"
          />
        </div>
      </section>

      {/* ── NavItem ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          NavItem
        </h2>
        <nav
          className="w-56 p-2 rounded-lg space-y-1"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <NavItem label="Dashboard" active href="/dashboard" />
          <NavItem label="Projects" href="/projects" />
          <NavItem label="Agents" href="/agents" />
          <NavItem label="Settings" />
        </nav>
      </section>
    </div>
  );
}
