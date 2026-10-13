/**
 * `expand` for list/get: fills reference fields with the records they point at, on the server, so generated apps no longer
 * hand-roll joins (a frequent source of broken screens). Each expanded record is read through the same access rules as a
 * direct read of its own collection; whatever the caller may not see (or that no longer exists) comes back as null.
 * Results land on `item._expand[field]`, leaving the stored id in `item[field]` untouched.
 */
import type { AppCtx } from "./context";
import { listPublicUsers, type AppUser } from "./auth";
import { collectionFor, DataError, listItems, type Item } from "./data";

export const MAX_EXPAND = 3;

/** Parses `expand` from a query string value ("author,team") or an array; unknown or non-ref fields are a 400 (a typo should be loud). */
export function expandFields(ctx: AppCtx, collection: string, raw: unknown): string[] {
  const list = (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []).map((x) => String(x).trim()).filter(Boolean);
  if (!list.length) return [];
  if (list.length > MAX_EXPAND) throw new DataError(`expand takes up to ${MAX_EXPAND} fields.`);
  const c = collectionFor(ctx, collection);
  for (const f of list) {
    const spec = c.fields.find((x) => x.name === f);
    if (!spec || spec.type !== "ref" || !spec.ref) throw new DataError(`"${f}" is not a reference field of ${c.label.toLowerCase()}, so it can't be expanded.`);
  }
  return [...new Set(list)];
}

export async function expandItems(ctx: AppCtx, user: AppUser | null, collection: string, items: Item[], fields: string[]): Promise<Item[]> {
  if (!fields.length || !items.length) return items;
  const c = collectionFor(ctx, collection);
  const out = items.map((it) => ({ ...it, _expand: {} as Record<string, unknown> }) as Item & { _expand: Record<string, unknown> });
  for (const f of fields) {
    const target = c.fields.find((x) => x.name === f)!.ref!;
    const ids = [...new Set(items.map((it) => it[f]).filter((v): v is string => typeof v === "string" && v.length > 0))].slice(0, 100);
    const found = new Map<string, unknown>();
    if (ids.length) {
      if (target === "users") {
        if (ctx.spec.auth.enabled) for (const u of await listPublicUsers(ctx, "", 100, ids)) found.set(u.id, u);
      } else {
        try {
          const r = await listItems(ctx, user, target, { where: { id: { in: ids } }, limit: 100 });
          for (const it of r.items) found.set(it.id, it);
        } catch (e) {
          if (!(e instanceof DataError)) throw e; // no read access to the target: every reference stays null
        }
      }
    }
    for (const it of out) it._expand[f] = typeof it[f] === "string" ? found.get(it[f] as string) ?? null : null;
  }
  return out;
}
