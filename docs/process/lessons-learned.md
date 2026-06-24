# Lessons Learned — Kuraka Workflow

Lecciones destiladas de retrospectivas pasadas. Referenciadas por los prompts
de agentes mediante ID corto (`[LL-NNN]`) en lugar de tener el ejemplo completo
inline (ahorra tokens en cada invocación).

> Cómo añadir una lección: cada entrada tiene ID único, REQ de origen, el
> síntoma, la causa raíz y la regla que evita la repetición. Los prompts de
> agentes citan el ID (`see LL-003`) sin duplicar el cuerpo.

---

## LL-001 — Symbol removal must grep the full repo

- **REQ origen**: REQ-2026-04-13 (guai-specialties / retiro de `MASTER_SPECIALTIES`)
- **Síntoma**: El REQ acotó "one file change". En implementación tocó 3 archivos
  (`default_prompts.py`, `analyzer.py`, `generator.py`) + 1 frontend, y requirió
  propagar un nuevo parámetro por 2 funciones de parseo.
- **Causa raíz**: Al eliminar/renombrar un símbolo, el PO no grepea el repo
  completo para enumerar todos los call sites.
- **Regla que aplica**: `po-analyst` ejecuta `grep -rn "SYMBOL" sie_v2/` en la
  fase 1 cuando el REQ contiene "eliminar", "remover", "renombrar" o
  equivalentes en inglés. Lista cada archivo y número de línea en
  "Affected Services & Repositories". El `architect-reviewer` re-verifica la
  lista antes del schema freeze.

## LL-002 — Cache invalidation must cover every subkey in the namespace

- **REQ origen**: No citado por nombre; bug sobre Redis key `CAPABILITIES`.
- **Síntoma**: Código invalidaba `CAPABILITIES` pero dejaba sobrevivir
  `CAPABILITIES:last_sync`. El test usaba
  `cache.invalidate.assert_called_once()` en lugar de verificar todos los
  targets esperados. El bug pasó Phase 4, se detectó en Phase 5 porque el
  reviewer grepeó el nombre de la constante.
- **Causa raíz**: El desarrollador asumió que invalidar la key principal basta;
  el test mock solo verificaba una llamada, no la completitud del set.
- **Regla que aplica**: `code-reviewer` verifica en Phase 5 cuando hay escritura
  a Redis:
  - Si el código invalida `KEY`, grepear `grep -rn "KEY" sie_v2/backend/` y
    exigir que TODAS las subkeys del mismo namespace (`f"{KEY}:last_sync"`,
    `f"{KEY}:meta"`, `f"{KEY}:{id}"`, etc.) se invaliden juntas
  - Preferir `cache.invalidate_pattern(f"{KEY}*")` si hay múltiples subkeys

## LL-003 — Orchestrator must not bypass the Kuraka for "small" changes

- **REQ origen**: REQ-2026-04-17 y REQ-20260420
- **Síntoma**: En ambos REQs el orchestrator editó directamente código fuente
  sin enrutar por `backend-developer` / `frontend-developer`. Produjo type
  errors y telemetría rota.
- **Causa raíz**: El orchestrator racionalizó "el cambio es trivial, hacerlo
  directo ahorra tokens" sin considerar que el bypass rompe AC verification y
  telemetry integrity.
- **Regla que aplica**: `kuraka.md` sección "Orchestrator constraint". El
  orchestrator NUNCA edita código fuente antes de Phase 4. Si aun así lo hace:
  revertir, anunciar la violación, enrutar por el agente correcto, loggear con
  `"agent": "orchestrator-direct"` en telemetry.

## LL-004 — Test plan must respect story's Out of Scope section

- **REQ origen**: REQ-20260420-clean-specialty-names
- **Síntoma**: El `test-engineer` incluyó tests Vitest de componentes
  silenciosamente, pese a que la story marcaba esos tests como out-of-scope.
  La contradicción se detectó en Phase 3 y requirió rework.
