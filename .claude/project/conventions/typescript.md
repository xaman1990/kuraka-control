# Convention — TypeScript

- `strict: true` everywhere. No `any` without a `// reason:` comment.
- **Nullability:** the config's canonical `"T | None"` means **`T | null`** in
  this codebase (prefer `null` over `undefined` for "absent"; reserve `undefined`
  for "not provided"). Parsers normalize missing frontmatter fields to `null`.
- **States are typed unions**, never magic strings (`enums_for_states: true`).
  The RETRO state machine is a discriminated union in `domain/`.
- Domain layer is **pure**: no `fs`, no `child_process`, no `process.env`.
  Unit-testable without mocks.
- Shared API shapes live in `packages/contracts` as **zod** schemas; derive TS
  types with `z.infer`. Never hand-redeclare a contract type.
- File size ≤ 400 LOC (backend) / 300 LOC (frontend); function ≤ 50 LOC.
