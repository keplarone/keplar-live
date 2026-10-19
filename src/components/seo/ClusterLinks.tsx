import Link from "next/link";
import { CLUSTERS, clusterOf } from "@/lib/seo/clusters";
import { titleFor } from "@/lib/seo/titles";

/**
 * Contextual links from the search-intent cluster a page belongs to (src/lib/seo/clusters.ts). On a hub: every page in the
 * topic, then the other topics. On a supporting page: the hub and a few siblings. Server-rendered, plain lists, so the
 * links are in the HTML for crawlers and the page's own prose styles apply. Renders nothing for a page outside every cluster.
 */
export function ClusterLinks({ path }: { path: string }) {
  const c = clusterOf(path);
  if (!c || c.hubStatus !== "live") return null;
  const isHub = c.hub === path;
  const hubs = CLUSTERS.filter((x) => x.hubStatus === "live" && x.id !== c.id);
  if (isHub) {
    const pages = c.pages.filter((p) => p !== path);
    return (
      <section aria-labelledby="in-this-topic">
        <h2 id="in-this-topic">In this topic</h2>
        <p>Everything Keplar has written about {c.name.toLowerCase()}, and where to use it: <Link href={c.product.href}>{c.product.label}</Link>.</p>
        <ul>{pages.map((p) => <li key={p}><Link href={p}>{titleFor(p)}</Link></li>)}</ul>
        <h2 id="more-topics">More topics</h2>
        <ul>{hubs.map((h) => <li key={h.id}><Link href={h.hub}>{h.name}</Link></li>)}</ul>
      </section>
    );
  }
  const siblings = c.pages.filter((p) => p !== path).slice(0, 4);
  return (
    <section aria-labelledby="part-of-topic">
      <h2 id="part-of-topic">Part of: {c.name}</h2>
      <p>This page belongs to <Link href={c.hub}>{titleFor(c.hub)}</Link>. Related in the same topic:</p>
      <ul>{siblings.map((p) => <li key={p}><Link href={p}>{titleFor(p)}</Link></li>)}</ul>
    </section>
  );
}
