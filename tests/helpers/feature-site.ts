/** Test helpers: a published site whose pages hold feature placeholders, and the public POST/GET against its routes. */
import assert from "node:assert/strict";
import { addVersion, sites } from "@/lib/site-builder/store";
import { call, jsonReq } from "./session";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const lctx = (slug: string, path?: string[]) => ({ params: Promise.resolve({ slug, path }) });
let ipn = 0;
const ip = () => `172.16.${(++ipn >> 8) & 255}.${ipn & 255}`;

export async function featureSite(cookie: string, workspaceId: string, name: string, pages: Record<string, string>, plan: "free" | "plus" = "free") {
  const sitesRoute = await import("@/app/api/sites/route");
  const res = await sitesRoute.POST(jsonReq(cookie, "/api/sites", "POST", { name, template: "blank" }));
  assert.equal(res.status, 201, await res.clone().text());
  const sum = ((await res.json()) as { site: { id: string; slug: string } }).site;
  const site = (await sites().get(workspaceId, sum.id))!;
  const files: Record<string, string> = {};
  for (const [f, body] of Object.entries(pages)) files[f] = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${name}</title></head><body><main>${body}</main></body></html>`;
  await addVersion({ plan }, site, files, { kind: "edit", summary: "test", prompt: "", model: null, units: 0 });
  const pub = await import("@/app/api/sites/[id]/publish/route");
  const r = await pub.POST(jsonReq(cookie, `/api/sites/${sum.id}/publish`, "POST"), ctx(sum.id));
  assert.equal(r.status, 200, await r.clone().text());
  return { id: sum.id, slug: sum.slug };
}

export async function getPage(slug: string, path?: string[], query = "") {
  const route = await import("@/app/s/[slug]/[[...path]]/route");
  return route.GET(call(null, `/s/${slug}${path ? `/${path.join("/")}` : ""}${query}`), lctx(slug, path));
}

export async function postFeature(slug: string, feature: string, fields: Record<string, string>, opts: { ip?: string } = {}) {
  const route = await import("@/app/s/[slug]/[[...path]]/route");
  const body = new URLSearchParams(fields).toString();
  return route.POST(call(null, `/s/${slug}/_f/${feature}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": opts.ip ?? ip() }, body }), lctx(slug, ["_f", feature]));
}

/** Reads the hidden inputs the server put in a rendered form (id, page, signed token). */
export function hidden(html: string, name: string): string {
  const m = html.match(new RegExp(`name="${name}" value="([^"]*)"`));
  assert.ok(m, `no hidden ${name}`);
  return m![1];
}
