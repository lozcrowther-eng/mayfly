import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ctfd_mayfly is a separate Python/Flask plugin (CTFd challenge type) that happens to
    // live in this repo — its browser-side assets follow CTFd's own bundled challenge-type
    // convention (e.g. dynamic_challenges/assets/create.js), not this project's, and aren't
    // part of the Next.js app.
    "ctfd_mayfly/**",
  ]),
]);

export default eslintConfig;
