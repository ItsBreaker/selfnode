import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/release/**", "**/node_modules/**", "**/.vite/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // Logging keys or secrets is forbidden; keep console use explicit.
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**", "**/*.spike.ts", "**/spikes/**", "arkiv/examples/**"],
    rules: { "no-console": "off" },
  },
);
