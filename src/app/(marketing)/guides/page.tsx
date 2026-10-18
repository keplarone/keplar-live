import Link from "next/link";
import { PageHero } from "@/components/page/PageHero";
import { JsonLd } from "@/components/seo/JsonLd";
import { guides } from "@/lib/content/guides";
import { pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import { brand } from "@/lib/site";
import prose from "@/components/sections/sections.module.css";

export const metadata = pageMeta(
  "/guides",
  "Guides to Using AI Well",
  "Short, practical guides: why AI models disagree, studying from a PDF, turning notes into slides, citation styles and what the free tools will run.",
);

export default function GuidesIndex() {
  return (
    <>
      <PageHero label="Guides" title="Using AI well." lede="Short, practical guides. No hype, no invented numbers." ctas={[{ href: "/app", label: "Try Keplar free" }]} />
      <section className={prose.section} style={{ paddingTop: "var(--s-8)" }}>
        <div className={prose.inner}>
          <ul style={{ display: "grid", gap: "var(--s-8)", maxWidth: "64ch" }}>
            {guides.map((g) => (
              <li key={g.slug}>
                <h2 style={{ fontSize: "var(--t-title)", lineHeight: "var(--lh-title)", fontWeight: "var(--w-medium)" }}>
                  <Link href={g.path}>{g.title}</Link>
                </h2>
                <p style={{ color: "var(--c-ink-2)", marginTop: "var(--s-2)" }}>{g.summary}</p>
                <p style={{ color: "var(--c-ink-3)", fontSize: "var(--t-small)", marginTop: "var(--s-2)" }}>{g.readingMinutes} min read</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <JsonLd data={breadcrumbs([{ name: "Guides", path: "/guides" }])} />
    </>
  );
}
