// ESLint v9 flat config — TypeScript + Node (ESM backend, no React).
// Uses typescript-eslint for .ts parsing (strict mode handled by tsc).
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config[]} */
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // TypeScript strict handles unused vars; the TS eslint rule can produce
      // false positives on type-only imports — disable the base JS rule.
      "no-unused-vars": "off",
      // Allow console for dev tooling in this early-stage project.
      "no-console": "warn",
    },
  },
);
