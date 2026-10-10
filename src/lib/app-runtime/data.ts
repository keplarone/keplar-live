/**
 * Collections for generated apps: CRUD, filters, counts, toggles and a cheap change version for realtime.
 * Every statement is scoped by (app_id, env) from the server context, field names are checked against an identifier pattern
 * before they reach SQL (values are always bound parameters), and access rules come from the validated spec.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Access, CollectionSpec, FieldSpec } from "@/lib/app-builder/types";
import { appSql, ensureAppSchema } from "./db";
import type { AppCtx } from "./context";
import type { AppUser } from "./auth";

export class DataError extends Error {
  constructor(message: string, public status = 400, public code = "data") {
    super(message);
  }
}

const IDENT = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
const SERVER_KEYS = new Set(["id", "_owner", "_ownerName", "_ownerAvatar", "createdAt", "updatedAt"]);
const ID_RE = /^r_[\w-]{6,24}$/;
const newId = () => `r_${randomBytes(9).toString("base64url")}`;

export type Item = Record<string, unknown> & { id: string; _owner: string | null; createdAt: string; updatedAt: string };

export function collectionFor(ctx: AppCtx, name: string): CollectionSpec {
  const c = ctx.spec.collections.find((x) => x.name === name);
  if (!c) throw new DataError(`There is no collection called "${String(name).slice(0, 40)}" in this app.`, 404, "no_collection");
  return c;
}

const isAdmin = (u: AppUser | null) => u?.role === "admin";
function allowed(level: Access, user: AppUser | null): boolean {
  if (isAdmin(user)) return level !== "none";
  switch (level) {
    case "public": return true;
    case "auth":
    case "owner": return Boolean(user);
    case "admin":
    case "none": return false;
  }
}
function deny(level: Access, user: AppUser | null, what: string): never {
  if (!user && (level === "auth" || level === "owner")) throw new DataError(`Sign in to ${what}.`, 401, "sign_in");
  throw new DataError(`You don't have permission to ${what}.`, 403, "forbidden");
}

/* ── validation ── */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" || typeof v === "boolean" ? String(v).slice(0, max) : null);
function checkValue(f: FieldSpec, v: unknown): unknown {
  if (v === null || v === undefined || v === "") return null;
  switch (f.type) {
    case "text": return str(v, f.max ?? 2000);
    case "longtext": return str(v, f.max ?? 20_000);
    case "email": {
      const s = str(v, 254)?.trim() ?? "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new DataError(`${f.label ?? f.name} must be an email address.`);
      return s;
    }
    case "url":
    case "image":
    case "file": {
      const s = str(v, 2000)?.trim() ?? "";
      if (f.type === "image" && /^keplar-image:[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(s)) return s; // a generated image slot (seed content)
      if (!/^(https:\/\/|http:\/\/localhost|\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(s)) throw new DataError(`${f.label ?? f.name} must be a link.`);
      if (s.startsWith("data:") && s.length > 200_000) throw new DataError(`${f.label ?? f.name} is too large; upload the file instead.`);
      return s;
    }
    case "number": {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) throw new DataError(`${f.label ?? f.name} must be a number.`);
      if (f.max !== undefined && Math.abs(n) > f.max) throw new DataError(`${f.label ?? f.name} is too large.`);
      return n;
    }
    case "boolean": return v === true || v === "true" || v === 1;
    case "date": {
      const s = str(v, 30) ?? "";
      if (!/^\d{4}-\d{2}-\d{2}/.test(s)) throw new DataError(`${f.label ?? f.name} must be a date (YYYY-MM-DD).`);
      return s.slice(0, 10);
    }
    case "datetime": {
      const s = str(v, 40) ?? "";
      if (Number.isNaN(Date.parse(s))) throw new DataError(`${f.label ?? f.name} must be a date and time.`);
      return s;
    }
    case "ref": {
      const s = str(v, 40) ?? "";
      if (!/^[ru]_[\w-]{4,30}$|^[\w-]{1,40}$/.test(s)) throw new DataError(`${f.label ?? f.name} must be an id.`);
      return s;
    }
    case "select": {
      const s = str(v, 60) ?? "";
      if (f.options?.length && !f.options.includes(s)) throw new DataError(`${f.label ?? f.name} must be one of: ${f.options.join(", ")}.`);
      return s;
    }
    case "tags": return (Array.isArray(v) ? v : String(v).split(",")).map((x) => str(x, 60)?.trim()).filter(Boolean).slice(0, 30);
    case "json": return v;
  }
}

/** Known fields are type-checked; extra keys are kept when they are plain values (the app may store more than the spec named). */
function cleanData(c: CollectionSpec, input: unknown, maxBytes: number, creating: boolean): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DataError("Send the record as an object.");
  const out: Record<string, unknown> = {};
  const fields = new Map(c.fields.map((f) => [f.name, f]));
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SERVER_KEYS.has(k) || !IDENT.test(k)) continue;
    const f = fields.get(k);
    if (f) out[k] = checkValue(f, v);
    else if (v === null || ["string", "number", "boolean"].includes(typeof v) || Array.isArray(v) || typeof v === "object") out[k] = typeof v === "string" ? v.slice(0, 20_000) : v;
    if (Object.keys(out).length > 60) break;
  }
  if (creating) for (const f of c.fields) if (f.required && (out[f.name] === null || out[f.name] === undefined || out[f.name] === "")) throw new DataError(`${f.label ?? f.name} is required.`);
  const size = Buffer.byteLength(JSON.stringify(out));
  if (size > maxBytes) throw new DataError(`This record is too large (${Math.round(size / 1024)} KB; the limit is ${Math.round(maxBytes / 1024)} KB).`, 413);
  return out;
}

