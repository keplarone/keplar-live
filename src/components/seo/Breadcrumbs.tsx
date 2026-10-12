import Link from "next/link";
import { JsonLd } from "./JsonLd";
import { breadcrumbs } from "@/lib/seo-graph";
import s from "./Breadcrumbs.module.css";

export type Crumb = { name: string; path: string };

/**
 * One breadcrumb trail, shown and marked up from the same data: a visible <nav aria-label="Breadcrumb"> with an ordered list
 * (the current page last, aria-current) and the matching BreadcrumbList JSON-LD (Home first, src/lib/seo-graph.ts). Use it for
 * pages that sit below a section (a doc in Docs, a post in the Blog); a top-level page needs only the JSON-LD.
 */
export function Breadcrumbs({ trail, className }: { trail: Crumb[]; className?: string }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className={`${s.crumbs}${className ? ` ${className}` : ""}`}>
        <ol>
          {trail.map((c, i) => (
            <li key={c.path}>
              {i < trail.length - 1 ? <Link href={c.path}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd data={breadcrumbs(trail)} />
    </>
  );
}
