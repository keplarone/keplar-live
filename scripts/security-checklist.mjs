#!/usr/bin/env node
/**
 * The security checklist register: security/checklist.json is the source of truth (every control, its status and its evidence);
 * docs/security-checklist.md is rendered from it.
 *
 *   node scripts/security-checklist.mjs            render docs/security-checklist.md
 *   node scripts/security-checklist.mjs --check    exit 1 unless: every item has a known status, every evidence path exists,
 *                                                  no item is still "todo", and the rendered markdown is up to date (CI, deploy gate)
 *
 * Statuses:
 *   done      implemented in code and backed by the evidence listed (a file, a test, a config)
 *   policy    a written procedure or decision the owner follows (evidence: the document); software cannot do it alone
 *   accepted  a documented, time-boxed risk acceptance (docs/security-policy.md keeps the register)
 *   n/a       does not apply to this architecture (serverless, no containers, no GraphQL...), with the reason
 *   todo      not done: fails the check, so a regression or a new unmet item blocks the build
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const SRC = "security/checklist.json";
const OUT = "docs/security-checklist.md";
const STATUSES = new Set(["done", "policy", "accepted", "n/a", "todo"]);
const check = process.argv.includes("--check");

const data = JSON.parse(readFileSync(SRC, "utf8"));
const problems = [];
let total = 0;
const counts = { done: 0, policy: 0, accepted: 0, "n/a": 0, todo: 0 };
const seen = new Set();
for (const section of data.sections) {
  if (!section.id || !section.title || !Array.isArray(section.items)) problems.push(`section ${section.id ?? "?"}: id, title and items required`);
  for (const it of section.items) {
    total++;
    const where = `${section.id}: ${it.item}`;
    if (!it.item) problems.push(`${section.id}: an item has no text`);
    if (!STATUSES.has(it.status)) problems.push(`${where}: unknown status "${it.status}"`);
    else counts[it.status]++;
    if (it.status === "todo") problems.push(`${where}: still todo`);
    if (!Array.isArray(it.evidence) || !it.evidence.length) problems.push(`${where}: no evidence`);
    for (const e of it.evidence ?? []) {
      // Evidence is a repo path (optionally with a #fragment), a URL, or a setting reference `setting:...`.
      if (/^https?:\/\//.test(e) || /^(setting|vercel|github|neon|whop):/.test(e)) continue;
      const path = e.replace(/#.*$/, "");
      if (!existsSync(path)) problems.push(`${where}: evidence ${path} does not exist`);
    }
    if ((it.status === "accepted" || it.status === "n/a" || it.status === "policy") && !it.note) problems.push(`${where}: ${it.status} needs a note saying why`);
    const key = `${section.id}|${it.item.toLowerCase()}`;
    if (seen.has(key)) problems.push(`${where}: listed twice`);
    seen.add(key);
  }
}

const badge = { done: "Done", policy: "Policy", accepted: "Accepted risk", "n/a": "Not applicable", todo: "TODO" };
const link = (e) => (/^https?:\/\//.test(e) ? `[link](${e})` : /^(setting|vercel|github|neon|whop):/.test(e) ? `\`${e}\`` : `[\`${e}\`](../${e.replace(/#.*$/, "")})`);
const lines = [];
lines.push(`# Keplar security checklist`);
lines.push("");
lines.push(`Rendered from \`security/checklist.json\` by \`scripts/security-checklist.mjs\`; do not edit by hand. \`tests/security-checklist.test.ts\` and CI fail when an evidence file disappears or an item regresses to TODO.`);
lines.push("");
lines.push(`**${total} controls.** Done ${counts.done} · Policy ${counts.policy} · Accepted risk ${counts.accepted} · Not applicable ${counts["n/a"]} · TODO ${counts.todo}.`);
lines.push("");
lines.push(`"Done" means the control exists in code or configuration and the evidence column points at it (a module, a test that exercises it, or a setting). "Policy" means a written procedure the operator follows, because software cannot perform it alone (a restore drill, a lawyer's review, a penetration test). "Accepted risk" is a deliberate, dated decision recorded in \`docs/security-policy.md\`. Nothing here claims a certification or an external audit; \`/security\` says the same.`);
lines.push("");
lines.push(`Last rendered: ${data.updated}.`);
lines.push("");
lines.push("## Contents");
lines.push("");
for (const s of data.sections) lines.push(`- [${s.title}](#${s.id})`);
lines.push("");
for (const s of data.sections) {
  const done = s.items.filter((i) => i.status === "done").length;
  lines.push(`<a id="${s.id}"></a>`);
  lines.push("");
  lines.push(`## ${s.title}`);
  lines.push("");
  if (s.summary) lines.push(s.summary, "");
  lines.push(`${s.items.length} items, ${done} done in code.`);
  lines.push("");
  lines.push("| Control | Status | Evidence | Note |");
  lines.push("|---|---|---|---|");
  for (const it of s.items) lines.push(`| ${it.item} | ${badge[it.status] ?? it.status} | ${(it.evidence ?? []).map(link).join("<br>")} | ${(it.note ?? "").replace(/\|/g, "\\|")} |`);
  lines.push("");
}
const md = lines.join("\n");

if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== md) problems.push(`${OUT} is out of date: run node scripts/security-checklist.mjs`);
  if (problems.length) {
    console.error(`security-checklist: ${problems.length} problem(s)\n  ${problems.slice(0, 60).join("\n  ")}`);
    process.exit(1);
  }
  console.log(`security-checklist: ok (${total} controls: ${counts.done} done, ${counts.policy} policy, ${counts.accepted} accepted, ${counts["n/a"]} n/a)`);
} else {
  if (problems.length) console.error(`security-checklist: ${problems.length} problem(s) (rendered anyway)\n  ${problems.slice(0, 60).join("\n  ")}`);
  writeFileSync(OUT, md);
  console.log(`security-checklist: wrote ${OUT} (${total} controls)`);
  if (problems.length) process.exit(1);
}
