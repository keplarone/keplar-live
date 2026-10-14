import Link from "next/link";
import s from "./Sky.module.css";

type Row = { id: string; n: string; label: string; title: string };

/**
 * "Everything in Keplar" as a plain list: one row per chapter (src/lib/features.ts), each linking to its section on /features.
 * Hover and keyboard focus change the row's colour only (docs/ui-v2.md): no sliding, dimming or floating previews.
 */
export function FeatureList({ rows }: { rows: Row[] }) {
  return (
    <ol className={s.featureList} data-reveal="">
      {rows.map((c) => (
        <li key={c.id}>
          <Link href={`/features#${c.id}`} className={s.featureRow}>
            <span className={s.featureN}>{c.n}</span>
            <span className={s.featureName}>{c.label}</span>
            <span className={s.featureLede}>{c.title}</span>
            <svg className={s.featureArrow} viewBox="0 0 16 16" aria-hidden="true" data-mirror=""><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </li>
      ))}
    </ol>
  );
}
