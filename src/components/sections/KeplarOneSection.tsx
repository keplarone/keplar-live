import { keplarOneCopy } from "@/lib/sections";
import { SectionHeader } from "./SectionHeader";
import { KeplarOnePipeline } from "./KeplarOnePipeline";
import s from "./sections.module.css";

export function KeplarOneSection({ headingLevel = "h2" }: { headingLevel?: "h1" | "h2" }) {
  return (
    <section className={s.section} aria-labelledby="keplar-one-title">
      <div className={s.inner}>
        <SectionHeader tone="reasoning" id="keplar-one-title" as={headingLevel} label={keplarOneCopy.label} title={keplarOneCopy.title} lede={keplarOneCopy.lede} align="split" />
        <div style={{ marginTop: "var(--s-16)" }}>
          <KeplarOnePipeline />
        </div>
      </div>
    </section>
  );
}
