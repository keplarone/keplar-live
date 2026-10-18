import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { TwoTone } from "@/components/page/TwoTone";
import { pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import { TOOLS } from "@/lib/seo/tools";
import hero from "@/components/page/RoutePlaceholder.module.css";
import prose from "@/components/sections/sections.module.css";

export const metadata = pageMeta(
  "/tools",
  "Free AI Tools: Summarizer, Flashcards and More",
  "Free single-purpose AI tools from Keplar: summarizer, flashcard maker, study guide, citation formatter, prompt optimizer and more. Each says what it won't do.",
);

export default function ToolsIndex() {
  return (
    <>
      <header className={hero.hero}>
        <div className={hero.header}>
          <p className={hero.label}>Free tools</p>
          <h1 className={hero.title}><TwoTone text="Tools that do one job, and say what they don't." /></h1>
          <p className={hero.lede}>Citation formatting and the comparison list run without a model. The others call one free model, are limited to 8 runs an hour, and show an error instead of a made-up answer when that service is off.</p>
        </div>
      </header>
      <section className={prose.section}>
        <div className={`${prose.inner} ${prose.prose}`}>
          <ul>
            {TOOLS.map((t) => (
              <li key={t.slug}><Link href={`/tools/${t.slug}`}>{t.h1.replace(/\.$/, "")}</Link> — {t.description}</li>
            ))}
          </ul>
        </div>
      </section>
      <JsonLd data={breadcrumbs([{ name: "Tools", path: "/tools" }])} />
    </>
  );
}
