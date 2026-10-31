import { breadcrumbs } from "@/lib/seo-graph";
import { pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import type { Metadata } from "next";
import Link from "next/link";
import s from "@/components/share/Shared.module.css";
import kb from "@/components/kb/kb.module.css";
import { DIRECTORY_CATEGORIES, publicDirectory, validCategory } from "@/lib/personalize/specialist-directory";
import { TwoTone } from "@/components/page/TwoTone";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta("/specialists", "Specialist directory", "Specialists shared by Keplar users and reviewed before listing. Add one to your account and Keplar's panel of models answers with it.");

/** The search field: a hairline pill on the raised surface, 44px tall (UI v2 tokens). Category links and the button use the kb pill. */
const field: React.CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 var(--s-4)", border: 0, borderRadius: "var(--r-pill)", background: "var(--surface-raised)", boxShadow: "inset 0 0 0 var(--b-hairline) var(--hairline-strong)", color: "var(--c-ink)" };

/** Public directory of reviewed specialists. Each card opens the specialist's page, which shows everything it does before anyone adds it. */
export default async function SpecialistDirectory({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  const { c, q } = await searchParams;
  const cat = validCategory(c) ? c : undefined;
  const items = await publicDirectory({ category: cat, q }).catch(() => []);
  return (
    <>
    <JsonLd data={breadcrumbs([{ name: "Specialists", path: "/specialists" }])} />
    <div className={s.page}>
      <p className={s.eyebrow} data-o="Shared eyebrow">Specialist directory</p>
      <h1 className={s.title}><TwoTone text={"Specialists people made and shared"} /></h1>
      <p className={s.notice}>
        Each one is a saved setup: instructions and conversation starters someone wrote for one kind of work. Every listing was checked automatically and approved by a person at Keplar before it appeared here. Adding one gives you your own copy you can read and change, and Keplar&rsquo;s panel still answers and cross-checks every question.
      </p>
      <form method="get" className={s.cta} style={{ marginTop: "var(--s-6)" }} role="search">
        <label htmlFor="sp-q" className="visually-hidden">Search specialists</label>
        <input id="sp-q" name="q" defaultValue={typeof q === "string" ? q.slice(0, 80) : ""} placeholder="Search by name or description" maxLength={80} style={{ ...field, flex: "1 1 16rem", minWidth: 0, maxWidth: "32rem", fontFamily: "inherit", lineHeight: "inherit", fontSize: "max(16px, 1em)" /* 16px+ so iOS does not zoom on focus; no font shorthand, which would reset it */ }} />
        {cat ? <input type="hidden" name="c" value={cat} /> : null}
        <button type="submit" className={kb.pill} style={{ minHeight: 44, border: 0, cursor: "pointer", font: "inherit", fontSize: "var(--t-small)" }}>Search</button>
      </form>
      <nav aria-label="Categories" className={s.cta} style={{ marginTop: "var(--s-4)" }}>
        <Link href="/specialists" className={kb.pill} style={{ minHeight: 44 }} aria-current={!cat ? "page" : undefined}>All</Link>
        {DIRECTORY_CATEGORIES.map((x) => <Link key={x.id} href={`/specialists?c=${x.id}`} className={kb.pill} style={{ minHeight: 44 }} aria-current={cat === x.id ? "page" : undefined}>{x.label}</Link>)}
      </nav>
      {items.length ? (
        <ul className={s.list} style={{ marginTop: "var(--s-8)" }} aria-label="Specialists">
          {items.map((x) => (
            <li key={x.token} className={s.card} style={{ marginTop: 0 }}>
              <p className={s.qLabel}>{DIRECTORY_CATEGORIES.find((k) => k.id === x.category)?.label}{x.copies ? ` · added ${x.copies} time${x.copies === 1 ? "" : "s"}` : ""}</p>
              <h2 style={{ margin: 0, fontSize: "var(--t-lead)", fontWeight: "var(--w-medium)", letterSpacing: "-0.02em" }} dir="auto"><Link href={`/sp/${x.token}`} style={{ color: "var(--c-ink)" }}>{x.name}</Link></h2>
              {x.description ? <p className={s.q} dir="auto">{x.description}</p> : null}
              {x.starters.length ? <p className={s.notice} style={{ marginTop: "var(--s-2)" }} dir="auto">Try: {x.starters.map((t) => `“${t}”`).join(" · ")}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.notice} style={{ marginTop: "var(--s-8)" }}>{q || cat ? "No listed specialists match yet." : "No specialists are listed yet. Make one in Settings > Specialists, share it, and ask to list it."}</p>
      )}
      <div className={s.cta}>
        <Link className={s.btn} href="/account#specialists">Make your own specialist</Link>
      </div>
    </div>
    </>
  );
}
