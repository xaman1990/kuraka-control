# ADR-004 — Live-state watcher ("Quipu en vivo") — RECOMMENDED + SPIKE

**Status:** spike (open question #1 — transport + event source unresolved)
**Date:** 2026-06-07 · **Story:** S8 (spike FIRST, per build order)

## Context
FR-1.2 / spec §2 want a hero showing **live agent state** — "agent X in phase Y
now" — across N external project repos. Discovery explicitly leaves the
transport open (file-watch vs IPC vs polling) **and** does not define an
**event source**: nothing today emits "agent entered phase Y". This is the only
genuinely new mechanism in v1, and it has two unknowns, not one.

## The two unknowns (rank by risk)

1. **Event source (HIGH risk, real unknown).** What writes a record when an
   agent changes phase? Options:
   - (a) **Telemetry-adjacent heartbeat file** — the orchestrator (Kuraka skill)
     writes/updates a small `docs/process/agent-telemetry/_live.json`
     (`{agent, phase, req, ts}`) at each phase transition. Requires a small
     framework change to the Kuraka skill — itself routed through the triage
     flow this app governs (nice dogfood).
   - (b) **Infer from existing telemetry JSON** — only updated at cycle end →
     **not live**. Rejected as the live source; usable as fallback "last seen".
   - (c) **Claude Code session introspection / IPC** — no stable local API
     today. Rejected for v1.
   - **Recommendation:** (a) heartbeat file per project. It is the only option
     that is both live and dependency-free, and it reuses the telemetry dir the
     backend already watches.

2. **Transport to the browser (LOW risk, well-trodden).**
   - **chokidar** watching each registered project's
     `docs/process/agent-telemetry/` → backend coalesces into a fleet state →
     pushes to the SPA via **Server-Sent Events** (`GET /api/live`, react-query
     or native `EventSource`).
   - SSE over WebSocket: one-directional (server→client) fits "observe"; simpler;
     auto-reconnect. Polling fallback (react-query `refetchInterval`) if a repo
     lives on a filesystem where fs events are unreliable (network mounts).
   - **Recommendation:** chokidar → in-memory fleet state → SSE, with a polling
     fallback flag per project.

## Decision (provisional, pending spike)
Recommended path: **(1a) heartbeat file + (2) chokidar→SSE**. Commit only after
the spike validates the event source.

## The spike (S8, time-boxed ~1 day)
Goals — answer in order, stop at first blocker:
1. **Source feasibility:** can the Kuraka skill cheaply write `_live.json` at
   phase transitions? Prototype the write in one project; confirm it does not
   bloat tokens or require external deps (C5 spirit).
2. **Watch fan-out:** chokidar watching `agent-telemetry/` across 3 project paths
   simultaneously — event latency, missed-event rate, CPU at idle.
3. **Transport:** minimal `/api/live` SSE endpoint streaming a hand-edited
   `_live.json`; measure browser-perceived latency (target: feels live, < ~1s).
4. **Fallback:** confirm react-query polling renders the same view when SSE/watch
   is disabled (graceful degradation; no silent failure).

**Exit criteria:** documented latency numbers + a go/no-go on (1a). If (1a) is
infeasible, fall back to **polling the cycle-end telemetry for "last known
agent/phase"** and label the hero "última actividad" instead of "en vivo" —
honest degradation rather than a fake live feed.

## Consequences
- The watcher is isolated behind one service + one SSE route + one Zustand slice;
  the rest of the app does not depend on its outcome (Screens 1–4 read-only work
  without it). De-risks the whole v1.
- A framework change (heartbeat) is **in-scope-adjacent**: route it through the
  triage flow (this app) — explicit dogfood, flagged to the user.
