/**
 * Which realtime transport a session uses.
 *
 *  relay      (default, works on Vercel with nothing extra) Yjs updates through Keplar's own Postgres-backed relay, streamed
 *             to every browser. ~0.3–0.8 s between people. Same-browser tabs also talk over BroadcastChannel (instant).
 *  websocket  set KEPLAR_COLLAB_WS_URL (wss://…) and KEPLAR_COLLAB_WS_SECRET to use any y-websocket-protocol server
 *             (Hocuspocus, y-websocket, PartyKit y-partykit) for ~30 ms latency. The browser connects to
 *             `${url}/${room}?token=<JWT>`; the JWT is HS256-signed with the secret and carries { room, sub, role, exp }, so the
 *             server can verify it with any JWT library and enforce read-only for viewers (role === "viewer").
 */
import { createHmac } from "node:crypto";
import type { CollabRole } from "./roles";
import { roomFor } from "./session";

export type Transport = { mode: "relay"; room: string } | { mode: "websocket"; room: string; url: string; token: string; expiresAt: number };

const b64u = (s: string | Buffer) => Buffer.from(s).toString("base64url");

export function signRoomToken(secret: string, claims: { room: string; sub: string; role: CollabRole }, ttlSec = 3600, at = Date.now()) {
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const exp = Math.floor(at / 1000) + ttlSec;
  const payload = b64u(JSON.stringify({ ...claims, iat: Math.floor(at / 1000), exp, iss: "keplar" }));
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return { token: `${header}.${payload}.${sig}`, exp };
}

export function verifyRoomToken(secret: string, token: string, at = Date.now()): null | { room: string; sub: string; role: CollabRole; exp: number } {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const want = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  if (want.length !== s.length || want !== s) return null;
  try {
    const c = JSON.parse(Buffer.from(p, "base64url").toString()) as { room: string; sub: string; role: CollabRole; exp: number };
    return c.exp * 1000 > at ? c : null;
  } catch {
    return null;
  }
}

export function transportFor(siteId: string, userId: string, role: CollabRole): Transport {
  const room = roomFor(siteId);
  const url = process.env.KEPLAR_COLLAB_WS_URL?.trim();
  const secret = process.env.KEPLAR_COLLAB_WS_SECRET?.trim();
  if (url && secret && /^wss?:\/\//.test(url)) {
    const { token, exp } = signRoomToken(secret, { room, sub: userId, role });
    return { mode: "websocket", room, url: url.replace(/\/+$/, ""), token, expiresAt: exp * 1000 };
  }
  return { mode: "relay", room };
}
