import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { scrub } from "../src/lib/ops/errors";
import { encryptSecret, decryptSecret } from "../src/lib/create/platform/secrets";
import { sealSecret, openSecret } from "../src/lib/mcp/crypto";

function sources(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

test("no console call prints a variable named token, secret, password, authorization, cookie, api key or bearer", () => {
  const hits: string[] = [];
  for (const p of sources("src")) {
    const src = readFileSync(p, "utf8");
    for (const m of src.matchAll(/console\.(?:log|info|warn|error|debug)\(([^;]*?)\);?/gs)) {
      const withoutStrings = m[1].replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/`[^`$]*`/g, "``");
      if (/\b\w*(token|secret|password|authorization|cookie|apikey|api_key|bearer)\w*\b/i.test(withoutStrings) || /\$\{[^}]*(token|secret|password|authorization|cookie|apikey|bearer)[^}]*\}/i.test(m[1])) hits.push(`${p}: ${m[0].slice(0, 100)}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("error reports scrub bearer tokens, API keys, emails and query-string secrets", () => {
  const out = scrub("fetch failed Authorization: Bearer sk-or-v1-abcdef0123456789abcdef0123456789 for ada@example.com at https://x.test/cb?token=abc123&code=zzz");
  assert.doesNotMatch(out, /sk-or-v1-abcdef/);
  assert.doesNotMatch(out, /ada@example\.com/);
  assert.doesNotMatch(out, /abc123/);
});

test("connector secrets are encrypted: ciphertext never contains the plaintext, tampering and a different workspace fail", () => {
  process.env.BETTER_AUTH_SECRET = "audit-secret-0123456789abcdefghijklmn";
  const plain = JSON.stringify({ access_token: "ya29.PLAINTEXT-TOKEN", refresh_token: "1//REFRESH" });
  const blob = sealSecret(plain, "ws_a", "row1");
  assert.doesNotMatch(blob, /PLAINTEXT|REFRESH|ya29/);
  assert.equal(openSecret(blob, "ws_a", "row1"), plain);
  assert.equal(openSecret(blob, "ws_b", "row1"), null);
  assert.equal(openSecret(blob, "ws_a", "row2"), null);
  const parts = blob.split(".");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.equal(openSecret(parts.join("."), "ws_a", "row1"), null);
});

test("the older token helper refuses to fall back to its public dev key in production", () => {
  const env = process.env as Record<string, string | undefined>;
  const prevEnv = env.NODE_ENV, prevKey = env.KEPLAR_TOKEN_ENC_KEY;
  try {
    env.NODE_ENV = "production";
    delete env.KEPLAR_TOKEN_ENC_KEY;
    assert.throws(() => encryptSecret("x"), /secrets_unavailable/);
    env.KEPLAR_TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
    assert.equal(decryptSecret(encryptSecret("hello")), "hello");
  } finally {
    env.NODE_ENV = prevEnv;
    if (prevKey === undefined) delete env.KEPLAR_TOKEN_ENC_KEY; else env.KEPLAR_TOKEN_ENC_KEY = prevKey;
  }
});

test("no stored connector row type exposes a plaintext token field", () => {
  const types = readFileSync("src/lib/business/types.ts", "utf8");
  assert.match(types, /tokenEnc: string \| null/);
  assert.doesNotMatch(types, /\b(accessToken|refreshToken|access_token|refresh_token)\b/);
});
