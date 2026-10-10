/**
 * "Use in my site": inserts a finished image into a page of one of the user's sites as a new site version (so it shows in
 * history and can be undone), and makes that one image publicly readable at /i/<id> so the published site can load it
 * (published pages have no cookies). The markup goes through the same sanitizer as every other change.
 */
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import type { Workspace } from "@/lib/create/platform/workspace";
import { PRODUCTION_URL, siteUrl } from "@/lib/site";
import { addVersion, FilesError, getSite, headFiles, normalizeFiles, PAGE_FILE } from "@/lib/site-builder/store";
import { setPublic } from "./blob";
import { SIZES } from "./config";
import { imageJobs, type ImageJob } from "./store";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Always the canonical https origin, never the request's: site pages only accept https images, and a preview or local host
 * would bake a throwaway address into a published site.
 */
export const publicImageUrl = (blobId: string) => `${(siteUrl.startsWith("https://") ? siteUrl : PRODUCTION_URL).replace(/\/$/, "")}/i/${blobId}`;

export type Placement = "top" | "bottom";

export function figureHtml(url: string, alt: string, width: number, height: number) {
  return `<figure class="kp-image" style="margin:24px auto;max-width:100%;text-align:center"><img src="${esc(url)}" alt="${esc(alt)}" width="${width}" height="${height}" loading="lazy" style="max-width:100%;height:auto;border-radius:12px"></figure>`;
}

/** Puts `fig` after the first heading (top) or at the end of <main> (bottom); falls back to <body>. */
export function insertFigure(html: string, fig: string, placement: Placement): string {
  if (placement === "top") {
    const h = /<\/h1>/i.exec(html);
    if (h) return html.slice(0, h.index + h[0].length) + fig + html.slice(h.index + h[0].length);
    const m = /<main\b[^>]*>/i.exec(html) ?? /<body\b[^>]*>/i.exec(html);
    if (m) return html.slice(0, m.index + m[0].length) + fig + html.slice(m.index + m[0].length);
    return fig + html;
  }
  const close = /<\/main>/i.exec(html) ?? /<\/body>/i.exec(html);
  if (close) return html.slice(0, close.index) + fig + html.slice(close.index);
  return html + fig;
}

export async function addImageToSite(ws: Workspace, job: ImageJob, input: { siteId?: string; page?: string; placement?: string; alt?: string }) {
  if (job.status !== "ready" || !job.blobId) throw new HttpError(409, "That image isn't ready yet.", "not_ready");
  if (!input.siteId) throw new HttpError(400, "Choose a site.");
  const site = await getSite(ws, input.siteId);
  if (site.takenDown) throw new HttpError(451, "This site was taken down for breaking the terms.", "taken_down");
  if (!site.headVersion) throw new HttpError(409, "Build the site first, then add images to it.", "no_site");
  const files = await headFiles(site);
  const page = (input.page || "index.html").toLowerCase();
  if (!PAGE_FILE.test(page) || files[page] === undefined) throw new HttpError(404, "That page isn't in the site.", "not_found");
  const url = publicImageUrl(job.blobId);
  if (files[page].includes(`/i/${job.blobId}`)) throw new HttpError(409, "This image is already on that page.", "conflict");
  const placement: Placement = input.placement === "bottom" ? "bottom" : "top";
  const alt = (input.alt ?? "").replace(/\s+/g, " ").trim().slice(0, 160) || job.prompt.slice(0, 120);
  const dim = SIZES.find((s) => s.id === job.size) ?? SIZES[0];
  const next = { ...files, [page]: insertFigure(files[page], figureHtml(url, alt, dim.width, dim.height), placement) };
  let norm;
  try {
    norm = normalizeFiles(next, ws.plan);
  } catch (e) {
    if (e instanceof FilesError) throw new HttpError(413, e.message, "too_large");
    throw e;
  }
  if (!norm.files[page]?.includes(`/i/${job.blobId}`)) throw new HttpError(422, "The site couldn't take that image.", "refused");
  if (!(await setPublic(ws.id, job.blobId, true))) throw new HttpError(404, "That image isn't available any more.", "not_found");
  const summary = `Added an image to ${page}.`;
  const { version } = await addVersion(ws, site, norm.files, { kind: "edit", summary, prompt: "", model: null, units: 0 }, [{ id: newId("msg"), role: "system", text: `${summary} (version ${site.versionCount + 1})`, at: now() }]);
  const usedIn = [...job.usedIn.filter((u) => !(u.siteId === site.id && u.page === page)), { siteId: site.id, siteName: site.name, page, at: now() }];
  await imageJobs().update(ws.id, job.id, { usedIn, updatedAt: now() });
  return { version: version.n, site: { id: site.id, name: site.name }, page, url };
}

/** Where an image is used, for the delete warning. */
export const isInUse = (job: ImageJob) => job.usedIn.length > 0;
