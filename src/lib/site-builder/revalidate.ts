/**
 * Cache purge for a site's public URLs. Published pages are served with `s-maxage=60, stale-while-revalidate=300`, so after a
 * delete (or an undo) the CDN may still hold copies; revalidatePath asks Next/Vercel to drop them. Best effort by design: it
 * throws outside a request (tests, cron), and the origin itself already answers 410 the moment the site is soft-deleted.
 */
import { revalidatePath } from "next/cache";
import type { Site } from "./types";

/** Every public path a visitor or crawler could have cached for this site. */
export function publicPaths(site: Pick<Site, "slug">, files: Record<string, string>): string[] {
  const base = `/s/${site.slug}`;
  const out = new Set<string>([base, `${base}/`, `${base}/sitemap.xml`, `${base}/robots.txt`, `${base}/_thanks`]);
  for (const f of Object.keys(files)) {
    out.add(`${base}/${f}`);
    if (f.endsWith(".html")) out.add(`${base}/${f.replace(/\.html$/, "")}`);
  }
  return [...out];
}

export async function purgeSiteCaches(site: Pick<Site, "slug">, files: Record<string, string>): Promise<string[]> {
  const paths = publicPaths(site, files);
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      /* not inside a Next request: nothing cached by this process to drop */
    }
  }
  return paths;
}
