/**
 * A fake Higgsfield (api + presigned storage + CDN) behind globalThis.fetch. No network, no real key.
 * Every request is recorded so tests can assert on auth headers, bodies and call counts.
 */
import { randomUUID } from "node:crypto";

export const HF_HOST = "http://mock.hf.test";
export const HF_TEST_KEY = "kid_test_0000:secret_test_1111"; // not a real credential

export type Seen = { method: string; path: string; query: URLSearchParams; headers: Record<string, string>; body: unknown };
export type FakeReq = { id: string; endpoint: string; body: Record<string, unknown>; status: string; output?: "video" | "image" | "none"; polls: number };

/** A tiny but real PNG (1x1) and an MP4-looking blob (ftyp box). */
export const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
export const MP4_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(40, 1)]);

export function installHfFake() {
  const real = globalThis.fetch;
  const state = {
    seen: [] as Seen[],
    reqs: new Map<string, FakeReq>(),
    /** Statuses returned (in order) by the next submit calls, before success. e.g. [503, 503]. */
    submitFailures: [] as number[],
    /** Status to answer GET /requests/:id/status with (HTTP error) for the next calls. */
    statusFailures: [] as number[],
    estimate: { mode: "price" as "price" | "none", usd: "0.70" },
    /** What a freshly submitted request reports on its first status poll. */
    nextTerminal: "completed" as "completed" | "failed" | "nsfw" | "canceled" | "queued" | "in_progress",
    credsValid: true,
    outputBytes: MP4_BYTES as Buffer,
    imageBytes: PNG_1PX as Buffer,
  };
  const calls = (pred: (s: Seen) => boolean) => state.seen.filter(pred);
  const submits = () => calls((s) => s.method === "POST" && !s.path.startsWith("/estimate") && !s.path.startsWith("/files") && !s.path.includes("/cancel"));

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (!String(url).startsWith(HF_HOST)) return real(input, init);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    let body: unknown = init?.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* raw */ } }
    const seen: Seen = { method, path: url.pathname, query: url.searchParams, headers, body };
    state.seen.push(seen);
    const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "x-correlation-id": "corr-test" } });

    // CDN + storage
    if (url.pathname.startsWith("/out/video")) return new Response(new Uint8Array(state.outputBytes), { status: 200, headers: { "content-type": "video/mp4", "content-length": String(state.outputBytes.length) } });
    if (url.pathname.startsWith("/out/image")) return new Response(new Uint8Array(state.imageBytes), { status: 200, headers: { "content-type": "image/png" } });
    if (url.pathname.startsWith("/upload/")) return new Response(null, { status: 200 });
    if (url.pathname.startsWith("/ref/")) return new Response(new Uint8Array(PNG_1PX), { status: 200, headers: { "content-type": "image/png" } });

    if (!state.credsValid) return json({ detail: "Invalid credentials" }, 401);
    if (method === "POST" && url.pathname === "/files/generate-upload-url") {
      const id = randomUUID();
      return json({ upload_url: `${HF_HOST}/upload/${id}`, public_url: `${HF_HOST}/ref/${id}`, upload_headers: { "Content-Type": (body as { content_type: string }).content_type } });
    }
    if (method === "POST" && url.pathname.startsWith("/estimate/")) {
      return state.estimate.mode === "none" ? json({ detail: "nope" }, 500) : json({ credits: "350", usd: state.estimate.usd });
    }
    const st = url.pathname.match(/^\/requests\/([0-9a-f-]+)\/status$/i);
    if (method === "GET" && st) {
      if (st[1] === "00000000-0000-4000-8000-000000000000") return json({ detail: "Not found" }, 404);
      const f = state.statusFailures.shift();
      if (f) return json({ detail: "boom" }, f);
      const r = state.reqs.get(st[1]);
      if (!r) return json({ detail: "Not found" }, 404);
      r.polls++;
      const status = r.status;
      return json({
        status, request_id: r.id,
        ...(status === "completed" && r.output === "video" ? { video: { url: `${HF_HOST}/out/video-${r.id}.mp4` } } : {}),
        ...(status === "completed" && r.output === "image" ? { images: [{ url: `${HF_HOST}/out/image-${r.id}.png` }] } : {}),
      });
    }
    const cancel = url.pathname.match(/^\/requests\/([0-9a-f-]+)\/cancel$/i);
    if (method === "POST" && cancel) return json({}, 202);
    if (method === "POST") {
      const f = state.submitFailures.shift();
      if (f) return json({ detail: f === 400 ? "Maximum number of concurrent requests (20) has been reached" : "boom" }, f);
      const id = randomUUID();
      const endpoint = url.pathname.slice(1);
      const kind = /text-to-image|image-to-image|\/edit|z-image/.test(endpoint) ? "image" : "video";
      state.reqs.set(id, { id, endpoint, body: body as Record<string, unknown>, status: state.nextTerminal, output: kind, polls: 0 });
      return json({ status: "queued", request_id: id, status_url: `${HF_HOST}/requests/${id}/status`, cancel_url: `${HF_HOST}/requests/${id}/cancel` }, 200);
    }
    return json({ detail: "unhandled" }, 404);
  }) as typeof fetch;

  const lastReq = () => [...state.reqs.values()].at(-1);
  return {
    state, calls, submits, lastReq,
    /** Moves every stored request to a status (as Higgsfield would between polls). */
    setAll(status: string) { for (const r of state.reqs.values()) r.status = status; },
    set(id: string, status: string) { const r = state.reqs.get(id); if (r) r.status = status; },
    reset() { state.seen = []; state.reqs.clear(); state.submitFailures = []; state.statusFailures = []; state.estimate = { mode: "price", usd: "0.70" }; state.nextTerminal = "completed"; state.credsValid = true; state.outputBytes = MP4_BYTES; state.imageBytes = PNG_1PX; },
    restore() { globalThis.fetch = real; },
  };
}
