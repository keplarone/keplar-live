import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Known lint debt (WebGL capability detection runs once in an effect and sets the fallback mode). Warned, not hidden; the gate fails on every other error.
  { files: ["src/components/loader/WorkingHard.tsx", "src/components/monolith/*.tsx"], rules: { "react-hooks/set-state-in-effect": "warn" } },
  // Browser extension (plain ES modules, no bundler): browser globals and the chrome.* API.
  { files: ["extension/**/*.js"], languageOptions: { globals: { chrome: "readonly", document: "readonly", location: "readonly", window: "readonly", fetch: "readonly", AbortController: "readonly", TextDecoder: "readonly", URL: "readonly", URLSearchParams: "readonly", globalThis: "readonly" } } },
  { ignores: ["extension/dist/**", ".next/**", "node_modules/**", "screenshots/**", "public/fx/**", "vendor/**", "next-env.d.ts"] },
];

export default config;
