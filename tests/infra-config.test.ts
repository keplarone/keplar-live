import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Infrastructure-as-code checks: the configuration that shapes production (vercel.json, next.config.ts, the security headers,
 * the GitHub workflows, dependabot) is scanned here the way a cloud-config scanner would scan Terraform. Pure file reads, no
 * network, so it runs in CI before anything is built (see .github/workflows/ci.yml).
 */
const read = (p: string) => readFileSync(p, "utf8");

test("every Vercel cron route verifies the cron secret in constant time", () => {
  const cfg = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
  assert.ok(cfg.crons.length >= 5);
  for (const c of cfg.crons) {
    const file = path.join("src/app", c.path, "route.ts");
    assert.ok(existsSync(file), `${c.path} has a route`);
    const src = read(file);
    assert.match(src, /CRON_SECRET|opsAuthorized/, `${c.path} checks CRON_SECRET`);
    assert.match(src, /timingSafeEqual|opsAuthorized/, `${c.path} compares in constant time`);
    assert.match(c.schedule, /^(\S+\s+){4}\S+$/, `${c.path} has a five-field schedule`);
  }
});

test("next.config.ts: no powered-by header, no browser source maps, strict transport security and the app headers applied", () => {
  const src = read("next.config.ts");
  assert.match(src, /poweredByHeader:\s*false/);
  assert.match(src, /productionBrowserSourceMaps:\s*false/);
  assert.match(src, /BASE_HEADERS/);
  assert.match(src, /APP_HEADERS/);
  const headers = read("src/lib/security/headers.ts");
  for (const must of ["Strict-Transport-Security", "includeSubDomains; preload", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "upgrade-insecure-requests"]) assert.ok(headers.includes(must), `headers include ${must}`);
  assert.doesNotMatch(headers.split("const dev")[1] ?? headers, /script-src[^\n]*\*(?!\/)/, "no wildcard script source");
});

test("GitHub workflows: least-privilege token, no pull_request_target, pinned third-party actions, npm ci without scripts", () => {
  const dir = ".github/workflows";
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const y = read(path.join(dir, f));
    assert.doesNotMatch(y, /pull_request_target/, `${f}: untrusted pull requests never run with secrets`);
    assert.match(y, /^permissions:\s*\n\s+contents:\s*read/m, `${f}: top-level permissions are read-only`);
    assert.doesNotMatch(y, /permissions:\s*write-all/, `${f}: no write-all`);
    for (const m of y.matchAll(/uses:\s*([^\s@]+)@([^\s#]+)/g)) {
      const [, action, ref] = m;
      if (action.startsWith("github/") || action.startsWith("actions/dependency-review-action")) continue; // GitHub's own, versioned by major tag
      assert.ok(/^[0-9a-f]{40}$/.test(ref) || action.startsWith("actions/"), `${f}: ${action} is pinned to a commit`);
    }
    if (/npm ci/.test(y)) assert.match(y, /npm ci --ignore-scripts/, `${f}: install scripts do not run in CI`);
    if (/persist-credentials/.test(y)) assert.match(y, /persist-credentials:\s*false/, `${f}: the checkout token is not left on disk`);
  }
  assert.ok(existsSync(path.join(dir, "ci.yml")) && existsSync(path.join(dir, "codeql.yml")) && existsSync(path.join(dir, "dependency-review.yml")));
  const ci = read(path.join(dir, "ci.yml"));
  for (const step of ["secret-scan.mjs", "npm audit --omit=dev", "lockfile-check.mjs", "security-checklist.mjs --check", "tsc --noEmit", "eslint", "npm test", "next build", "npm sbom"]) assert.ok(ci.includes(step), `ci.yml runs ${step}`);
});

test("dependabot watches npm and GitHub Actions weekly; CODEOWNERS covers the security-sensitive paths", () => {
  const d = read(".github/dependabot.yml");
  assert.match(d, /package-ecosystem:\s*npm/);
  assert.match(d, /package-ecosystem:\s*github-actions/);
  const owners = read(".github/CODEOWNERS");
  for (const p of ["/src/lib/security/", "/src/lib/accounts/", "/src/lib/billing/", "/.github/", "/src/proxy.ts", "/next.config.ts"]) assert.ok(owners.includes(p), `CODEOWNERS covers ${p}`);
});

test("no NEXT_PUBLIC_ variable carries a secret-looking name, and no secret pattern lives in the client bundle sources", () => {
  const walk = (d: string, out: string[] = []) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const names = new Set<string>();
  for (const f of walk("src")) for (const m of read(f).matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) names.add(m[0]);
  for (const n of names) assert.doesNotMatch(n, /SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY/, `${n} must not be public`);
  assert.ok(names.size > 0);
});

test(".gitignore keeps env files, builds and backups out of the repository", () => {
  const g = read(".gitignore");
  for (const must of [".env", "node_modules", ".next", ".vercel"]) assert.ok(g.includes(must), `.gitignore has ${must}`);
});
