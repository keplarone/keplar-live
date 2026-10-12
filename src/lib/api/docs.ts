/** Code samples for /developers. Kept in one module so a test can check they only use documented paths and fields. */
export const SAMPLE_ORIGIN = "https://keplar.one";

export const CURL_ASK = `curl ${SAMPLE_ORIGIN}/api/v1/ask \\
  -H "Authorization: Bearer $KEPLAR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"question": "Should a two-person startup rewrite its Node.js backend in Rust?"}'`;

export const RESPONSE_SAMPLE = `{
  "object": "answer",
  "id": "ans_...",
  "answer": "Probably not yet. ...",
  "agreement": { "level": "split", "agree": 3, "disagree": 1, "responded": 4, "consulted": 4, "summary": "3 of 4 models agreed ..." },
  "disagreement": {
    "headline": "The models split on timing",
    "topic": "...",
    "tie": false,
    "positions": [ { "stance": "...", "summary": "...", "models": ["..."], "count": 3, "of": 4 } ],
    "agreed": ["..."], "differ": ["..."],
    "why": { "recorded": true, "text": "..." }
  },
  "models": [ { "name": "...", "provider": "...", "status": "responded" } ],
  "sources": [ { "kind": "...", "title": "...", "url": null } ],
  "source_check": null,
  "usage": { "credits": 12 },
  "created": "2026-10-04T12:00:00.000Z"
}`;

export const CURL_STREAM = `curl -N ${SAMPLE_ORIGIN}/api/v1/ask \\
  -H "Authorization: Bearer $KEPLAR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"question": "Is it safe to store JWTs in localStorage?", "stream": true}'`;

export const STREAM_SAMPLE = `event: progress
data: {"stage":"choosing_models"}

event: progress
data: {"stage":"comparing"}

event: delta
data: {"text":"Short answer: ..."}

event: answer
data: { ...the same object as the JSON response... }

event: done
data: {}`;

export const JS_SAMPLE = `const res = await fetch("${SAMPLE_ORIGIN}/api/v1/ask", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.KEPLAR_API_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ question: "JSONB column or a normalized table?" }),
});
if (!res.ok) throw new Error((await res.json()).error.message);
const a = await res.json();
console.log(a.answer);
console.log(a.agreement.summary, a.disagreement?.headline);`;

export const PY_SAMPLE = `import os, requests

r = requests.post(
    "${SAMPLE_ORIGIN}/api/v1/ask",
    headers={"Authorization": f"Bearer {os.environ['KEPLAR_API_KEY']}"},
    json={"question": "JSONB column or a normalized table?"},
    timeout=300,
)
r.raise_for_status()
a = r.json()
print(a["answer"])
print(a["agreement"]["summary"])`;

export const ERRORS: [status: string, code: string, meaning: string][] = [
  ["400", "invalid_request", "Bad JSON or a field out of range. The message says which."],
  ["401", "invalid_api_key", "Missing, malformed, revoked or expired key. Repeated bad keys from one address are throttled."],
  ["402", "limit_reached", "Your plan's credits or a rolling limit is used up. The message says when it resets."],
  ["403", "insufficient_scope / plan_required", "The key lacks the scope, or the account's plan no longer includes the API."],
  ["413", "too_large", "The request body is too large."],
  ["429", "key_rate_limited / rate_limited", "Over the per-key or per-address limit. Wait for the Retry-After header."],
  ["502", "no_response", "No model answered. Nothing is charged."],
  ["503", "unavailable", "Keplar is temporarily unavailable. Retry later."],
];
