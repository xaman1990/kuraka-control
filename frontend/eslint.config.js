// ESLint v9 flat config — TypeScript + React.
// Uses typescript-eslint for .ts/.tsx parsing (strict mode handled by tsc).
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config[]} */
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // TypeScript strict handles unused vars; the TS eslint rule can produce
      // false positives on type-only imports — disable the base JS rule.
      "no-unused-vars": "off",
      // Allow console for dev tooling in this early-stage project.
      "no-console": "warn",
      // Allow @ts-expect-error with an explanation (used in NavItem pattern).
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
);
