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
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "id-denylist": ["warn", "tmp"],
    },
  },
  {
    ignores: ['database/migrations/**/*.ts'],
  },
]);
