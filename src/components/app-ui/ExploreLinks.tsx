import Link from "next/link";
import { EXPLORE_LINKS } from "./explore-links";

/**
 * The same row on the server-rendered home and, after the app hydrates, in the sidebar or the mobile footer.
 * `live` marks the copy the app paints, so the server row can step aside without leaving the HTML.
 */
export function ExploreLinks({ className, live }: { className?: string; live?: boolean }) {
  return (
    <nav className={className} aria-label="Explore Keplar" data-explore={live ? "" : undefined}>
      {EXPLORE_LINKS.map((l) => (
        <Link key={l.href} href={l.href}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
