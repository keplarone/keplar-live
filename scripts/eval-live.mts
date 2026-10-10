/**
 * Live eval: sends the eval set (tests/fixtures/eval-set.ts) to a deployed Keplar and applies the `live` checks.
 *   npx tsx scripts/eval-live.mts https://keplar.one [pacingSeconds=18] [idPrefix]
 * Set EVAL_OUT=/path/answers.jsonl to keep every full answer. Anonymous calls are rate limited, so prompts are paced (one retry after 25 s on a 429 or a busy-models error). Prints one row per prompt (pass/fail, latency, answer excerpt) and a summary.
 */
import { appendFileSync } from "node:fs";
import { EVAL_SET } from "../tests/fixtures/eval-set";

const base = (process.argv[2] ?? "https://keplar.one").replace(/\/$/, "");
const pace = Number(process.argv[3] ?? 18) * 1000;
const only = process.argv[4];

type Ev = { type: string; answer?: { markdown?: string }; error?: unknown };
let pass = 0, fail = 0, noLive = 0;
for (const c of EVAL_SET) {
  if (only && !c.id.startsWith(only)) continue;
  if (!c.live) { noLive++; continue; }
  const t0 = Date.now();
  let text = "";
  // One retry after a pause when the site says we are asking too quickly or the free models were busy (the point is the answer's quality, not the rate limit).
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 25_000));
    text = "";
    try {
      const res = await fetch(`${base}/api/keplar`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ prompt: c.prompt, history: c.history ?? [] }) });
      const body = await res.text();
      let err = "";
      for (const line of body.split("\n")) {
        if (!line.trim().startsWith("{")) continue;
        let e: Ev & { message?: string; code?: string };
        try { e = JSON.parse(line); } catch { continue; }
        if (e.type === "answer" && e.answer?.markdown) text = e.answer.markdown;
        if (e.type === "error") err = `${e.code ?? "error"}: ${e.message ?? ""}`;
      }
      if (!text) text = res.status === 429 ? `[429] rate limited` : `[${res.status}] ${err || body.slice(0, 120)}`;
    } catch (e) {
      text = `[error] ${e instanceof Error ? e.message : "failed"}`;
    }
    if (text && !text.startsWith("[")) break;
  }
  if (process.env.EVAL_OUT) appendFileSync(process.env.EVAL_OUT, JSON.stringify({ id: c.id, prompt: c.prompt, ms: Date.now() - t0, text }) + "\n");
  const ms = Date.now() - t0;
  const nWords = text.trim().split(/\s+/).length;
  const bad = [...(c.live.minWords && nWords < c.live.minWords ? [`only ${nWords} words (min ${c.live.minWords})`] : []), ...(c.live.maxWords && nWords > c.live.maxWords ? [`${nWords} words (max ${c.live.maxWords})`] : []), ...(c.live.must ?? []).filter((r) => !r.test(text)).map((r) => `missing ${r}`), ...(c.live.mustNot ?? []).filter((r) => r.test(text)).map((r) => `forbidden ${r}`)];
  if (bad.length) fail++; else pass++;
  console.log(`${bad.length ? "FAIL" : "ok  "} ${c.id.padEnd(9)} ${String(ms).padStart(6)}ms  ${c.prompt.slice(0, 48).padEnd(48)} -> ${text.replace(/\s+/g, " ").slice(0, 110)}${bad.length ? `  [${bad.join("; ")}]` : ""}`);
  await new Promise((r) => setTimeout(r, pace));
}
console.log(`\n${pass} passed, ${fail} failed, ${noLive} offline-only`);
process.exit(fail ? 1 : 0);
