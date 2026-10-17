import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * The security checklist register (security/checklist.json) stays honest: every item has a status, every piece of evidence
 * exists in the repository, nothing is TODO, and docs/security-checklist.md is the rendered copy of it.
 */
test("security/checklist.json: every evidence path exists, nothing is TODO, and the rendered markdown is current", () => {
  const r = spawnSync(process.execPath, ["scripts/security-checklist.mjs", "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});

test("the register covers all 17 sections of the checklist and the generator guarantees are listed", () => {
  const data = JSON.parse(readFileSync("security/checklist.json", "utf8")) as { sections: { id: string; items: { item: string; status: string; evidence: string[] }[] }[] };
  assert.equal(data.sections.length, 18, "17 checklist sections plus the generated-output section");
  const all = data.sections.flatMap((s) => s.items);
  assert.ok(all.length >= 430, `items: ${all.length}`);
  const gen = data.sections.find((s) => s.id === "generated-output");
  assert.ok(gen && gen.items.length >= 10, "generated sites and apps have their own guarantees");
  const evidence = new Set(all.flatMap((i) => i.evidence));
  for (const must of ["src/lib/create/output-checklist.ts", "tests/output-checklist.test.ts", "src/lib/security/events.ts", "src/lib/security/upload-scan.ts", ".github/workflows/codeql.yml", "docs/threat-model.md", "docs/security-policy.md", "docs/privacy-inventory.md", "docs/runbooks/security-incident.md"]) {
    assert.ok([...evidence].some((e) => e.startsWith(must)), `${must} is cited as evidence`);
  }
});
