import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { allPrompts, promptCategories } from "@/lib/kb/prompts";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import s from "@/components/kb/kb.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const metadata = pageMeta("/prompts", "AI prompt library: copyable prompts for any assistant", `${allPrompts().length} prompt templates for studying, writing, work, coding, research and checking AI answers, each with why it works and what to verify.`);

export default function PromptsHub() {
  return (
    <div className={s.shell}>
      <div className={s.hubWrap}>
        <header>
          <p className={s.crumbs}>Prompt library</p>
          <h1 className={s.h1}><TwoTone text={"Prompt library"} /></h1>
          <p className={s.lede}>{allPrompts().length} templates with [placeholders] you fill in. Each says why it works and what to check afterward. They work in any assistant; the Keplar page notes how Keplar handles them.</p>
        </header>
        <div className={s.cards}>
          {promptCategories.map((c) => (
            <Link key={c.slug} href={`/prompts/${c.slug}`} className={s.card}>
              <small>{c.prompts.length} prompts</small>
              <h2>{c.name}</h2>
              <p>{c.blurb}</p>
            </Link>
          ))}
        </div>
        <div className={s.prose}>
          <h2 id="how-to-use">How to use these</h2>
          <p>Replace each [placeholder] with your own details, and paste in your own material instead of asking the assistant to recall it. The more specific the input, the less the assistant has to guess.</p>
          <p>No template makes an answer correct. After the response, do the check listed under each prompt, and see <Link href="/blogs/how-to-check-an-ai-answer">how to check an AI answer</Link>. For more on phrasing, read <Link href="/blogs/how-to-write-better-ai-prompts">eight prompt habits that work on any assistant</Link>.</p>
        </div>
      </div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Keplar prompt library", url: abs("/prompts"), hasPart: promptCategories.map((c) => ({ "@type": "WebPage", name: c.name, url: abs(`/prompts/${c.slug}`) })) }} />
      <JsonLd data={breadcrumbs([{ name: "Prompt library", path: "/prompts" }])} />
    </div>
  );
}
