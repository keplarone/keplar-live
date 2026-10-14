import { breadcrumbs } from "@/lib/seo-graph";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHero } from "@/components/page/PageHero";
import { Enterprise } from "@/components/sections/Enterprise";
import { Agents } from "@/components/sections/Agents";
import { FinalCta } from "@/components/sections/FinalCta";
import { businessHeroCopy } from "@/lib/sections";
import { pageMeta } from "@/lib/seo";
import { brand } from "@/lib/site";
import s from "@/components/sections/sections.module.css";
import b from "@/components/sections/BusinessTools.module.css";

export const metadata = pageMeta(
  "/enterprise",
  "Keplar for business: commerce, CRM, agents, and control",
  "Run a business? Keplar Business adds optional commerce, CRM, inbox, a dashboard, and autonomous agents, with spend caps, permissions, audit logs, approvals, and deployment gates.",
);

export default function EnterprisePage() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "For business", path: "/enterprise" }])} />
      <PageHero
        label={businessHeroCopy.label}
        title={businessHeroCopy.title}
        lede={businessHeroCopy.lede}
        ctas={[{ href: brand.contactPath, label: `Contact ${brand.name}` }, { href: "/pricing", label: "See plans", variant: "secondary" }]}
      />
      <section className={s.section} style={{ paddingTop: 0 }} aria-labelledby="business-tools-title">
        <div className={s.inner}>
          <h2 id="business-tools-title" className={b.title}>
            What Business adds
          </h2>
          <dl className={b.tools}>
            {businessHeroCopy.tools.map((t) => (
              <div key={t.name} className={b.tool}>
                <dt>{t.name}</dt>
                <dd>{t.text}</dd>
              </div>
            ))}
          </dl>
          <p className={b.note}>{businessHeroCopy.note}</p>
        </div>
      </section>
      <Enterprise showCta={false} />
      <Agents />
      <FinalCta />
    </>
  );
}