/* ── filters ── */

type Built = { sql: string[]; params: unknown[] };
const colOf = (k: string) => (k === "createdAt" ? "created_at" : k === "updatedAt" ? "updated_at" : null);

function addWhere(b: Built, where: unknown) {
  if (!where || typeof where !== "object") return;
  let n = 0;
  for (const [k, cond] of Object.entries(where as Record<string, unknown>)) {
    if (++n > 8) break;
    if (k !== "_owner" && k !== "id" && !IDENT.test(k)) continue;
    const add = (v: unknown) => `$${b.params.push(v)}`;
    const col = colOf(k);
    const lhsText = k === "_owner" ? "owner_id" : k === "id" ? "id" : col ? `${col}::text` : `data->>'${k}'`;
    if (cond === null) {
      b.sql.push(k === "_owner" ? "owner_id IS NULL" : `(data->'${k}' IS NULL OR data->'${k}' = 'null'::jsonb)`);
    } else if (typeof cond !== "object" || Array.isArray(cond)) {
      if (k === "_owner" || k === "id" || col) {
        b.sql.push(`${lhsText} = ${add(String(cond))}`);
      } else {
        b.sql.push(`data @> ${add(JSON.stringify({ [k]: cond }))}::jsonb`);
      }
    } else {
      const o = cond as Record<string, unknown>;
      if (Array.isArray(o.in)) {
        b.sql.push(`${lhsText} = ANY(${add(o.in.slice(0, 200).map((x) => String(x)))}::text[])`);
      }
      if (o.ne !== undefined) {
        b.sql.push(`${lhsText} IS DISTINCT FROM ${add(String(o.ne))}`);
      }
      if (typeof o.contains === "string" && o.contains) {
        b.sql.push(`${lhsText} ILIKE ${add(`%${o.contains.replace(/[%_\\]/g, "").slice(0, 80)}%`)}`);
      }
      if (o.has !== undefined) {
        b.sql.push(`data @> ${add(JSON.stringify({ [k]: [o.has] }))}::jsonb`);
      }
      for (const [op, sym] of [["gt", ">"], ["gte", ">="], ["lt", "<"], ["lte", "<="]] as const) {
        const v = o[op];
        if (v === undefined) continue;
        if (typeof v === "number") {
          const ph = add(v);
          b.sql.push(col ? `extract(epoch from ${col}) * 1000 ${sym} ${ph}` : `(CASE WHEN jsonb_typeof(data->'${k}') = 'number' THEN (data->>'${k}')::double precision END) ${sym} ${ph}`);
        } else {
          const ph = add(String(v));
          b.sql.push(col ? `${col} ${sym} ${ph}::timestamptz` : `data->>'${k}' ${sym} ${ph}`);
        }
      }
    }
  }
}

