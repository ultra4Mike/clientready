import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Plain-Node browser harness scripts under tests/ use CommonJS require().
  { files: ["tests/**/*.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Native shells (Capacitor) and their generated web assets.
    "android/**",
    "ios/**",
    "cap-shell/**",
    "capacitor.config.ts",
  ]),
]);

export default eslintConfig;
