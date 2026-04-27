import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs["flat/recommended"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        NotificationPermission: "readonly",
      },
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      // goto() and <a href> in components don't need resolve() — that's hooks.server.ts territory
      "svelte/no-navigation-without-resolve": "off",
      // URLSearchParams used as a pure local variable (not reactive state) is fine
      "svelte/prefer-svelte-reactivity": "off",
      // Allow _ prefix for intentionally unused variables (skeleton loaders, etc.)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      "build/",
      ".svelte-kit/",
      "dist/",
      "src/lib/paraglide/",
      "*.config.js",
      "*.config.ts",
    ],
  },
);
