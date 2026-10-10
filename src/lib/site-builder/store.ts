/**
 * Site builder persistence: sites, versions and leads live in the shared store
 * (Neon Postgres in production, JSON files locally). Nothing is written to disk on Vercel.
 */
import { EntitlementError, type PlanId } from "@/lib/create/platform/plans";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now, slugify } from "@/lib/create/platform/ids";
import { collection } from "@/lib/create/platform/store";
import type { Workspace } from "@/lib/create/platform/workspace";
import { BUILDER_LIMITS } from "./limits";
import { canonicalCss, canonicalHtml, MAX_FILE_BYTES } from "./sanitize";
import { scanFiles, type ScanResult } from "./safety";
import { normalizeAppFiles, scanAppCode } from "@/lib/app-builder/files";
import { APP_BUILD_LIMITS } from "@/lib/app-builder/models";
import { appCtx } from "@/lib/app-runtime/context";
import { seedLiveIfEmpty } from "@/lib/app-runtime/data";
import { deleteAppData } from "@/lib/app-runtime/db";
import { buildTemplate, type TemplateId } from "./templates";
import { normalizeBrief, type SiteBrief } from "./brief";
import { suggestDirections } from "./design";
import { DEFAULT_FX, normalizeFx, type SiteFx } from "./fx/types";
import { hasDesignSystem } from "./design-css";
import { ensureFxHooks, restyleFiles } from "./finalize";
import { deleteSiteAssets } from "./product/assets";
import { deleteSiteShots } from "./qa/shots";
import { deleteSiteRecords } from "./features/records";
import { heldByOther, releaseHold } from "./slug-holds";
import type { ChatMsg, Lead, LintSummary, Site, SiteDesign, SiteSeo, SiteVersion, VersionKind } from "./types";

export const sites = () => collection<Site>("sb_sites");
export const versions = () => collection<SiteVersion>("sb_versions");
export const leads = () => collection<Lead>("sb_leads");

export const RESERVED_SLUGS = new Set(["app", "api", "admin", "www", "s", "sites", "site", "_next", "static", "assets", "new", "preview", "draft", "template", "templates", "showcase", "login", "signin", "signup", "account", "pricing", "help", "support", "blog", "docs", "keplar", "mail", "email", "ftp", "status", "report", "abuse", "terms", "privacy", "security"]);
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function validSlug(slug: string): string | null {
  if (!SLUG_RE.test(slug) || slug.includes("--")) return "Use 3–40 letters, numbers and single hyphens.";
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved.";
  return null;
}

/** Soft-deleted sites are gone for every purpose except restoring them. */
export const isDeleted = (s: Pick<Site, "deletedAt">) => Boolean(s.deletedAt);

/** A free address: not reserved, not used by any site (a soft-deleted one still holds its address until it is purged), not held for someone else. */
async function uniqueSlug(base: string, workspaceId: string) {
  let slug = slugify(base, 36);
  if (slug.length < 3) slug = `${slug}-site`;
  let n = 2;
  while (RESERVED_SLUGS.has(slug) || (await sites().findSystemBy("slug", slug)) || (await heldByOther(slug, workspaceId))) slug = `${slugify(base, 32)}-${n++}`;
  return slug;
}

export const PAGE_FILE = /^[a-z0-9][a-z0-9_-]{0,38}\.html$/;
export const CSS_FILE = /^[a-z0-9][a-z0-9_-]{0,38}\.css$/;

export class FilesError extends Error {}

