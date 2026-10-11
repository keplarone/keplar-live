import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { collection } from "@/lib/create/platform/store";

test("file store retries a transient destination lock without losing the update", async (t) => {
  const rows = collection<{ id: string; workspaceId: string; value: number }>("test_file_retry");
  await rows.insert({ id: "one", workspaceId: "owner", value: 1 });
  const rename = fs.rename.bind(fs);
  let attempts = 0;
  t.mock.method(fs, "rename", async (...args: Parameters<typeof fs.rename>) => {
    if (++attempts === 1) throw Object.assign(new Error("locked"), { code: "EPERM" });
    return rename(...args);
  });
  await rows.update("owner", "one", { value: 2 });
  assert.equal(attempts, 2);
  assert.equal((await rows.get("owner", "one"))?.value, 2);
});

test("file store preserves the previous data and propagates a permanent write failure", async (t) => {
  const rows = collection<{ id: string; workspaceId: string; value: number }>("test_file_failure");
  await rows.insert({ id: "one", workspaceId: "owner", value: 1 });
  const failure = Object.assign(new Error("disk failure"), { code: "EIO" });
  let attempts = 0;
  t.mock.method(fs, "rename", async () => { attempts++; throw failure; });
  await assert.rejects(rows.update("owner", "one", { value: 2 }), failure);
  assert.equal(attempts, 1);
  assert.equal((await rows.get("owner", "one"))?.value, 1);
});