function baseQuery(ctx: AppCtx, c: CollectionSpec, user: AppUser | null, where: unknown, mine: boolean): Built {
  const b: Built = { sql: ["app_id = $1", "env = $2", "col = $3"], params: [ctx.appId, ctx.env, c.name] };
  const ownerOnly = (c.read === "owner" && !isAdmin(user)) || mine;
  if (ownerOnly) {
    if (!user) throw new DataError("Sign in to see this.", 401, "sign_in");
    b.params.push(user.id);
    b.sql.push(`owner_id = $${b.params.length}`);
  }
  addWhere(b, where);
  return b;
}

function orderBy(order: unknown): string {
  const o = typeof order === "string" ? order : "-createdAt";
  const desc = o.startsWith("-");
  const k = desc ? o.slice(1) : o;
  const col = colOf(k);
  const expr = col ?? (IDENT.test(k) ? `data->'${k}'` : "created_at");
  return `${expr} ${desc ? "DESC" : "ASC"} NULLS LAST, id ${desc ? "DESC" : "ASC"}`;
}

const toItem = (r: Record<string, string | null>): Item => {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(r.data ?? "{}");
  } catch {
    /* corrupt rows are returned empty */
  }
  return { ...data, id: r.id!, _owner: r.owner_id, createdAt: new Date(r.created_at!).toISOString(), updatedAt: new Date(r.updated_at!).toISOString() };
};

/* ── operations ── */

export async function listItems(ctx: AppCtx, user: AppUser | null, name: string, q: { where?: unknown; order?: unknown; limit?: unknown; cursor?: unknown; mine?: unknown }) {
  const c = collectionFor(ctx, name);
  if (!allowed(c.read, user)) deny(c.read, user, `see ${c.label.toLowerCase()}`);
  await ensureAppSchema();
  const b = baseQuery(ctx, c, user, q.where, q.mine === true || q.mine === "true" || q.mine === "1");
  const limit = Math.max(1, Math.min(100, Number(q.limit) || 50));
  const offset = Math.max(0, Math.min(100_000, Number(q.cursor) || 0));
  const rows = await appSql(`SELECT id, owner_id, data, created_at, updated_at FROM app_records WHERE ${b.sql.join(" AND ")} ORDER BY ${orderBy(q.order)} LIMIT ${limit + 1} OFFSET ${offset}`, b.params);
  const more = rows.length > limit;
  return { items: rows.slice(0, limit).map(toItem), next: more ? String(offset + limit) : null };
}

export async function getItem(ctx: AppCtx, user: AppUser | null, name: string, id: string): Promise<Item | null> {
  const c = collectionFor(ctx, name);
  if (!allowed(c.read, user)) deny(c.read, user, `see ${c.label.toLowerCase()}`);
  if (!ID_RE.test(id)) return null;
  await ensureAppSchema();
  const r = (await appSql("SELECT id, owner_id, data, created_at, updated_at FROM app_records WHERE app_id = $1 AND env = $2 AND col = $3 AND id = $4", [ctx.appId, ctx.env, c.name, id]))[0];
  if (!r) return null;
  if (c.read === "owner" && !isAdmin(user) && r.owner_id !== user?.id) return null;
  return toItem(r);
}

