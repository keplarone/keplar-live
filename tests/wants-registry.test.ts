import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Registry, fts5Available, syntheticAgents } from "@/lib/wants/registry";

test("registry indexes from a generator and looks up at most five matches", async () => {
  const r = new Registry(path.join(mkdtempSync(path.join(tmpdir(), "kw-")), "s.db"), 500);
  try {
    assert.equal(r.fts, fts5Available());
    assert.equal(await r.index(syntheticAgents(20_000)), 20_000);
    assert.equal(r.count(), 20_000);
    const res = await r.lookup("I want pizza delivery");
    assert.ok(res.length > 0 && res.length <= 5);
    assert.ok(res.some((x) => x.keywords.includes("food")));
    assert.deepEqual(await r.lookup("I want"), []);
  } finally {
    r.close();
  }
});

test("lookup cap ignores a larger limit", async () => {
  const r = new Registry(path.join(mkdtempSync(path.join(tmpdir(), "kw-")), "s.db"));
  try {
    await r.index(syntheticAgents(1000));
    assert.equal((await r.lookup("flight hotel", 50)).length, 5);
  } finally {
    r.close();
  }
});