- **Causa raíz**: El agente no leyó la sección "Out of Scope" antes de generar
  test cases.
- **Regla que aplica**: `test-engineer` en modo TEST_PLANNING lee primero la
  sección "Out of Scope" de cada story, lista exclusiones como "Excluded
  Categories" en el test plan, y NO incluye test cases para lo excluido. Si el
  agente cree que una exclusión es incorrecta, crea un finding "Test Plan vs
  Story Scope Conflict" y espera resolución antes de incluir.

## LL-005 — Import path hints in stories must be verified against an existing test

- **REQ origen**: (implícito en story-refiner.md)
- **Síntoma**: Stories con import paths aproximados obligan al developer a
  inventar el path correcto y luego fallan los tests.
- **Regla que aplica**: `story-refiner` al escribir "Notes for Implementer"
  con rutas de import ejecuta:
  `grep -r "^from api\." sie_v2/backend/tests/unit/ | head -3`
  y usa el patrón confirmado. No documenta ambigüedad; resuelve en tiempo de
  escritura.

## LL-006 — TypeScript interface changes must specify exact syntax

- **REQ origen**: (genérico — varias stories de frontend)
- **Síntoma**: AC diciendo "add optional string field `nombre`" → ambiguo entre
  `nombre?: string` (propiedad opcional) y `nombre: string | null` (union).
  Semántica distinta, runtime distinto.
- **Regla que aplica**: `architect-reviewer` flaggea como MINOR cualquier AC
  que describa tipos TypeScript con lenguaje informal. La AC debe especificar
  el operador exacto (`?` vs `: T | null`).

## LL-007 — Validate seeded/inherited contracts against live data before freezing

- **REQ origen**: REQ-20260620-S1-registry-reader-projects
- **Síntoma**: El contrato sembrado por arki tipaba `ProjectSummary.status` como
  `z.enum([active,paused,onboarding,archived])`, pero el registro vivo contenía
  `status: mapped`. Un parse estricto habría lanzado en día uno y el contrato lo
  heredan S2–S4.
- **Causa raíz**: arki adivinó el vocabulario de un campo cuyos valores los
  posee una fuente externa (el vault), sin validar contra los datos reales.
- **Regla que aplica**: `po-analyst` en GATE0 valida cualquier campo de contrato
  que proyecte una fuente externa contra los datos vivos (lee N archivos reales,
  cuenta la distribución de valores) ANTES de escribir el REQ. Si el contrato
  sembrado contradice los datos vivos → BLOCKER, no se escribe el REQ hasta
  resolver. El `architect-reviewer` re-verifica en el freeze.

## LL-008 — Enum only fields the app owns; mirrored external fields use z.string()

- **REQ origen**: REQ-20260620-S1-registry-reader-projects
- **Síntoma**: `enums_for_states: true` empujó a sembrar un enum para un campo
  (`status`) cuyo vocabulario es del vault, no de kuraka-control.
- **Causa raíz**: Confusión entre estados que la app posee (la máquina de estados
  del triage — SÍ enum) y un campo espejo de una fuente externa (NO enum).
- **Regla que aplica**: arki y `story-refiner` aplican `enums_for_states` SOLO a
  campos cuyos valores controla la app. Para campos espejo de una fuente externa
  (frontmatter del vault, salida de scripts), usar `z.string()` (o una unión
  abierta documentada) + mapeo de display conocido en la UI con fallback neutro.

## LL-009 — Shared display-mapping constants are exported from their owner, never copied

- **REQ origen**: REQ-20260620-S1-registry-reader-projects
- **Síntoma**: `KNOWN_STATUS_VARIANT` (mapa status→variante de badge) quedó
  duplicado entre componentes (IMPORTANT en Phase 5).
- **Causa raíz**: El mapa se declaró más de una vez en vez de exportarse desde el
  componente que lo posee.
