import dauphaihauConfig from "@dauphaihau/eslint-config";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...(await dauphaihauConfig()),
  {
    ignores: ["eslint.config.mjs"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@stylistic/comma-dangle": ["error", "always-multiline"],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      // Off: min length flags idiomatic short aliases, max length flags verbose domain names.
      // Naming is enforced by @typescript-eslint/naming-convention and id-denylist instead.
      "id-length": "off",
      "id-denylist": ["warn", "tmp"],
    },
  },
  {
    files: ["test/performance/**/*.js"],
    languageOptions: {
      globals: {
        __ENV: "readonly",
        __ITER: "readonly",
        __VU: "readonly",
        open: "readonly",
      },
    },
    rules: {
      "@stylistic/comma-dangle": ["error", "always-multiline"],
    },
  },
  {
    ignores: ['database/migrations/**/*.ts'],
  },
]);
