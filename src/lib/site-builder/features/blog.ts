/**
 * Blog: posts the owner writes in the builder, shown on the site. Posts are records, so an edit is live at once (no republish) and
 * a draft is never served. The body is plain text with a few markers (## heading, - list item, blank line = new paragraph) and is
 * escaped when drawn: a post can never carry markup, script or a URL that runs.
 */
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import type { Site } from "../types";
import { findPlaceholders } from "./placeholders";
import { addRecord, listRecords, records, type FeatureRecord } from "./records";

export const MAX_POSTS = 100;
export const MAX_TITLE = 140;
export const MAX_BODY = 20_000;

export type Blog = { key: string; title: string };
export type Post = { id: string; key: string; title: string; slug: string; body: string; excerpt: string; status: "draft" | "published"; publishedAt: string | null; updatedAt: string };

export function blogsIn(files: Record<string, string>): Blog[] {
  const out = new Map<string, Blog>();
  for (const [file, html] of Object.entries(files)) {
    if (!file.endsWith(".html")) continue;
    for (const p of findPlaceholders(html)) if (p.feature === "blog" && !out.has(p.key)) out.set(p.key, { key: p.key, title: p.attrs.title || "Blog" });
  }
  return [...out.values()];
}

const clean = (v: unknown, n: number) => (typeof v === "string" ? v : "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\r\n?/g, "\n").trim().slice(0, n);
export const slugify = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "post";

export const excerptOf = (body: string) => body.split(/\n{2,}/).map((p) => p.trim()).find((p) => p && !/^(#{2,3} |- )/.test(p))?.replace(/\s+/g, " ").slice(0, 160) ?? "";

const toPost = (r: FeatureRecord): Post => ({ id: r.id, key: r.key, title: r.data.title ?? "", slug: r.data.slug ?? "", body: r.data.body ?? "", excerpt: r.data.excerpt ?? "", status: r.status === "published" ? "published" : "draft", publishedAt: r.data.publishedAt || null, updatedAt: r.data.updatedAt || r.createdAt });

export async function listPosts(site: Pick<Site, "id" | "workspaceId">, key: string, publishedOnly = false): Promise<Post[]> {
  const rows = (await listRecords(site.workspaceId, site.id, "blog", key)).filter((r) => r.status === "published" || r.status === "draft");
  const posts = rows.map(toPost).filter((p) => !publishedOnly || p.status === "published");
  return posts.sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt));
}

export async function publishedPost(site: Pick<Site, "id" | "workspaceId">, key: string, slug: string): Promise<Post | null> {
  return (await listPosts(site, key, true)).find((p) => p.slug === slug) ?? null;
}

function must(files: Record<string, string>, key: string) {
  if (!blogsIn(files).some((b) => b.key === key)) throw new HttpError(404, "That blog isn't on the site (yet). Ask the builder to add it, then try again.", "not_found");
}

export async function createPost(site: Site, files: Record<string, string>, key: string, input: { title?: unknown; body?: unknown; publish?: unknown }): Promise<Post> {
  must(files, key);
  const title = clean(input.title, MAX_TITLE);
  const body = clean(input.body, MAX_BODY);
  if (!title) throw new HttpError(400, "Give the post a title.");
  const all = await listPosts(site, key);
  if (all.length >= MAX_POSTS) throw new HttpError(409, `A blog holds up to ${MAX_POSTS} posts.`, "limit");
  const taken = new Set(all.map((p) => p.slug));
  let slug = slugify(title);
  for (let n = 2; taken.has(slug); n++) slug = `${slugify(title).slice(0, 55)}-${n}`;
  const publish = input.publish === true;
  const t = now();
  const { row } = await addRecord({ id: newId("rec"), workspaceId: site.workspaceId, siteId: site.id, feature: "blog", key, data: { title, slug, body, excerpt: excerptOf(body), publishedAt: publish ? t : "", updatedAt: t }, status: publish ? "published" : "draft" });
  return toPost(row);
}

export async function updatePost(site: Site, files: Record<string, string>, key: string, id: string, input: { title?: unknown; body?: unknown; status?: unknown }): Promise<Post> {
  must(files, key);
  const row = await records().get(site.workspaceId, id);
  if (!row || row.siteId !== site.id || row.feature !== "blog" || row.key !== key || (row.status !== "draft" && row.status !== "published")) throw new HttpError(404, "That post doesn't exist.", "not_found");
  const data = { ...row.data };
  if (input.title !== undefined) {
    data.title = clean(input.title, MAX_TITLE);
    if (!data.title) throw new HttpError(400, "A post needs a title.");
  }
  if (input.body !== undefined) {
    data.body = clean(input.body, MAX_BODY);
    data.excerpt = excerptOf(data.body);
  }
  let status = row.status;
  if (input.status === "published" || input.status === "draft") {
    status = input.status;
    if (status === "published" && !data.publishedAt) data.publishedAt = now();
  }
  data.updatedAt = now();
  const next = await records().update(site.workspaceId, id, { data, status });
  if (!next) throw new HttpError(404, "That post doesn't exist.", "not_found");
  return toPost(next);
}

export async function deletePost(site: Site, key: string, id: string) {
  const row = await records().get(site.workspaceId, id);
  if (!row || row.siteId !== site.id || row.feature !== "blog" || row.key !== key) throw new HttpError(404, "That post doesn't exist.", "not_found");
  await records().remove(site.workspaceId, id);
}

/** First time a blog exists, add the posts it was generated with ("Title;Body text|Title;Body"). Once only, even if the owner deletes them. */
export async function seedBlogs(site: Site, files: Record<string, string>) {
  for (const [file, html] of Object.entries(files)) {
    if (!file.endsWith(".html")) continue;
    for (const p of findPlaceholders(html)) {
      if (p.feature !== "blog" || !p.attrs.seed) continue;
      const { inserted } = await addRecord({ id: `rec_${site.id}_blog_${p.key}_seed`, workspaceId: site.workspaceId, siteId: site.id, feature: "blog", key: p.key, data: {}, status: "marker" });
      if (!inserted) continue;
      const rows = p.attrs.seed.split("|").slice(0, 6);
      for (let i = 0; i < rows.length; i++) {
        const [title = "", ...rest] = rows[i].split(";");
        if (clean(title, MAX_TITLE)) await createPost(site, files, p.key, { title, body: rest.join(";"), publish: true });
      }
    }
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Plain text to safe HTML: paragraphs, ## and ### headings (drawn as h2/h3), "- " lists. Everything is escaped. */
export function renderBody(body: string): string {
  const out: string[] = [];
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split("\n").map((l) => l.trimEnd()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => l.startsWith("- "))) out.push(`<ul>${lines.map((l) => `<li>${esc(l.slice(2))}</li>`).join("")}</ul>`);
    else if (lines.length === 1 && /^### /.test(lines[0])) out.push(`<h3>${esc(lines[0].slice(4))}</h3>`);
    else if (lines.length === 1 && /^## /.test(lines[0])) out.push(`<h2>${esc(lines[0].slice(3))}</h2>`);
    else out.push(`<p>${lines.map(esc).join("<br>")}</p>`);
  }
  return out.join("");
}

export const dateLabel = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso)) : "");
