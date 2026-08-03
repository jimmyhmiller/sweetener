import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "artifacts/**",
      "fixtures/legacy/**",
      "packages/*/dist/**",
      "playground/dist/**",
      "samples/external/*/dist/**",
      "node_modules/**",
      "pnpm-lock.yaml",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        performance: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },
  {
    files: ["playground/src/**/*.ts", "playground/src/**/*.tsx"],
    languageOptions: {
      globals: {
        document: "readonly",
        self: "readonly",
        window: "readonly",
      },
    },
  },
  {
    files: ["fixtures/acceptance/**/*.ts"],
    rules: {
      "no-shadow-restricted-names": "off",
      "@typescript-eslint/no-namespace": "off",
    },
  },
);
