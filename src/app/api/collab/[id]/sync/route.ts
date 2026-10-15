/**
 * The relay transport.
 * GET  ?since=<seq>&sv=<base64 state vector>  → NDJSON stream for ~45 s: {t:"sync"} exact catch-up first, then {t:"u"} merged
 *      updates as they land and {t:"aw"} presence snapshots when they change. The client reconnects with its cursor.
 * POST { u?: base64[], aw?: state | null, sv?: base64 } → appends updates (editors only; viewers are read-only), stores your
 *      presence stamped with your real identity and role, and (with sv) returns what you are missing.
 */
import { keepAlive } from "@/lib/create/platform/after";
import * as Y from "yjs";
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { access } from "@/lib/collab/caller";
import { collabCan } from "@/lib/collab/roles";
import { diffFor, maybeCompact, OVERLAP, relay } from "@/lib/collab/relay";
import { roomFor } from "@/lib/collab/session";
import { fromB64, toB64 } from "@/lib/collab/doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const STREAM_MS = 45_000;
const AW_KEYS = new Set(["clientId", "file", "cursor", "line", "viewport", "typing", "following", "tab", "selection"]);

function cleanAw(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (AW_KEYS.has(k)) out[k] = v;
  return JSON.stringify(out).length > 4000 ? null : out;
}

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { access: a, user } = await access(req, (await params).id);
    await rateLimit(`collab:stream:${user.id}`, 120, 60, { shared: true });
    const url = new URL(req.url);
    const room = roomFor(a.site.id);
    const store = relay();
    const sv = url.searchParams.get("sv");
    let cursor = Math.max(0, Number(url.searchParams.get("since")) || 0);
    const enc = new TextEncoder();
    const seen = new Set<number>();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctl) {
        const send = (o: unknown) => { try { ctl.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* closed */ } };
        const end = Date.now() + STREAM_MS;
        try {
          const first = await diffFor(room, sv ? fromB64(sv) : null, store);
          cursor = Math.max(cursor, first.seq);
          send({ t: "sync", seq: first.seq, d: toB64(first.update) });
          let awSig = "";
          let idle = 0;
          let lastAw = 0;
          let lastBeat = Date.now();
          while (Date.now() < end && !req.signal.aborted) {
            const rows = (await store.since(room, Math.max(0, cursor - OVERLAP), 300)).filter((r) => !seen.has(r.seq));
            if (rows.length) {
              for (const r of rows) seen.add(r.seq);
              if (seen.size > 2000) for (const k of [...seen].slice(0, 1000)) seen.delete(k);
              cursor = Math.max(cursor, rows[rows.length - 1].seq);
              send({ t: "u", seq: cursor, from: rows.length === 1 ? rows[0].client : "many", d: toB64(rows.length === 1 ? rows[0].data : Y.mergeUpdates(rows.map((r) => r.data))) });
              idle = 0;
            } else idle++;
            if (Date.now() - lastAw > 900) {
              lastAw = Date.now();
              const aw = await store.awareness(room);
              const sig = JSON.stringify(aw.map((x) => [x.client, x.state]));
              if (sig !== awSig) { awSig = sig; send({ t: "aw", states: aw.map((x) => ({ ...x.state, at: x.at })) }); idle = 0; }
            }
            if (Date.now() - lastBeat > 15_000) { lastBeat = Date.now(); send({ t: "hb", seq: cursor }); }
            await new Promise((r) => setTimeout(r, idle < 8 ? 220 : idle < 40 ? 500 : 1100));
          }
          send({ t: "bye", seq: cursor });
        } catch (e) {
          send({ t: "err", error: e instanceof Error ? e.message.slice(0, 120) : "stream failed" });
        } finally {
          try { ctl.close(); } catch { /* already closed */ }
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const { access: a, user } = await access(req, (await params).id);
    await rateLimit(`collab:push:${user.id}`, 600, 60, { shared: true });
    const input = await body<{ u?: unknown; aw?: unknown; sv?: unknown; client?: unknown }>(req);
    const room = roomFor(a.site.id);
    const store = relay();
    const client = typeof input.client === "string" ? input.client.slice(0, 24) : user.id;
    let seq = 0;
    if (Array.isArray(input.u) && input.u.length) {
      if (!collabCan(a.role, "edit")) throw new HttpError(403, "Viewers can watch but not edit.", "forbidden");
      const ups = input.u.filter((x): x is string => typeof x === "string").slice(0, 50).map(fromB64);
      const total = ups.reduce((n, x) => n + x.length, 0);
      if (total > 2_000_000) throw new HttpError(413, "That change is too large to send at once.");
      const merged = ups.length === 1 ? ups[0] : Y.mergeUpdates(ups);
      // Reject anything that is not a valid Yjs update before it reaches everyone else.
      try { Y.applyUpdate(new Y.Doc(), merged); } catch { throw new HttpError(400, "That isn't a valid document update."); }
      seq = await store.append(room, client, merged);
      if (seq % 50 === 0) keepAlive(maybeCompact(room, store), "collab compact");
    }
    if (input.aw !== undefined) {
      const st = input.aw === null ? null : cleanAw(input.aw);
      await store.putAwareness(room, client, st ? { ...st, user: { id: user.id, name: user.name, color: a.user.color, role: a.role } } : null);
    }
    let diff: { d: string; seq: number } | undefined;
    if (typeof input.sv === "string") {
      const r = await diffFor(room, fromB64(input.sv), store);
      diff = { d: toB64(r.update), seq: r.seq };
    }
    return json({ ok: true, seq, ...(diff ? { diff } : {}) });
  } catch (e) {
    return errorResponse(e);
  }
}