/** Validates and canonicalizes (sanitizes) a file set; throws FilesError with a user-facing message. */
export function normalizeFiles(input: Record<string, string>, plan: PlanId): { files: Record<string, string>; removed: string[] } {
  const L = BUILDER_LIMITS[plan];
  const files: Record<string, string> = {};
  const removed: string[] = [];
  for (const [rawPath, content] of Object.entries(input)) {
    const path = rawPath.trim().replace(/^\.?\//, "").toLowerCase();
    if (typeof content !== "string") continue;
    if (PAGE_FILE.test(path)) {
      if (content.length > MAX_FILE_BYTES * 2) throw new FilesError(`${path} is too large.`);
      const c = canonicalHtml(content);
      files[path] = c.html;
      removed.push(...c.removed);
    } else if (CSS_FILE.test(path)) {
      files[path] = canonicalCss(content);
    } else {
      removed.push(`file ${path.slice(0, 40)} skipped`);
    }
  }
  if (Object.values(files).some((c) => hasDesignSystem(c))) {
    const hooked = ensureFxHooks(files);
    for (const k of Object.keys(files)) files[k] = hooked[k];
  }
  const pages = Object.keys(files).filter((p) => p.endsWith(".html") && p !== "404.html");
  if (!files["index.html"]) throw new FilesError("A site needs an index.html (the home page).");
  if (pages.length > L.pages) throw new FilesError(`Your plan includes up to ${L.pages} pages per site.`);
  const bytes = Object.values(files).reduce((a, c) => a + Buffer.byteLength(c), 0);
  if (bytes > L.siteBytes) throw new FilesError(`This site is ${Math.round(bytes / 1024)} KB; your plan allows up to ${Math.round(L.siteBytes / 1024)} KB.`);
  return { files, removed: [...new Set(removed)] };
}

export const bytesOf = (files: Record<string, string>) => Object.values(files).reduce((a, c) => a + Buffer.byteLength(c), 0);

export const defaultSeo = (name: string): SiteSeo => ({ title: name, description: "", ogImage: "", indexable: false, pages: {} });

export async function listSites(ws: Workspace) {
  return (await sites().list(ws.id, (s) => !isDeleted(s))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createSite(ws: Workspace, input: { name?: string; template?: string }): Promise<Site> {
  const existing = await sites().list(ws.id, (s) => !isDeleted(s));
  if (existing.length >= ws.entitlements.projects) {
    throw new EntitlementError(`Your plan includes ${ws.entitlements.projects} site${ws.entitlements.projects === 1 ? "" : "s"}. Delete one or upgrade for more.`, ws.plan === "free" ? "plus" : "pro");
  }
  const name = (input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60) || "My site";
  const t = now();
  const site: Site = {
    id: newId("sit"),
    workspaceId: ws.id,
    name,
    slug: await uniqueSlug(name, ws.id),
    template: (input.template ?? "") || null,
    headVersion: 0,
    versionCount: 0,
    seo: defaultSeo(name),
    publishedVersion: null,
    publishedAt: null,
    needsReview: false,
    takenDown: false,
    leadCount: 0,
    messages: [],
    createdAt: t,
    updatedAt: t,
  };
  await sites().insert(site);
  await releaseHold(site.slug).catch(() => undefined); // the owner took an address they released earlier
  const tid = (input.template ?? "") as TemplateId;
  if (tid) {
    const { files } = normalizeFiles(buildTemplate(tid, name), ws.plan);
    const v = await addVersion(ws, site, files, { kind: "template", summary: `Started from the ${tid} template.`, prompt: "", model: null, units: 0 });
    return v.site;
  }
  return site;
}

export async function getSite(ws: Workspace, id: string, opts: { includeDeleted?: boolean } = {}): Promise<Site> {
  const s = await sites().get(ws.id, id);
  if (!s || (isDeleted(s) && !opts.includeDeleted)) throw new HttpError(404, "Site not found.", "not_found");
  return s;
}

export async function getVersion(site: Pick<Site, "id" | "workspaceId">, n: number): Promise<SiteVersion | null> {
  return versions().get(site.workspaceId, `${site.id}_v${n}`);
}

export async function headFiles(site: Site): Promise<Record<string, string>> {
  if (!site.headVersion) return {};
  return (await getVersion(site, site.headVersion))?.files ?? {};
}

export async function versionList(site: Site) {
  const rows = (await versions().list(site.workspaceId, (v) => v.siteId === site.id)).sort((a, b) => b.n - a.n);
  return rows.map(({ files, ...meta }) => ({ ...meta, pages: Object.keys(files).filter((f) => f.endsWith(".html")).length }));
}

export async function addVersion(
  ws: Pick<Workspace, "plan">,
  site: Site,
  files: Record<string, string>,
  meta: { kind: VersionKind; summary: string; prompt: string; model: string | null; units: number; lint?: LintSummary },
  chat?: ChatMsg[] | ((n: number) => ChatMsg[]),
): Promise<{ site: Site; version: SiteVersion }> {
  const fresh = (await sites().get(site.workspaceId, site.id)) ?? site;
  if (isDeleted(fresh)) throw new HttpError(404, "Site not found.", "not_found"); // deleted while a build was running: nothing is saved
  const n = fresh.versionCount + 1;
  const version: SiteVersion = { id: `${site.id}_v${n}`, workspaceId: site.workspaceId, siteId: site.id, n, files, summary: meta.summary.slice(0, 600), prompt: meta.prompt.slice(0, 2000), kind: meta.kind, model: meta.model, units: meta.units, bytes: bytesOf(files), createdAt: now(), ...(meta.lint ? { lint: meta.lint } : {}) };
  await versions().insert(version);
  const keep = BUILDER_LIMITS[ws.plan].chatKept;
  const extra = typeof chat === "function" ? chat(n) : (chat ?? []);
  const messages = [...fresh.messages, ...extra].slice(-keep);
  const patch: Partial<Site> = { headVersion: n, versionCount: n, messages, updatedAt: now() };
  const updated = (await sites().update(site.workspaceId, site.id, patch)) ?? { ...fresh, ...patch };
  await pruneVersions(ws.plan, updated);
  return { site: updated, version };
}

async function pruneVersions(plan: PlanId, site: Site) {
  const keep = BUILDER_LIMITS[plan].versionsKept;
  const all = (await versions().list(site.workspaceId, (v) => v.siteId === site.id)).sort((a, b) => b.n - a.n);
  for (const v of all.slice(keep)) {
    if (v.n === site.publishedVersion || v.n === site.headVersion) continue;
    await versions().remove(site.workspaceId, v.id);
  }
}

/**
 * Replace one file in the current version and save that as a new version.
 * The path has to already exist. The same checks a generated version goes through still run.
 */
export async function saveFileEdit(ws: Workspace, site: Site, path: string, content: string) {
  const head = await headFiles(site);
  const key = path.trim().replace(/^\.?\//, "");
  const existing = Object.keys(head).find((k) => k.toLowerCase() === key.toLowerCase());
  if (!existing) throw new HttpError(404, "That file isn't in the current version.", "not_found");
  if (!content.trim()) throw new HttpError(400, "The file is empty.");
  if (content.length > 400_000) throw new HttpError(400, "That file is too large.");
  const next = { ...head, [existing]: content };
  let files: Record<string, string>;
  try {
    const normalized = site.kind === "app"
      ? normalizeAppFiles(next, { maxFiles: APP_BUILD_LIMITS[ws.plan].maxFiles + 14, maxBytes: APP_BUILD_LIMITS[ws.plan].maxBytes })
      : normalizeFiles(next, ws.plan);
    files = normalized.files;
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "That edit didn't pass the file checks.");
  }
  const savedKey = Object.keys(files).find((k) => k.toLowerCase() === existing.toLowerCase());
  if (!savedKey) throw new HttpError(400, "That edit didn't pass the file checks.");
  return addVersion(ws, site, files, { kind: "edit", summary: `Edited ${existing}.`, prompt: `Hand edit of ${existing}`, model: null, units: 0 }, [
    { id: newId("msg"), role: "system", text: `Edited ${existing} by hand.`, at: now() },
  ]);
}

/** Restore (and "undo") = a new version holding an older version's files. Nothing is lost; redo is restoring again. */
export async function restoreVersion(ws: Workspace, site: Site, n: number) {
  const v = await getVersion(site, n);
  if (!v) throw new HttpError(404, "That version isn't available any more.", "not_found");
  const { files } = site.kind === "app" ? normalizeAppFiles(v.files, { maxFiles: APP_BUILD_LIMITS[ws.plan].maxFiles + 14, maxBytes: APP_BUILD_LIMITS[ws.plan].maxBytes }) : normalizeFiles(v.files, ws.plan);
  return addVersion(ws, site, files, { kind: "restore", summary: `Restored version ${n}.`, prompt: "", model: null, units: 0 }, [
    { id: newId("msg"), role: "system", text: `Restored version ${n}.`, at: now() },
  ]);
}

export async function updateSite(ws: Workspace, site: Site, patch: { name?: string; slug?: string; seo?: Partial<SiteSeo>; fx?: Partial<SiteFx>; archived?: boolean; featureSettings?: { notifyOwner?: boolean; confirmVisitors?: boolean; analytics?: boolean } }) {
  const next: Partial<Site> = { updatedAt: now() };
  if (patch.fx !== undefined) next.fx = normalizeFx(patch.fx, site.fx ?? DEFAULT_FX);
  if (patch.featureSettings !== undefined) next.featureSettings = { ...site.featureSettings, ...(patch.featureSettings.notifyOwner !== undefined ? { notifyOwner: Boolean(patch.featureSettings.notifyOwner) } : {}), ...(patch.featureSettings.confirmVisitors !== undefined ? { confirmVisitors: Boolean(patch.featureSettings.confirmVisitors) } : {}), ...(patch.featureSettings.analytics !== undefined ? { analytics: Boolean(patch.featureSettings.analytics) } : {}) };
  if (patch.archived !== undefined) {
    if (patch.archived && site.publishedVersion !== null) throw new HttpError(409, "Unpublish the site before archiving it.", "conflict");
    next.archived = Boolean(patch.archived);
  }
  if (patch.name !== undefined) next.name = patch.name.trim().replace(/\s+/g, " ").slice(0, 60) || site.name;
  if (patch.slug !== undefined && patch.slug !== site.slug) {
    if (site.publishedVersion !== null) throw new HttpError(409, "Unpublish the site before changing its address.", "conflict");
    const bad = validSlug(patch.slug);
    if (bad) throw new HttpError(400, bad);
    const clash = await sites().findSystemBy("slug", patch.slug);
    if (!clash && (await heldByOther(patch.slug, ws.id))) throw new HttpError(409, "That address was recently released by someone else and is reserved for now.", "conflict");
    if (clash && clash.id !== site.id) throw new HttpError(409, "That address is taken.", "conflict");
    next.slug = patch.slug;
  }
  if (patch.seo) {
    const s = patch.seo;
    const seo: SiteSeo = { ...site.seo };
    if (s.title !== undefined) seo.title = String(s.title).slice(0, 120);
    if (s.description !== undefined) seo.description = String(s.description).slice(0, 300);
    if (s.ogImage !== undefined) {
      const u = String(s.ogImage).trim();
      if (u && !/^https:\/\/[^\s"'<>]{4,500}$/.test(u)) throw new HttpError(400, "The preview image must be an https:// link.");
      seo.ogImage = u;
    }
    if (s.indexable !== undefined) seo.indexable = Boolean(s.indexable);
    if (s.pages) {
      seo.pages = {};
      for (const [p, v] of Object.entries(s.pages).slice(0, 40)) {
        if (!PAGE_FILE.test(p)) continue;
        seo.pages[p] = { title: v.title ? String(v.title).slice(0, 120) : undefined, description: v.description ? String(v.description).slice(0, 300) : undefined };
      }
    }
    next.seo = seo;
  }
  return (await sites().update(ws.id, site.id, next)) ?? site;
}

/** Fx defaults that follow the brief's motion choice. */
export function fxFromMotion(motion: SiteBrief["motion"], prev?: SiteFx): SiteFx {
  if (motion === "none") return { ...(prev ?? DEFAULT_FX), enabled: false };
  return { effect: prev?.effect ?? "auto", enabled: true, intensity: motion === "expressive" ? 80 : 50 };
}

/** Stores the approved brief, and the design + effects settings that follow from it. */
export async function saveBrief(ws: Workspace, site: Site, input: unknown): Promise<Site> {
  const brief = normalizeBrief(input, site.brief);
  const design: SiteDesign = { direction: brief.direction, accent: brief.accent, mode: brief.mode, ...(brief.recipe ? { fontDisplay: brief.recipe.fontDisplay } : {}) };
  const next: Partial<Site> = { brief, design, fx: fxFromMotion(brief.motion, site.fx), updatedAt: now() };
  if (!site.headVersion && brief.name && brief.name !== site.name) next.name = brief.name.slice(0, 60);
  return (await sites().update(ws.id, site.id, next)) ?? { ...site, ...next };
}

/** Switches the style direction / accent / mode without a model call: rewrites the design layer into a new version. */
export async function setDesign(ws: Workspace, site: Site, patch: Partial<SiteDesign>) {
  const cur: SiteDesign = site.design ?? { direction: suggestDirections(site.brief?.kind ?? "other")[0].id, accent: null, mode: "auto" };
  const design: SiteDesign = { direction: patch.direction ?? cur.direction, accent: patch.accent === undefined ? cur.accent : patch.accent, mode: patch.mode ?? cur.mode, ...(cur.fontDisplay ? { fontDisplay: cur.fontDisplay } : {}) };
  const files = await headFiles(site);
  const upd = await sites().update(ws.id, site.id, { design, brief: site.brief ? { ...site.brief, direction: design.direction, accent: design.accent, mode: design.mode } : undefined, updatedAt: now() });
  const base = upd ?? { ...site, design };
  if (!Object.keys(files).length) return { site: base, version: null };
  const { files: norm } = normalizeFiles(restyleFiles(files, design), ws.plan);
  return addVersion(ws, base, norm, { kind: "edit", summary: `Changed the style to ${design.direction}.`, prompt: "", model: null, units: 0 }, [{ id: newId("msg"), role: "system", text: `Style changed to ${design.direction}.`, at: now() }]);
}

/** A copy of a site (head version only) as a new draft. Counts toward the plan's site limit. */
export async function duplicateSite(ws: Workspace, site: Site): Promise<Site> {
  const files = await headFiles(site);
  const copy = await createSite(ws, { name: `${site.name} copy`.slice(0, 60) });
  const patch: Partial<Site> = { brief: site.brief, design: site.design, fx: site.fx, seo: { ...site.seo, title: copy.name }, duplicatedFrom: site.id, ...(site.kind === "app" && site.app ? { kind: "app" as const, app: { ...site.app, live: null, seededVersion: undefined } } : {}) };
  const base = (await sites().update(ws.id, copy.id, patch)) ?? copy;
  if (!Object.keys(files).length) return base;
  const { files: norm } = site.kind === "app" ? normalizeAppFiles(files, { maxFiles: APP_BUILD_LIMITS[ws.plan].maxFiles + 14, maxBytes: APP_BUILD_LIMITS[ws.plan].maxBytes }) : normalizeFiles(files, ws.plan);
  return (await addVersion(ws, base, norm, { kind: "edit", summary: `Copied from “${site.name}”.`, prompt: "", model: null, units: 0 }, [{ id: newId("msg"), role: "system", text: `Copied from “${site.name}”.`, at: now() }])).site;
}

/** Branch: a new draft from ANY saved version (not only head). Version history on the source is untouched. */
export async function branchFromVersion(ws: Workspace, site: Site, n: number): Promise<Site> {
  const v = await getVersion(site, n);
  if (!v) throw new HttpError(404, "That version isn't available any more.", "not_found");
  const copy = await createSite(ws, { name: `${site.name} · branch v${n}`.slice(0, 60) });
  const patch: Partial<Site> = { brief: site.brief, design: site.design, fx: site.fx, seo: { ...site.seo, title: copy.name }, duplicatedFrom: site.id, ...(site.kind === "app" && site.app ? { kind: "app" as const, app: { ...site.app, live: null, seededVersion: undefined } } : {}) };
  const base = (await sites().update(ws.id, copy.id, patch)) ?? copy;
  const { files: norm } = site.kind === "app" ? normalizeAppFiles(v.files, { maxFiles: APP_BUILD_LIMITS[ws.plan].maxFiles + 14, maxBytes: APP_BUILD_LIMITS[ws.plan].maxBytes }) : normalizeFiles(v.files, ws.plan);
  return (await addVersion(ws, base, norm, { kind: "edit", summary: `Branched from “${site.name}” v${n}.`, prompt: v.prompt ?? "", model: null, units: 0 }, [{ id: newId("msg"), role: "system", text: `Branched from “${site.name}” version ${n}.`, at: now() }])).site;
}

export async function publishSite(ws: Workspace, site: Site): Promise<{ site: Site; scan: ScanResult }> {
  if (!ws.verified) throw new HttpError(403, "Verify your email address before publishing.", "unverified");
  if (site.takenDown) throw new HttpError(451, "This site was taken down for breaking the terms. Contact support.", "taken_down");
  const files = await headFiles(site);
  if (!files["index.html"]) throw new HttpError(400, "Build something first.");
  const published = (await sites().list(ws.id, (s) => s.publishedVersion !== null && s.id !== site.id && !isDeleted(s))).length;
  const maxPublished = ws.plan === "free" ? 1 : ws.entitlements.projects;
  if (published >= maxPublished) throw new EntitlementError(`Your plan can publish ${maxPublished} site${maxPublished === 1 ? "" : "s"} at once. Unpublish another first${ws.plan === "free" ? " or upgrade" : ""}.`, ws.plan === "free" ? "plus" : "pro");
  if (site.kind === "app" && site.app) return publishApp(ws, site, files);
  const { files: canon } = normalizeFiles(files, ws.plan);
  const scan = await scanFiles(canon);
  if (scan.verdict === "block") throw new HttpError(422, "This site can't be published: it breaks the rules for what Keplar sites may contain.", "blocked", { findings: scan.findings });
  const updated = await sites().update(ws.id, site.id, { publishedVersion: site.headVersion, publishedAt: now(), needsReview: scan.verdict === "review", updatedAt: now() });
  return { site: updated ?? site, scan };
}

/**
 * Publishing an app: the files are re-validated, the visible text (HTML plus string literals in the code) goes through the same
 * content scan as sites, the code is checked for abuse (miners, credential phishing kits), the live environment gets a snapshot
 * of the spec and design (so later draft edits never change it), and collections with example data are seeded once.
 */
async function publishApp(ws: Workspace, site: Site, files: Record<string, string>): Promise<{ site: Site; scan: ScanResult }> {
  const L = APP_BUILD_LIMITS[ws.plan];
  const { files: canon } = normalizeAppFiles(files, { maxFiles: L.maxFiles + 14, maxBytes: L.maxBytes });
  const abuse = scanAppCode(canon);
  if (abuse) throw new HttpError(422, `This app can't be published: ${abuse}`, "blocked");
  const text: Record<string, string> = {};
  for (const [p, c] of Object.entries(canon)) {
    if (p.endsWith(".html")) text[p] = c;
    else if (/\.m?js$/.test(p)) text[p.replace(/[^a-z0-9]/g, "-") + ".html"] = `<p>${(c.match(/(["'`])(?:(?!\1)[^\\\n]|\\.){12,}\1/g) ?? []).map((x) => x.slice(1, -1)).join(" ").slice(0, 60_000)}</p>`;
  }
  const scan = await scanFiles(text);
  if (scan.verdict === "block") throw new HttpError(422, "This app can't be published: it breaks the rules for what Keplar apps may contain.", "blocked", { findings: scan.findings });
  const meta = site.app!;
  const live = { spec: meta.spec, design: meta.design, images: meta.images ?? {} };
  const updated = await sites().update(ws.id, site.id, { publishedVersion: site.headVersion, publishedAt: now(), needsReview: scan.verdict === "review", updatedAt: now(), app: { ...meta, live } });
  const next = updated ?? site;
  const ctx = appCtx(next, "live", ws.plan);
  if (ctx?.limits.backend) await seedLiveIfEmpty(ctx).catch((e) => console.error("[apps] live seed failed", e));
  return { site: next, scan };
}

export async function unpublishSite(ws: Workspace, site: Site) {
  return (await sites().update(ws.id, site.id, { publishedVersion: null, publishedAt: null, needsReview: false, updatedAt: now() })) ?? site;
}

export async function deleteSite(ws: Workspace, site: Site) {
  for (const v of await versions().list(ws.id, (x) => x.siteId === site.id)) await versions().remove(ws.id, v.id);
  for (const l of await leads().list(ws.id, (x) => x.siteId === site.id)) await leads().remove(ws.id, l.id);
  await deleteSiteRecords(ws.id, site.id); // feature data (signups, bookings, rows) goes with the site
  if (site.kind === "app") await deleteAppData(site.id).catch((e) => console.error("[apps] data delete failed", e));
  // Product images go with the site, unless a copy of it (Duplicate) still shows them.
  const shared = new Set((await sites().list(ws.id, (x) => x.id !== site.id)).flatMap((x) => x.brief?.product?.images.map((i) => i.id) ?? []));
  await deleteSiteShots(ws, site.id).catch(() => 0);
  await deleteSiteAssets(ws, site.id, shared, site.brief?.product?.images.map((i) => i.id) ?? []).catch(() => 0);
  await sites().remove(ws.id, site.id);
}

export async function saveLead(site: Site, plan: PlanId, input: { page: string; fields: Record<string, string> }): Promise<boolean> {
  const cap = BUILDER_LIMITS[plan].leadsKept;
  if (site.leadCount >= cap) return false;
  const email = Object.entries(input.fields).find(([k, v]) => /mail/i.test(k) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))?.[1] ?? null;
  await leads().insert({ id: newId("lead"), workspaceId: site.workspaceId, siteId: site.id, page: input.page.slice(0, 60), fields: input.fields, email, createdAt: now() });
  await sites().increment(site.workspaceId, site.id, { leadCount: 1 }, site);
  return true;
}

export async function listLeads(site: Site, limit = 200) {
  return (await leads().list(site.workspaceId, (l) => l.siteId === site.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export const toSummary = (s: Site, origin = "") => ({
  id: s.id,
  name: s.name,
  slug: s.slug,
  template: s.template,
  headVersion: s.headVersion,
  versionCount: s.versionCount,
  publishedVersion: s.publishedVersion,
  publishedAt: s.publishedAt,
  publishedUrl: s.publishedVersion !== null ? `${origin}/s/${s.slug}` : null,
  needsReview: s.needsReview,
  takenDown: s.takenDown,
  leadCount: s.leadCount,
  seo: s.seo,
  updatedAt: s.updatedAt,
  createdAt: s.createdAt,
  archived: Boolean(s.archived),
  fx: s.fx ?? null,
  design: s.design ?? null,
  brief: s.brief ?? null,
  duplicatedFrom: s.duplicatedFrom ?? null,
  qa: s.qa ?? null,
});