- **Regla que aplica**: `frontend-developer` declara cada mapa de variante/label
  compartido UNA vez, exportado desde su componente dueño; los consumidores lo
  importan. `code-reviewer` grepea el nombre de la constante para detectar copias.

## LL-010 — Run the GATE0 live-data validation proactively, before writing the REQ

- **REQ origen**: REQ-20260622-S2-project-detail-drift
- **Síntoma (positivo)**: LL-007 evitó un crash en S1 pero *de forma reactiva*:
  GATE0 encontró la contradicción y BLOQUEÓ, forzando un re-pase de po-analyst
  (~40K tokens desperdiciados). En S2, la misma validación corrida *antes* de
  redactar el REQ (verificar los 8 locks en disco, el registro y el
  DEFAULT_VERSION del vault) produjo GATE0 PASS en un solo pase, sin doble-pase.
- **Causa raíz**: LL-007 estaba redactada como "valida y BLOQUEA si hay
  contradicción" — un disparador reactivo. El mayor valor es correr la validación
  proactivamente como pre-vuelo, convirtiendo un posible BLOCKED en un PASS limpio.
- **Regla que aplica**: `po-analyst` corre la validación contra datos vivos de
  CUALQUIER campo de contrato que proyecte una fuente externa (vault, locks,
  salida de scripts) como PRIMER paso de la Fase 1, ANTES de redactar el REQ —
  no como reacción a una sospecha. Documenta la distribución observada y resuelve
  ambigüedades con decisiones recomendadas en el REQ. Esto convierte el chequeo
  de LL-007 de "red de seguridad" en "pre-vuelo", ahorrando el doble-pase.

## LL-011 — Stories must state the exact *mechanism* of a parse/compare/curate step, not hedge it

- **REQ origen**: REQ-20260622-S2-project-detail-drift (lock-parse / version-compare)
  y REQ-20260622-S3-project-config-tab (type-strict reject-vs-coerce de la curación)
- **Síntoma**: La story dejó la *mecánica* de un paso (cómo parsear el lock —
  yaml vs JSON; cómo comparar versiones — segmento-a-segmento vs string; cómo
  curar un slot type-strict — rechazar a `null` vs `String(value)`/coerción)
  como una "Technical Note" en prosa, no como una decisión resuelta. Cada caso
  salió como un MINOR del `architect-reviewer` (S2: 2 MINORs; S3: 1 MINOR),
  resuelto dentro del freeze sin retrabajo, pero repetido en 2 ciclos.
- **Causa raíz**: LL-006 obliga a especificar la *sintaxis* exacta de un tipo
  TypeScript (`?` vs `: T | null`), pero no cubría la *mecánica de un algoritmo*
  (parse/compare/curación). El refinador dejó la elección implícita asumiendo que
  el implementador "haría lo razonable".
- **Regla que aplica**: `story-refiner` —y `po-analyst` en modo combinado T3—
  cuando una AC nombra un paso de parse/compare/curación con más de una
  implementación razonable (yaml vs JSON; comparación numérica vs string;
  rechazo type-strict vs coerción; orden de igualdad/empate), declara la
  decisión resuelta en la AC (una línea), no una nota hedge. El
  `architect-reviewer` deja de gastar un MINOR en re-resolverla; el freeze solo
  la confirma.

---

## Formato para nuevas lecciones

Cuando el `final-auditor` produce un retro con una lección nueva, añade una
sección a este archivo con este formato:

```markdown
## LL-00X — Título corto (imperativo o descriptivo)

- **REQ origen**: REQ-YYYY-MM-DD-slug
- **Síntoma**: Qué pasó en producción o en review
- **Causa raíz**: Por qué pasó (proceso, no personas)
- **Regla que aplica**: Qué agente + qué checklist cambia para prevenirlo
```

Los prompts de agentes citan `[LL-00X]` en vez de copiar el cuerpo. Esto
mantiene los prompts delgados y permite actualizar las lecciones en un solo
sitio.
