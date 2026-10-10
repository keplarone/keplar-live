/**
 * Template gallery: storage and flows. See docs/growth/TEMPLATES.md.
 *
 * Two kinds of entry:
 *  - "starter": Keplar's own starter sites from src/lib/site-builder/templates.ts. They are produced by code, not by the AI
 *    generator, and the gallery says so. They are not stored; they are rebuilt on demand.
 *  - "community": a snapshot of a site whose owner opted in (verified email, explicit consent, nothing private detected). The
 *    snapshot is its own row, so later edits to the site are not published until the owner shares again, and deleting the site
 *    or the account removes it.
 */
import { randomBytes } from "node:crypto";
import { EntitlementError } from "@/lib/create/platform/plans";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { collection } from "@/lib/create/platform/store";
import type { Workspace } from "@/lib/create/platform/workspace";
import { moderateText } from "@/lib/create/platform/moderation";
import { slugify } from "@/lib/growth/share-public";
import { site as brand } from "@/lib/site";
import { addVersion, bytesOf, createSite, FilesError, headFiles, isDeleted, normalizeFiles, sites } from "@/lib/site-builder/store";
import { scanFiles } from "@/lib/site-builder/safety";
import { buildTemplate, TEMPLATES, type TemplateId } from "@/lib/site-builder/templates";
import type { Site, SiteDesign } from "@/lib/site-builder/types";
import type { SiteFx } from "@/lib/site-builder/fx/types";
import { addCredit, CATEGORY_LABEL, cleanText, findPrivate, remixBrief, scrubForRemix, STARTER_PREFIX, TEMPLATE_CATEGORIES, TEMPLATE_LIMITS, TEMPLATE_TEXT, validCommunitySlug, type TemplateCategory } from "./remix";

export type TemplateStatus = "live" | "pending" | "hidden";

export type TemplateRow = {
  id: string;
  /** Owner. Never shown publicly. */
  workspaceId: string;
  slug: string;
  title: string;
  description: string;
  category: TemplateCategory;
  sourceSiteId: string;
  files: Record<string, string>;
  design?: SiteDesign;
  fx?: SiteFx;
  brief?: Site["brief"];
  /** Name the owner chose to show next to the template. Null = no name shown. */
  credit: string | null;
  status: TemplateStatus;
  remixes: number;
  /** Community likes (one per signed-in workspace). */
  likes?: number;
  pages: number;
  bytes: number;
  createdAt: string;
  updatedAt: string;
};

export const templates = () => collection<TemplateRow>("sb_templates");

/** What the gallery pages and API show. No owner id, no files. */
export type GalleryTemplate = { slug: string; kind: "starter" | "community"; title: string; description: string; category: TemplateCategory; pages: string[]; remixes: number; likes: number; credit: string | null; publishedAt: string | null; accent: string | null };

const STARTERS = TEMPLATES.filter((t) => t.id !== "blank");
const starterId = (slug: string) => (slug.startsWith(STARTER_PREFIX) ? (STARTERS.find((t) => t.id === slug.slice(STARTER_PREFIX.length))?.id ?? null) : null);
const STARTER_CATEGORY: Record<string, TemplateCategory> = { business: "business", portfolio: "portfolio", landing: "landing", restaurant: "restaurant" };

const starterView = (t: (typeof STARTERS)[number]): GalleryTemplate => ({ slug: `${STARTER_PREFIX}${t.id}`, kind: "starter", title: t.name, description: t.description, category: STARTER_CATEGORY[t.id] ?? "other", pages: t.pages, remixes: 0, likes: 0, credit: null, publishedAt: null, accent: t.accent });
const pagesOf = (files: Record<string, string>) => Object.keys(files).filter((f) => f.endsWith(".html") && f !== "404.html").sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
const communityView = (r: TemplateRow): GalleryTemplate => ({ slug: r.slug, kind: "community", title: r.title, description: r.description, category: r.category, pages: pagesOf(r.files).map((f) => (f === "index.html" ? "Home" : f.slice(0, -5).replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase()))), remixes: r.remixes, likes: r.likes ?? 0, credit: r.credit, publishedAt: r.createdAt, accent: null });

/** A community template is shown only while it is live and its source site still exists. */
async function sourceAlive(r: TemplateRow): Promise<boolean> {
  const s = await sites().get(r.workspaceId, r.sourceSiteId).catch(() => null);
  return Boolean(s) && !isDeleted(s as Site) && !(s as Site).takenDown;
}

export async function listGallery(): Promise<GalleryTemplate[]> {
  const rows = (await templates().listSystem((r) => r.status === "live").catch(() => [])).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const live: TemplateRow[] = [];
  for (const r of rows) if (await sourceAlive(r)) live.push(r);
  return [...STARTERS.map(starterView), ...live.map(communityView)];
}

export type Opened = { view: GalleryTemplate; files: Record<string, string>; row: TemplateRow | null };

