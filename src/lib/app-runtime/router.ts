/**
 * HTTP API of the app runtime, mounted at `<app base>/_api/...` for both the draft preview and the published app.
 * Generated apps run in a sandboxed, opaque-origin document, so every answer carries permissive CORS (no credentials: the
 * end user's session is a bearer token, never a cookie) and preflights are answered. The context (app id, environment, spec,
 * creator plan) is always resolved by the server from the URL; nothing in the request can point it at another app.
 */
import { keepAlive } from "@/lib/create/platform/after";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { sendEmail, emailConfigured } from "@/lib/accounts/outbox";
import type { AppCtx } from "./context";
import { AuthError, getPublicUser, listPublicUsers, magicToken, redeemMagic, selfUser, signIn, signOut, signUp, updateProfile, userFor, type AppUser } from "./auth";
import { changeVersion, countItems, createItem, DataError, deleteItem, getItem, groupCounts, listItems, toggleItem, updateItem } from "./data";
import { getFile, putFile } from "./files";
import { resolveImageRefs } from "@/lib/app-builder/files";
import { recordUsage, runAi } from "./ai";
import { expandFields, expandItems } from "./expand";
import { checkHookKey, hookRecord } from "./hooks";

export const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-file-name",
  "access-control-max-age": "600",
};
const JSON_H = { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

export const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...JSON_H, ...extra } });
/** Data responses: "keplar-image:<slot>" values (seed content) become the generated image or a themed placeholder. */
const dbJsonFor = (meta: AppCtx["meta"]) => (status: number, body: unknown) => new Response(resolveImageRefs(JSON.stringify(body), meta), { status, headers: JSON_H });
export const preflight = () => new Response(null, { status: 204, headers: CORS });

const MAX_JSON = 200_000;
async function readJson(req: Request): Promise<Record<string, unknown>> {
  const t = await req.text();
  if (t.length > MAX_JSON) throw new DataError("The request is too large.", 413);
  if (!t) return {};
  try {
    const v = JSON.parse(t);
    return v && typeof v === "object" && !Array.isArray(v) ? v : { value: v };
  } catch {
    throw new DataError("The request body must be JSON.");
  }
}
const qJson = (v: string | null) => {
  if (!v) return undefined;
  try {
    return JSON.parse(v);
  } catch {
    throw new DataError("`where` must be JSON.");
  }
};

