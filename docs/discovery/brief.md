# Brief — Kuraka Control Plane (kuraka-control)

> Input para `inti` (discovery) y `arki` (stack + scaffolding). Greenfield.
> Contexto completo del ecosistema: `CONTROL-PLANE.md` en el vault Kuraka
> (`/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka/CONTROL-PLANE.md`).

## Qué es

App **web local** (un solo usuario, localhost) para **gobernar** el framework Kuraka a
través de múltiples proyectos consumidores. Es el plano de control del modelo
hub-and-spoke: se **desarrolla dentro de cada proyecto**, se **gobierna desde aquí**.

Este repo es además el **primer proyecto greenfield** construido con Kuraka (dogfood),
y queda registrado en `projects/kuraka-control.md` del vault.

## Usuario

Carlos, operador único del framework. Sin multi-tenant, sin auth (v1 localhost).

## Problema

El feedback de cada ciclo (RETRO → `RECURRING-ISSUES`) hoy se traduce a mejoras de
agentes **a mano** (el ejercicio P1–P6). No hay vista única de proyectos, ni de qué
agente es framework vs override de proyecto, ni un flujo auditable para enrutar y
aplicar mejoras.

## Resultado buscado (v1 = OBSERVAR + ACTUAR)

**Observar:**
- Lista de proyectos del registro del vault (`projects/*.md`).
- Catálogo de agentes con badge de gobernanza (framework vs override por proyecto).
- Docs / lessons-learned por proyecto.
- Feed de RETROs / `RECURRING-ISSUES`.
- Telemetría cross-proyecto (puede arrancar vacía).

**Actuar:**
- Tablero de **triage de RETROs**: enruta cada hallazgo framework-vs-proyecto y aplica
  el parche al archivo destino correcto. Sistematiza el P1–P6.
- Botones de acciones: mount / validate / inspect / regenerar telemetría.

## No-objetivos v1

Multi-usuario, deploy remoto, editar `backend/frontend/` de proyectos consumidores
(eso ocurre dentro de cada proyecto vía Kuraka), reemplazar Obsidian.

---

## Constraints de arquitectura (NO negociables para `arki`)

1. **Topología de 2 piezas en un mismo repo:**
   - **Backend Node (Express)** — única pieza con acceso a FS y a ejecutar scripts.
     Lee el vault (parsea frontmatter markdown + JSON), ejecuta los scripts del vault
     como subprocesos, escribe registros de triage y aplica parches (writes directos).
   - **Frontend React + Vite + Zustand** — SPA que consume la API del backend.
   (Stack elegido por familiaridad con dbcanvas.)

2. **El vault es la fuente de verdad.** Ruta configurable vía `KURAKA_VAULT`
   (default `/Users/xmn/Documents/Agentes/AgentesTrabajos/kuraka`). Las mutaciones pasan
   por los scripts existentes cuando exista uno; los writes directos se limitan a
   `retro-triage/*.md` y a los archivos destino de un parche.

3. **NO usar `scripts/sync-obsidian.sh`** — DEPRECADO (migración Fase 4 → one-way con
   `kuraka.lock`). La acción "sync" se basa en `mount` (vault→proyecto); el backup
   proyecto→vault queda fuera de v1.

4. **Solo lectura del lado de proyectos consumidores**, salvo las acciones explícitas.
   El app nunca edita `backend/frontend/` de un consumidor.

5. **Scripts sin deps externas** (POSIX sh / Python 3 stdlib): el backend los invoca como
   subprocesos y parsea stdout / exit code.

6. **Gobernanza visible:** `agents/*.md` del vault editables (escritura) SOLO desde este
   app; los project-layer por proyecto editables por proyecto. El UI lo refleja con badges.

---

## Contratos de datos que el app LEE (confirmados)

| Dato | Path | Campos clave |
|------|------|-------------|
| Agentes | `<vault>/agents/*.md` frontmatter | `name`, `description`, `model` (opus\|sonnet\|haiku), `color` |
| Registro | `<vault>/projects/*.md` frontmatter | `name`, `path`, `stack`, `kuraka_version`, `has_project_layer`, `default_mode`, `focus_scope`, `status`, `last_mount`, `last_sync`, `tags` |
| Config proyecto | `<project.path>/kuraka.config.yaml` | `project`, `stack.*`, `architecture.{layers,paths}`, `conventions.*`, `workflow.*` |
| Overrides | `<project.path>/.claude/project/{agents,conventions,review-checks,lessons-learned}/` | archivos que extienden agentes |
| RECURRING-ISSUES | `<...>/docs/process/RECURRING-ISSUES.md` | Executive Summary + Top N Patterns |
| Triage | `<vault>/retro-triage/*.md` frontmatter + tabla | `project`, `source`, `date`, `decision`, `applied`; tabla `#/Finding/Routing/Target/Severity/Status` |
| Telemetría | `<project.path>/docs/process/agent-telemetry/*-telemetry.json` | `req_name`, `mode`, `runs[].{agent,total_tokens,tool_uses,duration_ms}` |
| Budgets | `<vault>/aggregate-telemetry.py` BUDGETS | `{agent: (target, hard_cap)}` (13 agentes) |

Hoy NO existe ningún `*-telemetry.json` → la vista de telemetría arranca vacía.

## Acciones de gobernanza → scripts del vault

| Acción | Backend | Contrato |
|--------|---------|----------|
| Montar Kuraka | `mount-kuraka.sh <target>` | exit 0/1; warnings; `requires_restart` |
| Validar frontmatter | `validate-kuraka.sh <target>` | exit 0/1; errores por agente |
| Detectar stack | `python3 kuraka-inspect.py <target>` | JSON por stdout |
| Regenerar telemetría | `python3 aggregate-telemetry.py <project_root>` | escribe DASHBOARD.md |
| Crear triage | write directo `retro-triage/<date>-<project>.md` (desde `_TEMPLATE.md`) | — |
| Aplicar parche | write directo a `agents/*.md` (framework) o `<project>/.claude/project/...` | — |