function uniqKey(c: CollectionSpec, data: Record<string, unknown>, ownerId: string | null): string | null {
  if (!c.unique?.length) return null;
  const parts = c.unique.map((k) => (k === "_owner" ? ownerId ?? "" : JSON.stringify(data[k] ?? null)));
  return createHash("sha256").update(parts.join("\u0001")).digest("hex").slice(0, 40);
}

async function countAll(ctx: AppCtx) {
  const r = await appSql("SELECT count(*)::int AS n FROM app_records WHERE app_id = $1 AND env = $2", [ctx.appId, ctx.env]);
  return Number(r[0]?.n ?? 0);
}

export async function createItem(ctx: AppCtx, user: AppUser | null, name: string, input: unknown, opts: { ownerId?: string | null; ownerName?: string } = {}): Promise<Item> {
  const c = collectionFor(ctx, name);
  if (opts.ownerId === undefined && !allowed(c.create, user)) deny(c.create, user, `add ${c.label.toLowerCase()}`);
  await ensureAppSchema();
  if ((await countAll(ctx)) >= ctx.limits.records) throw new DataError("This app has reached its storage limit for records.", 403, "limit");
  const data = cleanData(c, input, ctx.limits.recordBytes, true);
  const ownerId = opts.ownerId !== undefined ? opts.ownerId : user?.id ?? null;
  if (user && opts.ownerId === undefined) {
    data._ownerName = user.name;
    if (typeof user.profile.avatar === "string") data._ownerAvatar = user.profile.avatar;
  } else if (opts.ownerName) data._ownerName = opts.ownerName;
  const rows = await appSql(
    "INSERT INTO app_records (app_id, env, col, id, owner_id, data, uniq) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) ON CONFLICT DO NOTHING RETURNING id, owner_id, data, created_at, updated_at",
    [ctx.appId, ctx.env, c.name, newId(), ownerId, JSON.stringify(data), uniqKey(c, data, ownerId)],
  );
  if (!rows[0]) throw new DataError("That already exists.", 409, "duplicate");
  return toItem(rows[0]);
}

async function loadForWrite(ctx: AppCtx, user: AppUser | null, c: CollectionSpec, id: string, level: Access, what: string) {
  if (!allowed(level, user)) deny(level, user, what);
  if (!ID_RE.test(id)) throw new DataError("Not found.", 404, "not_found");
  await ensureAppSchema();
  const r = (await appSql("SELECT id, owner_id, data, created_at, updated_at FROM app_records WHERE app_id = $1 AND env = $2 AND col = $3 AND id = $4", [ctx.appId, ctx.env, c.name, id]))[0];
  if (!r) throw new DataError("Not found.", 404, "not_found");
  if (level === "owner" && !isAdmin(user) && r.owner_id !== user!.id) throw new DataError(`You can only ${what} that you created.`, 403, "forbidden");
  return r;
}

export async function updateItem(ctx: AppCtx, user: AppUser | null, name: string, id: string, patch: unknown): Promise<Item> {
  const c = collectionFor(ctx, name);
  const r = await loadForWrite(ctx, user, c, id, c.update, `change ${c.label.toLowerCase()}`);
  const prev = JSON.parse(r.data ?? "{}") as Record<string, unknown>;
  const next = { ...prev, ...cleanData(c, patch, ctx.limits.recordBytes, false) };
  for (const k of ["_ownerName", "_ownerAvatar"]) if (prev[k] !== undefined) next[k] = prev[k];
  const size = Buffer.byteLength(JSON.stringify(next));
  if (size > ctx.limits.recordBytes) throw new DataError("This record is too large.", 413);
  const rows = await appSql(
    "UPDATE app_records SET data = $5::jsonb, uniq = $6, updated_at = now() WHERE app_id = $1 AND env = $2 AND col = $3 AND id = $4 RETURNING id, owner_id, data, created_at, updated_at",
    [ctx.appId, ctx.env, c.name, id, JSON.stringify(next), uniqKey(c, next, r.owner_id)],
  ).catch((e) => {
    if (/23505/.test(String((e as Error).message)) || (e as { code?: string }).code === "23505") throw new DataError("That already exists.", 409, "duplicate");
    throw e;
  });
  return toItem(rows[0]!);
}

