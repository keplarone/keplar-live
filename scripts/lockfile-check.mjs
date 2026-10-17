#!/usr/bin/env node
/**
 * Lockfile integrity for the deploy gate and CI. `npm ci` already refuses a lockfile that disagrees with package.json; this adds
 * the checks it does not do:
 *   - every resolved package comes from registry.npmjs.org (no git, http, file or private-registry URLs slipped in);
 *   - every resolved package carries an integrity hash (sha512), so a swapped tarball fails to install;
 *   - no package in the lockfile is a known typosquat of one we depend on (close-name check against the direct dependencies);
 *   - package.json has no install scripts of its own, and the lockfile lists which dependencies run them (reviewed list below).
 * Exit 1 with a reason for each problem (never prints anything secret).
 */
import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const problems = [];

/** Dependencies allowed to run install scripts (native builds). Anything else that declares one fails the check until reviewed here. */
const SCRIPTS_ALLOWED = new Set(["sharp", "@sparticuz/chromium", "esbuild", "unrs-resolver", "@electric-sql/pglite", "playwright", "playwright-core", "@tailwindcss/oxide", "protobufjs", "core-js", "core-js-pure", "@parcel/watcher", "@swc/core", "sharp-libvips", "lightningcss", "fsevents"]);

if (lock.lockfileVersion < 3) problems.push(`lockfileVersion ${lock.lockfileVersion}: expected 3 (npm 9+)`);
const direct = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (!path) continue; // the root
  const name = entry.name ?? path.replace(/^.*node_modules\//, "");
  if (entry.link) continue;
  if (entry.resolved) {
    let u;
    try { u = new URL(entry.resolved); } catch { problems.push(`${name}: unparsable resolved URL`); continue; }
    if (u.protocol !== "https:" || u.hostname !== "registry.npmjs.org") problems.push(`${name}: resolved from ${u.protocol}//${u.hostname} (only https://registry.npmjs.org is allowed)`);
    if (!/^sha512-/.test(entry.integrity ?? "")) problems.push(`${name}: no sha512 integrity hash`);
  } else if (!entry.inBundle && !entry.extraneous) {
    problems.push(`${name}: no resolved URL in the lockfile`);
  }
  if (entry.hasInstallScript && !SCRIPTS_ALLOWED.has(name)) problems.push(`${name}: runs an install script and is not on the reviewed list in scripts/lockfile-check.mjs`);
}
// Typosquat check: a lockfile package whose name is one edit away from a direct dependency, but is not that dependency.
const names = new Set(Object.values(lock.packages ?? {}).map((e, i) => e.name ?? Object.keys(lock.packages)[i].replace(/^.*node_modules\//, "")).filter(Boolean));
const edit1 = (a, b) => {
  if (a === b || Math.abs(a.length - b.length) > 1 || a.length < 6) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};
for (const d of direct) for (const n of names) if (edit1(d, n) && !direct.has(n) && !n.startsWith("@types/")) problems.push(`${n}: one character away from the direct dependency ${d} (typosquat?)`);
// Our own package must not run arbitrary scripts on install.
for (const k of ["preinstall", "install", "postinstall", "prepare"]) if (pkg.scripts?.[k]) problems.push(`package.json has a ${k} script; install must stay side-effect free`);

if (problems.length) {
  console.error(`lockfile-check: ${problems.length} problem(s)\n  ${problems.slice(0, 40).join("\n  ")}`);
  process.exit(1);
}
console.log(`lockfile-check: ok (${names.size} packages, all from registry.npmjs.org with sha512 integrity)`);
