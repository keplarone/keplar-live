/**
 * Serves user project files. In production this runs on the separate
 * user-content domain (<slug>.keplar.site / custom domains) so user code can
 * never read keplar.one cookies or storage. Locally it runs under /sites with a
 * CSP `sandbox` (opaque origin, no same-origin access) as the equivalent guard.
 */
import { recordView } from "@/lib/business/traffic";
import path from "node:path";
import { blobs, contentTypeFor } from "./platform/blob";
import { USER_CONTENT_DOMAIN } from "./platform/config";
import { deployPrefix, draftPrefix } from "./projects";
import { domains, projects } from "./repo";
import type { Project } from "./types";

const SANDBOX_CSP = "sandbox allow-scripts allow-forms allow-popups allow-modals; frame-ancestors 'self'; base-uri 'self'; object-src 'none'";

function page(status: number, title: string, text: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><body style="font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#141414;background:#fafaf8"><div style="max-width:420px;text-align:center"><h1 style="font-size:22px;font-weight:600">${title}</h1><p style="color:#6b6b6b">${text}</p></div>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": SANDBOX_CSP } },
  );
}

async function serveFrom(prefix: string, parts: string[] | undefined, base: string) {
  let rel = (parts ?? []).join("/");
  if (!rel || rel.endsWith("/")) rel += "index.html";
  const norm = path.posix.normalize(rel);
  if (norm.startsWith("..")) return page(400, "Bad request", "");
  let b = await blobs().get(prefix + norm);
  if (!b && !path.posix.extname(norm)) b = await blobs().get(prefix + norm + "/index.html");
  if (!b) return page(404, "Page not found", "This page doesn't exist on this site.");
  let bodyOut: Uint8Array = new Uint8Array(b.body);
  // Next.js drops trailing slashes, so pin relative URLs to the site root.
  if (norm.endsWith(".html")) {
    const html = b.body.toString("utf8");
    if (!/<base\s/i.test(html)) bodyOut = new TextEncoder().encode(html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n<base href="${base}">`));
  }
  return new Response(bodyOut as BodyInit, {
    headers: {
      "content-type": b.contentType || contentTypeFor(norm),
      "content-security-policy": SANDBOX_CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-robots-tag": "noindex",
      "cache-control": "no-store",
    },
  });
}

/** Resolve a site by <slug>, <slug>.keplar.site, or an active custom domain. */
export async function resolveSite(key: string): Promise<Project | null> {
  const k = key.toLowerCase();
  const slug = k.endsWith(`.${USER_CONTENT_DOMAIN}`) ? k.slice(0, -(USER_CONTENT_DOMAIN.length + 1)) : k;
  const bySlug = await projects().findSystemBy("slug", slug);
  if (bySlug) return bySlug;
  const dom = await domains().findSystem((d) => d.status === "active" && (d.name === k || (d.apex && `www.${d.name}` === k)));
  return dom ? projects().findSystem((p) => p.id === dom.projectId) : null;
}

export async function serveLive(key: string, parts?: string[]) {
  const project = await resolveSite(key);
  if (!project) return page(404, "Site not found", "There's no published site here.");
  if (project.takenDown) return page(451, "Site unavailable", "This site was removed for violating the terms of service.");
  if (!project.liveDeployId) return page(404, "Not published", "This site isn't published yet.");
  const file = (parts ?? []).join("/");
  if (file === "" || file === "index.html") void recordView(project.workspaceId, project.id, "/").catch(() => undefined);
  return serveFrom(deployPrefix(project.id, project.liveDeployId), parts, `/sites/${key}/`);
}

export async function servePreview(workspaceId: string, projectId: string, parts?: string[]) {
  const project = await projects().get(workspaceId, projectId);
  if (!project || !project.draftVersion) return page(404, "No preview yet", "Describe what you want to build to see a preview.");
  return serveFrom(draftPrefix(project, project.draftVersion), parts, `/sites/preview/${project.id}/`);
}