export async function deleteItem(ctx: AppCtx, user: AppUser | null, name: string, id: string): Promise<boolean> {
  const c = collectionFor(ctx, name);
  await loadForWrite(ctx, user, c, id, c.delete, `remove ${c.label.toLowerCase()}`);
  await appSql("DELETE FROM app_records WHERE app_id = $1 AND env = $2 AND col = $3 AND id = $4", [ctx.appId, ctx.env, c.name, id]);
  return true;
}

/**
 * Like/follow/bookmark in one call: if the signed-in user already has a record matching `match`, it is removed; otherwise it is
 * created. Returns the new state.
 */
export async function toggleItem(ctx: AppCtx, user: AppUser | null, name: string, match: unknown): Promise<{ on: boolean; item: Item | null }> {
  const c = collectionFor(ctx, name);
  if (!user) throw new DataError("Sign in first.", 401, "sign_in");
  if (!allowed(c.create, user)) deny(c.create, user, `add ${c.label.toLowerCase()}`);
  const data = cleanData(c, match, ctx.limits.recordBytes, false);
  await ensureAppSchema();
  const b: Built = { sql: ["app_id = $1", "env = $2", "col = $3", "owner_id = $4"], params: [ctx.appId, ctx.env, c.name, user.id] };
  addWhere(b, data);
  const found = (await appSql(`SELECT id FROM app_records WHERE ${b.sql.join(" AND ")} LIMIT 1`, b.params))[0];
  if (found) {
    await appSql("DELETE FROM app_records WHERE app_id = $1 AND env = $2 AND col = $3 AND id = $4", [ctx.appId, ctx.env, c.name, found.id]);
    return { on: false, item: null };
  }
  try {
    return { on: true, item: await createItem(ctx, user, name, data) };
  } catch (e) {
    if (e instanceof DataError && e.code === "duplicate") return { on: true, item: null };
    throw e;
  }
}

export async function countItems(ctx: AppCtx, user: AppUser | null, name: string, where: unknown): Promise<number> {
  const c = collectionFor(ctx, name);
  if (!allowed(c.read, user)) deny(c.read, user, `see ${c.label.toLowerCase()}`);
  await ensureAppSchema();
  const b = baseQuery(ctx, c, user, where, false);
  const r = await appSql(`SELECT count(*)::int AS n FROM app_records WHERE ${b.sql.join(" AND ")}`, b.params);
  return Number(r[0]?.n ?? 0);
}

/** Counts grouped by one field for a list of values (likes per post for a whole feed in one request). */
export async function groupCounts(ctx: AppCtx, user: AppUser | null, name: string, field: string, values: string[], where?: unknown): Promise<Record<string, number>> {
  const c = collectionFor(ctx, name);
  if (!allowed(c.read, user)) deny(c.read, user, `see ${c.label.toLowerCase()}`);
  if (!IDENT.test(field) && field !== "_owner") throw new DataError("Unknown field.");
  await ensureAppSchema();
  const b = baseQuery(ctx, c, user, where, false);
  const expr = field === "_owner" ? "owner_id" : `data->>'${field}'`;
  b.params.push(values.slice(0, 200).map(String));
  const rows = await appSql(`SELECT ${expr} AS k, count(*)::int AS n FROM app_records WHERE ${b.sql.join(" AND ")} AND ${expr} = ANY($${b.params.length}::text[]) GROUP BY 1`, b.params);
  const out: Record<string, number> = Object.fromEntries(values.slice(0, 200).map((v) => [v, 0]));
  for (const r of rows) if (r.k !== null) out[r.k] = Number(r.n ?? 0);
  return out;
}