/** `appUrl`: absolute URL of the app's home (used in magic-link emails). */
export async function handleAppApi(req: Request, ctx: AppCtx, parts: string[], appUrl: string): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  const ip = clientIpOf(req);
  const url = new URL(req.url);
  const [a, b, c] = parts;
  // The builder's own test browser (env "qa", reachable only in-process) is not rate limited.
  const limit = (key: string, n: number, win: number) => (ctx.env === "qa" ? Promise.resolve() : rateLimit(key, n, win, { shared: true }).then(() => undefined));
  try {
    await limit(`appapi:${ctx.appId}:${ctx.env}:${ip}`, ctx.limits.reqPerMin, 60);
    if (a === "ping") return json(200, { ok: true, env: ctx.env, backend: ctx.limits.backend, ai: ctx.limits.ai && ctx.meta.settings.ai });
    if (!ctx.limits.backend) return json(403, { error: "This app's plan doesn't include a backend (accounts, saved data, files, AI). The owner can upgrade to turn it on.", code: "no_backend" });
    /* ── incoming webhooks (other services adding records; see hooks.ts) ── */
    if (a === "hooks" && b) {
      if (req.method !== "POST") return json(405, { error: "Send a POST with a JSON body.", code: "method" }, { allow: "POST" });
      if (!checkHookKey(ctx.appId, ctx.env, b, url.searchParams.get("key") ?? req.headers.get("x-keplar-key"))) return json(403, { error: "Unknown or wrong webhook key.", code: "bad_key" });
      await limit(`apphook:${ctx.appId}:${ctx.env}:${b}`, 60, 60);
      const item = await createItem(ctx, null, b, hookRecord(await readJson(req)), { ownerId: "hook", ownerName: "Webhook" });
      keepAlive(recordUsage(ctx, "write"), "app usage");
      return json(201, { ok: true, id: item.id });
    }
    const user = await userFor(ctx, req.headers.get("authorization"));
    const write = async () => {
      if (req.method === "GET") return;
      const key = user ? `appw:${ctx.appId}:${ctx.env}:${user.id}` : `appw:${ctx.appId}:${ctx.env}:ip:${ip}`;
      await limit(key, user ? ctx.limits.writesPerMin : Math.max(5, Math.floor(ctx.limits.writesPerMin / 3)), 60);
    };

    /* ── auth ── */
    if (a === "auth") {
      if (!ctx.spec.auth.enabled) return json(404, { error: "This app has no accounts.", code: "no_auth" });
      if (b === "me" && req.method === "GET") return json(200, { user: user ? selfUser(user) : null });
      if (req.method === "POST" && (b === "signup" || b === "signin" || b === "magic")) {
        await limit(`appauth:${ctx.appId}:${ctx.env}:${ip}`, 12, 60);
      }
      if (b === "signup" && req.method === "POST") {
        const r = await signUp(ctx, await readJson(req));
        return json(200, { user: selfUser(r.user), token: r.token });
      }
      if (b === "signin" && req.method === "POST") {
        const r = await signIn(ctx, await readJson(req));
        return json(200, { user: selfUser(r.user), token: r.token });
      }
      if (b === "signout" && req.method === "POST") {
        await signOut(ctx, req.headers.get("authorization"));
        return json(200, { ok: true });
      }
      if (b === "magic" && c === "verify" && req.method === "POST") {
        const r = await redeemMagic(ctx, (await readJson(req)).token);
        return json(200, { user: selfUser(r.user), token: r.token });
      }
      if (b === "magic" && req.method === "POST") {
        const body = await readJson(req);
        const { email, token } = await magicToken(ctx, body.email);
        const link = `${appUrl}#k-magic=${token}`;
        const sent = emailConfigured() ? await sendEmail({ to: email, subject: `Your sign-in link for ${ctx.spec.name}`, text: `Open this link to sign in to ${ctx.spec.name}:\n\n${link}\n\nIt works once and expires in 20 minutes. If you didn't ask for it, ignore this email.`, kind: "app-magic" }).catch(() => false) : false;
        // The draft preview is only seen by its creator: the link is also returned so magic-link sign-in can be tried without email.
        return json(200, { sent, ...(ctx.env !== "live" ? { link } : {}) });
      }
      if (b === "profile" && req.method === "PATCH") {
        if (!user) return json(401, { error: "Sign in first.", code: "sign_in" });
        await write();
        return json(200, { user: selfUser(await updateProfile(ctx, user, await readJson(req))) });
      }
      return json(404, { error: "Unknown auth endpoint." });
    }
    if (a === "users") {
      if (!ctx.spec.auth.enabled) return json(404, { error: "This app has no accounts.", code: "no_auth" });
      if (b) {
        const u = await getPublicUser(ctx, b);
        return u ? json(200, { user: u }) : json(404, { error: "Not found.", code: "not_found" });
      }
      const ids = url.searchParams.get("ids");
      return json(200, { users: await listPublicUsers(ctx, url.searchParams.get("q") ?? "", Number(url.searchParams.get("limit")) || 30, ids ? ids.split(",") : undefined) });
    }

    /* ── data ── */
    if (a === "changes") {
      const cols = (url.searchParams.get("cols") ?? "").split(",").filter(Boolean);
      return json(200, { v: await changeVersion(ctx, user, cols) });
    }
    const dbJson = dbJsonFor(ctx.meta);
    if (a === "db" && b) {
      if (!c) {
        if (req.method === "GET") {
          const expand = expandFields(ctx, b, url.searchParams.get("expand"));
          const r = await listItems(ctx, user, b, { where: qJson(url.searchParams.get("where")), order: url.searchParams.get("order") ?? undefined, limit: url.searchParams.get("limit") ?? undefined, cursor: url.searchParams.get("cursor") ?? undefined, mine: url.searchParams.get("mine") ?? undefined });
          return dbJson(200, expand.length ? { ...r, items: await expandItems(ctx, user, b, r.items, expand) } : r);
        }
        if (req.method === "POST") {
          await write();
          const item = await createItem(ctx, user, b, (await readJson(req)).data ?? undefined);
          keepAlive(recordUsage(ctx, "write"), "app usage");
          return dbJson(201, { item });
        }
      }
      if (c === "_toggle" && req.method === "POST") {
        await write();
        return dbJson(200, await toggleItem(ctx, user, b, (await readJson(req)).match));
      }
      if (c === "_count" && req.method === "GET") return dbJson(200, { count: await countItems(ctx, user, b, qJson(url.searchParams.get("where"))) });
      if (c === "_counts" && req.method === "GET") {
        const field = url.searchParams.get("field") ?? "";
        const values = (url.searchParams.get("values") ?? "").split(",").filter(Boolean);
        return dbJson(200, { counts: await groupCounts(ctx, user, b, field, values, qJson(url.searchParams.get("where"))) });
      }
      if (c && !c.startsWith("_")) {
        if (req.method === "GET") {
          const expand = expandFields(ctx, b, url.searchParams.get("expand"));
          const item = await getItem(ctx, user, b, c);
          if (!item) return dbJson(404, { error: "Not found.", code: "not_found" });
          return dbJson(200, { item: expand.length ? (await expandItems(ctx, user, b, [item], expand))[0] : item });
        }
        if (req.method === "PATCH") {
          await write();
          return dbJson(200, { item: await updateItem(ctx, user, b, c, (await readJson(req)).data ?? undefined) });
        }
        if (req.method === "DELETE") {
          await write();
          return dbJson(200, { ok: await deleteItem(ctx, user, b, c) });
        }
      }
      return dbJson(404, { error: "Unknown data endpoint." });
    }

    /* ── files ── */
    if (a === "files") {
      if (b && req.method === "GET") {
        const f = await getFile(ctx, b);
        if (!f) return json(404, { error: "Not found.", code: "not_found" });
        return new Response(new Uint8Array(f.bytes), { headers: { ...CORS, "content-type": f.mime.startsWith("text/") ? `${f.mime}; charset=utf-8` : f.mime, "content-security-policy": "default-src 'none'; sandbox", "x-content-type-options": "nosniff", "cache-control": "public, max-age=31536000, immutable", "cross-origin-resource-policy": "cross-origin", "content-disposition": `inline; filename="${f.name.replace(/"/g, "")}"` } });
      }
      if (!b && req.method === "POST") {
        await write();
        const len = Number(req.headers.get("content-length") ?? 0);
        if (len > ctx.limits.maxFile + 1024) return json(413, { error: `Files can be up to ${Math.round(ctx.limits.maxFile / 1_000_000)} MB.`, code: "too_large" });
        const bytes = Buffer.from(await req.arrayBuffer());
        const f = await putFile(ctx, user, bytes, decodeURIComponent(req.headers.get("x-file-name") ?? "file"));
        return json(201, { file: { ...f, url: `${url.pathname.replace(/\/files\/?$/, "")}/files/${f.id}` } });
      }
      return json(404, { error: "Unknown file endpoint." });
    }

    /* ── AI ── */
    if (a === "ai" && b && req.method === "POST") {
      const body = await readJson(req);
      if (url.searchParams.get("stream") === "1") {
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(ctl) {
            const send = (o: unknown) => ctl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
            try {
              const r = await runAi(ctx, user, b, body, ip, (d) => send({ d }));
              send({ done: true, text: r.text, json: r.json });
            } catch (e) {
              send({ error: e instanceof DataError ? e.message : "The AI couldn't answer right now.", code: e instanceof DataError ? e.code : "internal" });
            }
            ctl.close();
          },
        });
        return new Response(stream, { headers: { ...CORS, "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
      }
      const r = await runAi(ctx, user, b, body, ip);
      return json(200, r);
    }
    return json(404, { error: "Unknown endpoint." });
  } catch (e) {
    if (e instanceof RateLimitError) return json(429, { error: "Too many requests. Wait a moment and try again.", code: "rate_limited" }, { "retry-after": String(e.retryAfterSec) });
    if (e instanceof AuthError || e instanceof DataError) return json(e.status, { error: e.message, code: e.code });
    console.error("[app-api]", e instanceof Error ? e.message : e);
    return json(500, { error: "Something went wrong. Try again.", code: "internal" });
  }
}

export type { AppUser };
