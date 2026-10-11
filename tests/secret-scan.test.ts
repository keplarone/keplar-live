import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error: plain .mjs gate script, no type declarations
import { scanText } from "../scripts/secret-scan.mjs";

const scan = scanText as (text: string) => { label: string; line: number }[];
// Built at runtime so this file itself never contains a key-shaped literal for the scanner to flag.
const fake = (prefix: string, body: string) => prefix + body;

test("secret scan: finds real-looking credentials and reports the line, never the value", () => {
  const text = [
    "const a = 1;",
    `const key = "${fake("sk-or-v1-", "9f3c1e7d2b8a4c6e9f3c1e7d2b8a4c6e9f3c1e7d")}";`,
    `STRIPE=${fake("sk_live_", "51Hq2LmZr8KqPw3XyT7vN0aB")}`,
    `db: "${fake("postgres://keplar:", "Zq8!rT2mWx9p")}@ep-cool-db.neon.tech/main"`,
    `const w = "${fake("whsec_", "Qm9yZXN0LWtleS1mb3ItdGVzdGluZy1vbmx5Zg")}";`,
  ].join("\n");
  const hits = scan(text);
  assert.deepEqual(hits.map((h) => h.line), [2, 3, 4, 5]);
  assert.deepEqual(hits.map((h) => h.label), ["OpenRouter key", "Stripe live secret key", "Database URL with password", "Webhook signing secret"]);
});

test("secret scan: test fixtures, placeholders and env references are not flagged", () => {
  const text = [
    `scrub("Bearer ${fake("sk-or-v1-", "abcdef0123456789abcdef0123456789")}")`,
    `DATABASE_URL=postgres://user:password@localhost:5432/test`,
    "const url = `postgres://${user}:${pass}@${host}/db`;",
    `"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----"`,
    "process.env.WHOP_API_KEY",
  ].join("\n");
  assert.deepEqual(scan(text), []);
});

test("the deploy gate runs the secret scan and a production dependency audit, and both block", () => {
  const verify = readFileSync("scripts/verify.mjs", "utf8");
  assert.match(verify, /name: "secret scan", cmd: "node", args: \["scripts\/secret-scan\.mjs"\]/);
  assert.match(verify, /name: "dependency audit", cmd: "npm", args: \["audit", "--omit=dev", "--audit-level=high"\]/);
});
