import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Profile and company images use user-configured remote URLs that cannot be
    // enumerated for Next Image optimization.
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["src/lib/cv-pdf.tsx"],
    // React PDF templates intentionally define helpers beside template-specific styles.
    rules: {
      "react-hooks/static-components": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
