import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { threadToMarkdown, exportFileName } from "@/components/app-ui/chat-export";
import type { Thread } from "@/components/app-ui/state/types";

const thread = {
  id: "t1", title: "Pick a database?", projectId: null, createdAt: 1, updatedAt: 2,
  messages: [
    { id: "u1", role: "user", text: "pg or mysql?", attachments: [{ name: "schema.sql" }], modes: {}, createdAt: 1 },
    { id: "k1", role: "keplar", replyTo: "u1", status: "done", stages: [], capabilities: [], models: [], draft: "", answer: { markdown: "Use Postgres.", consensus: { level: "partial", agree: 2, disagree: 1 } } },
    { id: "u2", role: "user", text: "why?", attachments: [], modes: {}, createdAt: 3 },
    { id: "k2", role: "keplar", replyTo: "u2", status: "error", stages: [], capabilities: [], models: [], draft: "half", error: { kind: "network", message: "x", retryable: true } },
  ],
} as unknown as Thread;

test("a chat exports as Markdown: your questions, the answers, how many models agreed; failed turns are left out", () => {
  const md = threadToMarkdown(thread, new Date("2026-10-04T12:00:00Z"));
  assert.match(md, /^# Pick a database\?/);
  assert.match(md, /Exported from Keplar on 2026-10-04\./);
  assert.match(md, /## You\n\npg or mysql\?/);
  assert.match(md, /_Attached: schema\.sql_/);
  assert.match(md, /## Keplar\n\nUse Postgres\./);
  assert.match(md, /_2 of 3 models agreed\._/);
  assert.ok(!md.includes("half"), "an errored turn's partial text is not exported");
  assert.equal(exportFileName(thread), "pick-a-database.md");
});
