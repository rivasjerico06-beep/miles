import pluginJs from "@eslint/js";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: ["node_modules", "dist", ".vercel", ".pglite", "firmware", "drizzle", "src/components/ui/**"],
  },
  pluginJs.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": pluginReactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^[A-Z_]" }],
    },
  },
  {
    files: ["public/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
];
