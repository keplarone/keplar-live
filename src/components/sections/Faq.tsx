import { faq } from "@/lib/faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { faqPage } from "@/lib/structuredData";
import s from "./Faq.module.css";

/**
 * Visible FAQ (native <details> disclosure rows) and matching FAQPage JSON-LD,
 * both generated from src/lib/faq.ts. `items` restricts which questions show;
 * the JSON-LD always matches exactly what is rendered.
 */
export function Faq({
  title = "Questions",
  items,
  entries,
}: {
  title?: string;
  /** Subset of src/lib/faq.ts by question text. */
  items?: string[];
  /** Explicit Q&As (e.g. comparison pages). Overrides `items`. */
  entries?: { q: string; a: string }[];
}) {
  const list = entries ?? (items ? faq.filter((f) => items.includes(f.q)) : faq);
  return (
    <section className={s.section} aria-labelledby="faq-title">
      <div className={s.inner}>
        <h2 id="faq-title" className={s.title}>
          {title}
        </h2>
        <div className={s.list} data-reveal-stagger>
          {list.map((f) => (
            <details key={f.q} className={s.item} data-reveal>
              <summary className={s.q}>
                <span>{f.q}</span>
                <i aria-hidden="true" />
              </summary>
              <p className={s.a}>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
      <JsonLd data={faqPage(list)} />
    </section>
  );
}
