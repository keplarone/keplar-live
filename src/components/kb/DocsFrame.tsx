import Link from "next/link";
import type { ReactNode } from "react";
import { docSections, docsIn } from "@/lib/kb/docs";
import { DocsSearch } from "./DocsSearch";
import { Toc, type TocItem } from "./Toc";
import s from "./kb.module.css";

function Nav({ current }: { current: string }) {
  const currentSection = current.split("/")[2];
  return (
    <nav className={s.side} aria-label="Docs">
      <Link href="/docs" className={s.sideTitle}>Keplar docs</Link>
      <DocsSearch />
      {docSections.map((sec) => (
        <details key={sec.id} className={s.sec} open={sec.id === currentSection || undefined}>
          <summary>{sec.title}</summary>
          <ul>
            <li><Link className={s.navLink} href={`/docs/${sec.id}`} aria-current={current === `/docs/${sec.id}` ? "page" : undefined}>Overview</Link></li>
            {docsIn(sec.id).map((d) => (
              <li key={d.slug}><Link className={s.navLink} href={d.path} aria-current={current === d.path ? "page" : undefined}>{d.title}</Link></li>
            ))}
          </ul>
        </details>
      ))}
    </nav>
  );
}

/** Left tree + search, article column, and "On this page". `toc` is omitted on hub pages. */
export function DocsFrame({ current, toc, children }: { current: string; toc?: TocItem[]; children: ReactNode }) {
  return (
    <div className={s.shell}>
      <div className={toc ? s.grid : `${s.grid} ${s.grid2}`}>
        <Nav current={current} />
        <div>
          <details className={s.mobileMenu}>
            <summary>Docs menu</summary>
            <Nav current={current} />
          </details>
          {children}
        </div>
        {toc ? <Toc items={toc} /> : null}
      </div>
    </div>
  );
}

