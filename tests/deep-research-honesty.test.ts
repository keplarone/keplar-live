/**
 * Deep Research stays honest while KEPLAR_RETRIEVAL_ENABLED is not exactly "true".
 * The chip says so before the request, and the API does not present an unfetched note as a source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toV1Answer } from "../src/lib/api/format";
import { deepResearchChipNote, OFF_NOT_ENABLED } from "../src/lib/orchestration/research-notes";

test("the Deep Research chip uses the off note before a request unless search will actually run", () => {
  assert.equal(deepResearchChipNote(false), OFF_NOT_ENABLED);
  assert.equal(deepResearchChipNote(true), null);
  assert.match(OFF_NOT_ENABLED, /No pages were read/);
  const composer = readFileSync("src/components/app-ui/Composer.tsx", "utf8");
  assert.match(composer, /deepResearchChipNote\(retrievalEnabled === true \|\| liveOn\)/);
  assert.match(composer, /data-retrieval=\{drOffNote \? "off" : "on"\}/);
  assert.match(composer, /const drBlocked = modes\.deepResearch && \(drNotOnPlan \|\| drRuns < 1\) && !liveOn;/);
  const tab = readFileSync("src/app/app/_tab.tsx", "utf8");
  const home = readFileSync("src/components/app-ui/ChatHome.tsx", "utf8");
  assert.match(tab, /KEPLAR_RETRIEVAL_ENABLED === "true"/);
  assert.match(home, /KEPLAR_RETRIEVAL_ENABLED === "true"/);
});

test("a note that no page was fetched is not returned as a source", () => {
  const a = {
    id: "ans_off",
    markdown: "Models only.",
    compute: { units: 1 },
    sources: [
      { kind: "note", title: "Web search", detail: "Web retrieval isn't live yet. No pages were fetched for this answer." },
      { kind: "model", title: "A paper", url: "https://example.com/paper" },
      { kind: "note", title: "Exact check", detail: "Computed locally.", url: "https://example.com/exact" },
    ],
    models: [],
    consensus: { level: "single", agree: 1, disagree: 0, responded: 1, consulted: 1, summary: "One model." },
    disagreements: [],
    verification: { mode: "none", checks: [] },
    research: { queries: [], sources: [], cited: [], off: OFF_NOT_ENABLED },
  };
  const out = toV1Answer(a as never, new Date("2026-10-19T00:00:00.000Z"));
  assert.deepEqual(out.sources.map((s) => s.title), ["A paper", "Exact check"]);
  assert.equal(out.sources.some((s) => s.title === "Web search"), false);
  assert.deepEqual(out.research, { pages_read: 0, cited: 0, note: OFF_NOT_ENABLED });
});
