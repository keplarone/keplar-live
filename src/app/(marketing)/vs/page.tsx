import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { approvedVs, VS_ACCESSED } from "@/lib/kb/vs";
import { clusterAlso } from "@/lib/seo/clusters";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import s from "@/components/kb/kb.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const metadata = pageMeta("/vs", "Keplar vs ChatGPT, Claude and Gemini", "How Keplar compares with single-model assistants like ChatGPT, Claude and Gemini: what each is for and when asking several models helps.");

const date = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function VsHub() {
  const list = approvedVs();
  return (
    <div className={s.shell}>
      <div className={s.hubWrap}>
        <header>
          <p className={s.crumbs}>Compare</p>
          <h1 className={s.h1}><TwoTone text={"Keplar compared with other assistants"} /></h1>
          <p className={s.lede}>These pages are written by Keplar, which makes us an interested party. We keep them factual: competitor details come from their own public pages with the date we read them, we make no claims about accuracy, safety or privacy being better, and each page says when the other product is the better choice.</p>
        </header>
        <div className={s.cards}>
          {list.map((v) => (
            <Link key={v.slug} href={`/vs/${v.slug}`} className={s.card}>
              <small>Read {date(VS_ACCESSED)}</small>
              <h2>Keplar vs {v.name}</h2>
              <p>{v.description}</p>
            </Link>
          ))}
        </div>
        <div className={s.prose}>
          <h2 id="how">How we keep these fair</h2>
          <ul>
            <li>Competitor details are quoted from the vendor&apos;s own pages and cited.</li>
            <li>Where we could not read something directly, we say &ldquo;see the vendor&apos;s documentation&rdquo; instead of guessing.</li>
            <li>Plans and prices change. Check the linked page before you decide.</li>
            <li>If something here is out of date or wrong, tell us through <Link href="/feedback">feedback</Link> and we will correct it.</li>
          </ul>
          <p>For a vendor-neutral way to choose, read <Link href="/blogs/chatgpt-vs-claude-vs-gemini-vs-perplexity">how to choose between ChatGPT, Claude, Gemini and Perplexity</Link>. For how Keplar produces an answer, see <Link href="/docs/how-it-works/pipeline-overview">the pipeline overview</Link>.</p>
          <p>More in this subject: {clusterAlso("/vs").map((p, i) => <span key={p.path}>{i ? ", " : ""}<Link href={p.path}>{p.label}</Link></span>)}.</p>
        </div>
      </div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Keplar vs ChatGPT, Claude and Gemini", url: abs("/vs"), hasPart: list.map((v) => ({ "@type": "WebPage", name: `Keplar vs ${v.name}`, url: abs(`/vs/${v.slug}`) })) }} />
      <JsonLd data={breadcrumbs([{ name: "Compare", path: "/vs" }])} />
    </div>
  );
}