/** Looks up a template that may be shown publicly right now. */
export async function openTemplate(slug: string): Promise<Opened | null> {
  const sid = starterId(slug);
  if (sid) {
    const t = STARTERS.find((x) => x.id === sid)!;
    return { view: starterView(t), files: buildTemplate(sid as TemplateId, "Your site name"), row: null };
  }
  if (!validCommunitySlug(slug)) return null;
  const row = await templates().findSystemBy("slug", slug).catch(() => null);
  if (!row || row.status !== "live" || !(await sourceAlive(row))) return null;
  return { view: communityView(row), files: row.files, row };
}

export async function myTemplates(ws: Pick<Workspace, "id">): Promise<(GalleryTemplate & { status: TemplateStatus; sourceSiteId: string })[]> {
  return (await templates().list(ws.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => ({ ...communityView(r), status: r.status, sourceSiteId: r.sourceSiteId }));
}

export type ShareInput = { siteId: string; title: unknown; description: unknown; category: unknown; credit?: unknown };

export async function shareAsTemplate(ws: Workspace, input: ShareInput): Promise<{ row: TemplateRow }> {
  if (!ws.verified) throw new HttpError(403, "Verify your email address before sharing a template.", "unverified");
  const mine = await templates().list(ws.id);
  const source = await sites().get(ws.id, input.siteId);
  if (!source || isDeleted(source)) throw new HttpError(404, "Site not found.", "not_found");
  if (source.takenDown) throw new HttpError(451, "This site was taken down and can't be shared.", "taken_down");
  if (mine.some((m) => m.sourceSiteId === source.id)) throw new HttpError(409, "This site is already shared as a template. Withdraw it first to share a newer version.", "already_shared");
  const limit = TEMPLATE_LIMITS[ws.plan];
  if (mine.length >= limit.shared) throw new EntitlementError(`Your plan can list ${limit.shared} template${limit.shared === 1 ? "" : "s"} at a time. Withdraw one${ws.plan === "free" ? " or upgrade" : ""} to share another.`, ws.plan === "free" ? "plus" : "pro");
  const title = cleanText(input.title, TEMPLATE_TEXT.title.max);
  const description = cleanText(input.description, TEMPLATE_TEXT.description.max);
  const category = (TEMPLATE_CATEGORIES as readonly string[]).includes(String(input.category)) ? (input.category as TemplateCategory) : null;
  if (title.length < TEMPLATE_TEXT.title.min) throw new HttpError(400, `Give the template a title of at least ${TEMPLATE_TEXT.title.min} characters.`, "invalid");
  if (description.length < TEMPLATE_TEXT.description.min) throw new HttpError(400, `Describe the template in at least ${TEMPLATE_TEXT.description.min} characters, so visitors know what they get.`, "invalid");
  if (!category) throw new HttpError(400, "Choose a category.", "invalid");
  const credit = cleanText(input.credit, TEMPLATE_TEXT.credit.max) || null;

  const raw = await headFiles(source);
  if (!raw["index.html"]) throw new HttpError(400, "Build something first: this site has no pages yet.", "empty");
  let files: Record<string, string>;
  try { files = normalizeFiles(raw, ws.plan).files; } catch (e) { throw new HttpError(422, e instanceof FilesError ? e.message : "This site can't be shared.", "invalid"); }
  const found = findPrivate(files, [title, description, credit ?? ""]);
  if (found.length) throw new HttpError(422, `This site appears to contain ${found.join(", ")}. Remove it, then share again. Templates are copied by other people.`, "personal_data", { found });
  const mod = await moderateText(`${title}\n${description}`);
  if (!mod.allowed) throw new HttpError(422, mod.reason ?? "That title or description isn't allowed under the content policy.", "blocked");
  const scan = await scanFiles(files);
  if (scan.verdict === "block") throw new HttpError(422, "This site can't be shared: it breaks the rules for what Keplar sites may contain.", "blocked", { findings: scan.findings });

  const at = now();
  const slug = `${slugify(title)}-${randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 6)}`;
  const row: TemplateRow = {
    id: newId("tpl"),
    workspaceId: ws.id,
    slug,
    title,
    description,
    category,
    sourceSiteId: source.id,
    files: scrubForRemix(files),
    design: source.design,
    fx: source.fx,
    brief: remixBrief(source.brief, { name: title, title, description }),
    credit,
    status: scan.verdict === "review" ? "pending" : "live", // "review" waits for a person; nothing flagged goes straight up
    remixes: 0,
    pages: pagesOf(files).length,
    bytes: bytesOf(files),
    createdAt: at,
    updatedAt: at,
  };
  await templates().insert(row);
  return { row };
}

export async function withdrawTemplate(ws: Pick<Workspace, "id">, slug: string): Promise<boolean> {
  const r = await templates().findSystemBy("slug", slug).catch(() => null);
  if (!r || r.workspaceId !== ws.id) return false;
  return templates().remove(ws.id, r.id).then(() => true);
}

/** Admin moderation. A hidden template returns 404 on every public surface at once; the owner still sees it (as hidden) and can withdraw it. */
export async function setTemplateStatus(slug: string, status: TemplateStatus): Promise<boolean> {
  const r = await templates().findSystemBy("slug", slug).catch(() => null);
  if (!r) return false;
  await templates().update(r.workspaceId, r.id, { status, updatedAt: now() });
  return true;
}

export async function listForAdmin(limit = 200): Promise<TemplateRow[]> {
  return (await templates().listSystem()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** Called when the source site is purged for good. */
export async function removeTemplatesOfSite(workspaceId: string, siteId: string): Promise<number> {
  const rows = await templates().list(workspaceId, (r) => r.sourceSiteId === siteId);
  for (const r of rows) await templates().remove(workspaceId, r.id);
  return rows.length;
}

export type RemixInput = { name?: unknown; credit?: unknown };

/** Copies a template into the caller's workspace as a new draft. Never reads the source site, its leads, records, orders or members. */
export async function remixTemplate(ws: Workspace, slug: string, input: RemixInput): Promise<{ site: Site; title: string; credited: boolean }> {
  if (ws.anonymous || !ws.userId) throw new HttpError(401, "Sign in to remix a template.", "unauthenticated");
  const opened = await openTemplate(slug);
  if (!opened) throw new HttpError(404, "This template isn't available.", "not_found");
  const perDay = TEMPLATE_LIMITS[ws.plan].remixesPerDay;
  await rateLimit(`remix:${ws.id}`, perDay, 86_400, { shared: true }).catch((e) => { if (!(e instanceof RateLimitError)) throw e; throw new HttpError(429, `Your plan includes ${perDay} remixes a day. Try again tomorrow${ws.plan === "free" ? " or upgrade for more" : ""}.`, "remix_limit"); });
  const { view, files: srcFiles, row } = opened;
  const name = cleanText(input.name, 60) || view.title;
  const credited = input.credit === true;
  let files = scrubForRemix(srcFiles);
  if (credited) files = addCredit(files, { title: view.title, by: view.credit, url: `${brand.url}/templates/${view.slug}` });
  let norm: Record<string, string>;
  try { norm = normalizeFiles(files, ws.plan).files; } catch (e) { throw new HttpError(422, e instanceof FilesError ? e.message : "This template can't be copied.", "invalid"); }
  const created = await createSite(ws, { name }); // enforces the plan's site limit
  const patch: Partial<Site> = { design: row?.design, fx: row?.fx, seo: { ...created.seo, title: name }, remixedFrom: { slug: view.slug, title: view.title, credited } };
  if (row?.brief) patch.brief = remixBrief(row.brief, { name, title: view.title, description: view.description });
  const base = (await sites().update(ws.id, created.id, patch)) ?? created;
  const msg = `Remixed from the “${view.title}” template. Tell me what to change: your name, words, colors, photos, pages.`;
  const { site } = await addVersion(ws, base, norm, { kind: "template", summary: `Remixed from “${view.title}”.`, prompt: "", model: null, units: 0 }, [{ id: newId("msg"), role: "system", text: msg, at: now() }]);
  if (row) await templates().increment(row.workspaceId, row.id, { remixes: 1 }, row).catch(() => undefined);
  return { site, title: view.title, credited };
}

export { CATEGORY_LABEL };

/** One like per workspace per community template (stored in the liker's workspace). */
type LikeRow = { id: string; workspaceId: string; slug: string; createdAt: string };
const likes = () => collection<LikeRow>("sb_template_likes");

/** Toggle a like. Starters cannot be liked (they are Keplar's own). Returns the new count and whether this workspace likes it. */
export async function toggleTemplateLike(ws: Pick<Workspace, "id">, slug: string): Promise<{ likes: number; liked: boolean }> {
  if (!validCommunitySlug(slug)) throw new HttpError(400, "Only community templates can be liked.", "bad_request");
  const row = await templates().findSystemBy("slug", slug).catch(() => null);
  if (!row || row.status !== "live") throw new HttpError(404, "Template not available.", "not_found");
  const id = `like_${slug}`;
  const prev = await likes().get(ws.id, id);
  if (prev) {
    await likes().remove(ws.id, id);
    const next = await templates().increment(row.workspaceId, row.id, { likes: -1 }, row);
    return { likes: Math.max(0, next.likes ?? 0), liked: false };
  }
  await likes().insert({ id, workspaceId: ws.id, slug, createdAt: now() });
  const next = await templates().increment(row.workspaceId, row.id, { likes: 1 }, row);
  return { likes: Math.max(0, next.likes ?? 0), liked: true };
}

export async function likedByMe(ws: Pick<Workspace, "id">, slug: string): Promise<boolean> {
  return Boolean(await likes().get(ws.id, `like_${slug}`).catch(() => null));
}
