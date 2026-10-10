import { defineConfig } from "playwright/test";

/**
 * Browser tests against a real production build served locally (never :3000).
 *   npm run build   (with the env below)   then   npm run test:e2e
 * Env for both build and server: BETTER_AUTH_SECRET, BETTER_AUTH_URL=http://localhost:3199, KEPLAR_DEV_TOOLS=1
 * (RESEND_API_KEY is blanked so nothing is ever emailed; KEPLAR_MX_CHECK=off skips the DNS lookup; dev tools give the local outbox so magic-link emails can be opened). No database: accounts use the stateless session
 * cookies and a throwaway file store (KEPLAR_DATA_DIR).
 */
export const PORT = Number(process.env.E2E_PORT || 3199);
export const SECRET = process.env.BETTER_AUTH_SECRET || "e2e-secret-0123456789abcdefghijklmnopqrstuv";
export const LLM_PORT = Number(process.env.E2E_LLM_PORT || 4797);
export const DATA_DIR = process.env.KEPLAR_DATA_DIR || "/tmp/keplar-e2e-data";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.e2e\.ts/,
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure", launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } },
  webServer: [
    // A test double for the model API (never used outside tests): the Create workspace test builds a real site from its answers.
    { command: `node scripts/fake-llm.mjs ${LLM_PORT}`, cwd: "..", url: `http://127.0.0.1:${LLM_PORT}/health`, reuseExistingServer: false, timeout: 30_000, env: { FAKE_LLM_DELAY: "350" } },
    {
      command: `npx next start -p ${PORT}`,
      cwd: "..",
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: `http://localhost:${PORT}`, KEPLAR_DEV_TOOLS: "1", KEPLAR_MX_CHECK: "off", RESEND_API_KEY: "", KEPLAR_DATA_DIR: DATA_DIR, PORT: String(PORT), OPENROUTER_API_KEY: "test-key", KEPLAR_OPENROUTER_BASE: `http://127.0.0.1:${LLM_PORT}/v1` },
    },
  ],
});
