/** Four showcase posters linking to the gallery: used on the landing Create section and the Create start page. */
import Link from "next/link";
import { SHOWCASE } from "@/lib/create/showcase/data";
import { ShowcasePoster } from "./ShowcasePoster";
import s from "./Showcase.module.css";

export function ShowcaseStrip({ count = 4, offset = 0 }: { count?: number; offset?: number }) {
  const items = [...SHOWCASE.slice(offset), ...SHOWCASE.slice(0, offset)].slice(0, count);
  return (
    <ul className={s.strip}>
      {items.map((it) => (
        <li key={it.slug} className={s.item}>
          <ShowcasePoster item={it} />
          <h3><Link href={`/showcase/${it.slug}`}>{it.title}</Link><span className={s.num}>{it.kind}</span></h3>
          <p className={s.facts}><span>{it.style}</span><span>{it.industry}</span></p>
        </li>
      ))}
    </ul>
  );
}
