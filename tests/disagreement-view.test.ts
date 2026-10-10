import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDisagreementView, GENERIC_RESOLUTION, type DvInput } from "@/lib/disagreement-view";

const base = (o: Partial<DvInput> = {}): DvInput => ({
  consensus: { level: "partial", agree: 2, disagree: 1, responded: 3, consulted: 3 },
  models: [{ name: "A", status: "responded" }, { name: "B", status: "responded" }, { name: "C", status: "responded" }],
  disagreements: [{ topic: "Sort first?", positions: [{ stance: "sort first", models: ["C"], summary: "No extra memory." }, { stance: "use a hash map", models: ["A", "B"], summary: "Constant-time." }], resolution: "Went with the hash map; memory was not a stated limit." }],
  reviewer: "Reviewer One",
  ...o,
});

test("nothing to compare: no view for one model, for a unanimous panel, or without two positions", () => {
  assert.equal(buildDisagreementView(base({ disagreements: [] })), null);
  assert.equal(buildDisagreementView(base({ consensus: { level: "single", agree: 1, disagree: 0, responded: 1, consulted: 1 } })), null);
  assert.equal(buildDisagreementView(base({ disagreements: [{ topic: "t", positions: [{ stance: "x", models: ["A", "B"], summary: "" }], resolution: "" }] })), null);
});

test("columns are sorted by support, the lead is marked, and every line is the pipeline's own text", () => {
  const v = buildDisagreementView(base())!;
  assert.equal(v.headline, "2 of 3 models agree");
  assert.deepEqual(v.columns.map((c) => [c.stance, c.count, c.total, c.lead]), [["use a hash map", 2, 3, true], ["sort first", 1, 3, false]]);
  assert.deepEqual(v.agreed, ["2 of 3 models took the same position: use a hash map."]);
  assert.deepEqual(v.differ, ["1 of 3 says: sort first."]);
  assert.equal(v.why.recorded, true);
  assert.equal(v.why.text, "Went with the hash map; memory was not a stated limit.");
  assert.equal(v.why.reviewer, "Reviewer One");
  assert.deepEqual(v.notes, []);
});

test("an even split is a split: no lead, no claimed majority", () => {
  const v = buildDisagreementView(base({ consensus: { level: "none", agree: 1, disagree: 1, responded: 2, consulted: 2 }, disagreements: [{ topic: "t", positions: [{ stance: "A", models: ["M1"], summary: "" }, { stance: "B", models: ["M2"], summary: "" }], resolution: "" }] }))!;
  assert.equal(v.headline, "The models split 1 – 1");
  assert.equal(v.tie, true);
  assert.ok(v.columns.every((c) => !c.lead));
  assert.deepEqual(v.agreed, []);
  assert.equal(v.differ.length, 2);
});

test("honesty: the stock sentence or an empty resolution is never shown as a reason", () => {
  for (const resolution of [GENERIC_RESOLUTION, "", "   "]) {
    const v = buildDisagreementView(base({ disagreements: [{ ...base().disagreements[0], resolution }] }))!;
    assert.equal(v.why.recorded, false);
    assert.ok(!v.why.text.includes("weighed the evidence"));
    assert.match(v.why.text, /No specific reason/);
  }
  const none = buildDisagreementView(base({ reviewer: undefined, disagreements: [{ ...base().disagreements[0], resolution: "" }] }))!;
  assert.ok(!none.why.text.includes("second model"), "no reviewer ran, so none is claimed");
});

test("review findings: held points count as agreement, revised/removed/minority as difference, web checks are left to the sources block", () => {
  const v = buildDisagreementView(base({
    checks: [
      { kind: "reasoning", finding: "Sorting is O(n log n)", outcome: "held", resolution: "Kept." },
      { kind: "unsupported", finding: "Binary search needs no memory", outcome: "kept-as-dissent", resolution: "Shown as a minority view." },
      { kind: "contradiction", finding: "Two figures conflict", outcome: "removed", resolution: "Dropped the figure." },
      { kind: "web", finding: "Some web claim", outcome: "supported", resolution: "Found." },
    ],
  }))!;
  assert.ok(v.agreed.includes("The review kept this: Sorting is O(n log n)."));
  assert.ok(v.differ.includes("Kept as a minority view: Binary search needs no memory."));
  assert.ok(v.differ.includes("Left out: Two figures conflict."));
  assert.equal(JSON.stringify(v).includes("web claim"), false);
  assert.equal(v.why.steps.length, 3);
});

test("models that did not answer are named as missing, not counted as dissent", () => {
  const v = buildDisagreementView(base({ models: [{ name: "A", status: "responded" }, { name: "B", status: "responded" }, { name: "C", status: "failed" }, { name: "Judge", slot: "judge", status: "failed" }] }))!;
  assert.deepEqual(v.notes, ["C did not answer, so it is not counted on either side."]);
});

test("shared snapshot keeps review findings (not web checks) with caps, and personal data in them blocks publishing", async () => {
  const { sanitizeSnapshot, SHARE_LIMITS } = await import("@/lib/growth/share");
  const { findPersonalData } = await import("@/lib/growth/share-public");
  const many = Array.from({ length: 20 }, (_, i) => ({ kind: "reasoning", finding: `f${i}`, models: ["A"], outcome: "held", resolution: "r" }));
  const snap = sanitizeSnapshot({
    markdown: "An answer long enough to share.", consensus: { level: "partial", agree: 2, disagree: 1, responded: 3, consulted: 3 }, models: [], disagreements: [],
    checks: [...many, { kind: "web", finding: "w", outcome: "supported", resolution: "x" }, { kind: "reasoning", finding: "bad outcome", outcome: "weird", resolution: "" }, "junk", null],
    reviewer: "Reviewer One (verifier)",
  }, false);
  assert.ok(typeof snap !== "string");
  if (typeof snap === "string") return;
  assert.equal(snap.checks!.length, SHARE_LIMITS.checks);
  assert.ok(snap.checks!.every((k) => k.kind !== "web" && k.outcome === "held"));
  assert.equal(snap.reviewer, "Reviewer One (verifier)");
  assert.deepEqual(findPersonalData(`${snap.checks![0].finding} jane@example.com`), ["an email address"]);
});