/** A short string that changes whenever a collection changes (insert, update or delete). Clients poll it for realtime. */
export async function changeVersion(ctx: AppCtx, user: AppUser | null, names: string[]): Promise<Record<string, string>> {
  const cols = names.slice(0, 10).map((n) => collectionFor(ctx, n)).filter((c) => allowed(c.read, user));
  if (!cols.length) return {};
  await ensureAppSchema();
  const rows = await appSql("SELECT col, count(*)::int AS n, max(updated_at) AS m FROM app_records WHERE app_id = $1 AND env = $2 AND col = ANY($3::text[]) GROUP BY col", [ctx.appId, ctx.env, cols.map((c) => c.name)]);
  const out: Record<string, string> = Object.fromEntries(cols.map((c) => [c.name, "0"]));
  for (const r of rows) out[r.col!] = `${r.n}:${r.m ? new Date(r.m).getTime() : 0}`;
  return out;
}

/** Example records for the preview (owner "seed"), replaced on every build. */
/**
 * A seed row as written by the planner, made storable: required image fields it left empty get a generated image slot
 * (resolved on read to the real image, or a placeholder in the app's colours), so example content is never silently dropped.
 */
function seedRow(ctx: AppCtx, c: CollectionSpec, s: unknown, n: number): Record<string, unknown> {
  const row = { ...(s && typeof s === "object" ? (s as Record<string, unknown>) : {}) };
  const slots = ctx.spec.images.map((i) => i.slot);
  for (const f of c.fields) {
    if (f.type !== "image" || (row[f.name] !== undefined && row[f.name] !== "")) continue;
    if (f.required || slots.length) row[f.name] = `keplar-image:${slots.length ? slots[n % slots.length] : `${c.name}_${n}`}`;
  }
  return row;
}

/** Example authors: each seeded _ownerName becomes its own read-only member ("seed_<name>"), so profiles, follows and per-author views work on example content. */
export const SEED_OWNER = /^seed(_[a-z0-9-]{1,40})?$/;
function seedOwner(name: unknown): { ownerId: string; ownerName?: string } {
  const n = typeof name === "string" ? name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) : "";
  const slug = n.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return { ownerId: slug ? `seed_${slug}` : "seed", ownerName: n || undefined };
}

export async function seedDraft(ctx: AppCtx) {
  await ensureAppSchema();
  await appSql("DELETE FROM app_records WHERE app_id = $1 AND env = $2 AND (owner_id = 'seed' OR owner_id LIKE 'seed\\_%')", [ctx.appId, ctx.env]);
  for (const c of ctx.spec.collections) {
    for (const [n, s0] of (c.seed ?? []).entries()) {
      const { _ownerName, ...rest } = seedRow(ctx, c, s0, n);
      try {
        await createItem(ctx, null, c.name, rest, seedOwner(_ownerName));
      } catch {
        /* a seed row that does not validate is skipped */
      }
    }
  }
}

/** On first publish: copy seed rows into live for collections that are still empty there (e.g. a salon's list of services). */
export async function seedLiveIfEmpty(ctx: AppCtx) {
  await ensureAppSchema();
  for (const c of ctx.spec.collections) {
    if (!c.seed?.length) continue;
    const n = await appSql("SELECT 1 FROM app_records WHERE app_id = $1 AND env = $2 AND col = $3 LIMIT 1", [ctx.appId, ctx.env, c.name]);
    if (n.length) continue;
    for (const [n, s0] of c.seed.entries()) {
      const { _ownerName, ...rest } = seedRow(ctx, c, s0, n);
      await createItem(ctx, null, c.name, rest, seedOwner(_ownerName)).catch(() => undefined);
    }
  }
}
