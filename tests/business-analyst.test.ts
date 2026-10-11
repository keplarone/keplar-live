import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testWorkspace } from "./helpers/workspace";
import { REASON_FRAMEWORKS, reasonPrompt, RESEARCH_TEMPLATES, researchPrompt, titleFrom } from "@/lib/business/prompts";
import { reportFile } from "@/lib/business/report-file";
import { reportsStore, saveReport } from "@/lib/business/reports";

test("Reason: every decision report asks for assumptions, calculations, evidence, uncertainty, recommendation and next actions", () => {
  for (const f of REASON_FRAMEWORKS) {
    const p = reasonPrompt(f.id, "Open a second warehouse?", ["costs.csv"]);
    for (const part of ["Assumptions", "Evidence", "Risks and uncertainty", "Recommendation", "Next actions", "Show every calculation", "Never invent data", "costs.csv"]) assert.ok(p.includes(part), `${f.id}: ${part}`);
  }
  assert.doesNotMatch(reasonPrompt("decision", "x", []), /attached documents/);
});

test("Deep Research: templates give a business report structure and ask for inline citations", () => {
  for (const t of RESEARCH_TEMPLATES) {
    const p = researchPrompt(t.id, "Acme vs Globex", "We sell to dentists");
    assert.ok(p.startsWith(`${t.label}: Acme vs Globex`), t.id);
    assert.match(p, /Cite sources inline/);
    assert.match(p, /We sell to dentists/);
  }
  assert.equal(titleFrom("  a   b "), "a b");
  assert.ok(titleFrom("x".repeat(200)).length <= 91);
});

test("saved reports: need a body, keep only web links as sources, and are per workspace", async () => {
  const ws = await testWorkspace("biz-reports", "plus");
  await assert.rejects(saveReport(ws.id, { markdown: "  " }), /no report/);
  const r = await saveReport(ws.id, {
    kind: "research", title: "Market\nmap", markdown: "Body [1]", projectId: "../etc",
    sources: [{ n: 1, title: "A", url: "https://a.example/x", host: "a.example" }, { n: 2, title: "Bad", url: "javascript:alert(1)" }],
    queries: ["q1", "", "q2"],
  });
  assert.equal(r.title, "Market map");
  assert.equal(r.projectId, null, "an invalid project id is dropped");
  assert.deepEqual(r.sources.map((x) => x.url), ["https://a.example/x"]);
  assert.deepEqual(r.queries, ["q1", "q2"]);
  assert.equal(await reportsStore().get("someone-else", r.id), null);
});

test("export: a report becomes a Markdown file with its numbered sources and a safe name", () => {
  const f = reportFile({ kind: "reason", title: 'Price / "plan" test?', markdown: "Answer", sources: [{ n: 1, title: "[Doc]", url: "https://d.example", host: "d.example" }], createdAt: "2026-10-10T00:00:00.000Z" });
  assert.equal(f.name, "Decision - Price plan test.md");
  assert.match(f.text, /^# Price \/ "plan" test\?/);
  assert.match(f.text, /## Sources\n\n1\. \[Doc\]\(https:\/\/d\.example\)/);
});

test("workspace: Deep Research and Reason are in the Business sidebar and use Keplar's engine", () => {
  const ws = readFileSync("src/components/business-app/BusinessWorkspace.tsx", "utf8");
  assert.match(ws, /label: "Deep Research"/);
  assert.match(ws, /label: "Reason"/);
  const engine = readFileSync("src/components/business-app/engine.ts", "utf8");
  assert.match(engine, /fetch\("\/api\/keplar"/);
  assert.match(engine, /deepResearch: req\.mode === "research"/);
  for (const f of ["src/app/api/business/reports/route.ts", "src/app/api/business/reports/[id]/route.ts"]) assert.match(readFileSync(f, "utf8"), /requireBusiness\(req\)/, f);
});
