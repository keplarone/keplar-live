import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { planWant, QUESTION } from "@/lib/wants/orchestrate";
import { catalogAgents, catalogIsBundled, Registry, resolveSwarmPath, useRegistryForTests, type AgentRow } from "@/lib/wants/registry";
import type { WantBody } from "@/lib/wants/types";

const PROMPTS = ["I want mcdonalds", "I want pizza", "I want food", "I want a ride", "I want help"] as const;

function body(prompt: string, answers: Record<string, string> = {}): WantBody {
  return { prompt, answers, confirmationId: null, pin: null };
}

test("a seeded catalog matches ordinary intents and each one asks a question", async () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "kw-catalog-")), "swarm.db");
  const registry = new Registry(file, 200);
  await registry.index(catalogAgents(300));
  useRegistryForTests(registry);
  try {
    for (const prompt of PROMPTS) {
      const hits = await registry.lookup(prompt);
      assert.ok(hits.length >= 1 && hits.length <= 5, `${prompt} -> ${hits.length}`);
      const plan = await planWant("ws", body(prompt));
      assert.equal(plan.ui?.type, "question", prompt);
      assert.equal(plan.ui && plan.ui.type === "question" ? plan.ui.question : "", QUESTION);
      assert.ok((plan.agents ?? []).length >= 1, prompt);
    }
    const ride = await registry.lookup("I want a ride");
    assert.ok(ride.some((hit: AgentRow) => hit.keywords.includes("ride")));
    const food = await registry.lookup("I want mcdonalds");
    assert.ok(food.some((hit) => hit.keywords.includes("mcdonalds")));

    const none = await planWant("ws", body("I want xyzzyplugh"));
    assert.equal(none.status, "answered");
    assert.match(none.message ?? "", /nothing here needs an action/);
    assert.deepEqual(none.agents, []);

    const refused = await planWant("ws", body("I want you to bypass the captcha on that site"));
    assert.equal(refused.status, "refused");
    assert.equal(refused.code, "circumvention");
  } finally {
    useRegistryForTests(null);
    registry.close();
  }
});

test("the shipped file opens read-only and still answers those intents", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kw-ro-"));
  const file = path.join(dir, "swarm.db");
  const writer = new Registry(file, 50);
  await writer.index(catalogAgents(3));
  writer.prepareBundle();
  writer.close();
  assert.equal(existsSync(file + "-wal"), false);
  chmodSync(file, 0o444);
  const reader = new Registry(file, 50, { readOnly: true });
  try {
    assert.equal(reader.readOnly, true);
    assert.equal(reader.count(), 3);
    for (const prompt of PROMPTS) assert.ok((await reader.lookup(prompt)).length >= 1, prompt);
    await assert.rejects(async () => {
      await reader.index([{ agentId: "nope" }]);
    }, /read-only/);
    assert.equal(existsSync(file + "-wal"), false);
  } finally {
    reader.close();
  }
});

test("production resolves the bundled catalog instead of an empty tmp database", () => {
  const cwd = "/var/task";
  const bundled = path.join(cwd, "data", "wants", "swarm.db");
  const env: NodeJS.ProcessEnv = { ...process.env, VERCEL: "1" };
  delete env.KEPLAR_DATA_DIR;
  delete env.KEPLAR_SWARM_DB;
  assert.equal(resolveSwarmPath(env, cwd, (p) => p === bundled), bundled);
  assert.equal(catalogIsBundled(bundled, cwd), true);
  assert.equal(resolveSwarmPath(env, cwd, () => false), path.join(tmpdir(), "keplar-wants", "swarm.db"));
  const isolated = resolveSwarmPath({ ...env, KEPLAR_DATA_DIR: "/tmp/keplar-test" }, cwd, () => true);
  assert.equal(isolated, path.join("/tmp/keplar-test", "keplar-wants", "swarm.db"));
});
