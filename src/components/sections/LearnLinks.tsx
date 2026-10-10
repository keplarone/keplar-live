import Link from "next/link";
import s from "./LearnLinks.module.css";

const links = [
  { href: "/superintelligence", title: "What is superintelligence?", text: "Sourced definitions, risks and contested timelines." },
  { href: "/multi-model-ai", title: "Multi-model AI, explained", text: "Four ways tools combine models, and where it falls short." },
  { href: "/ai-vs-agi-vs-superintelligence", title: "AI vs AGI vs superintelligence", text: "The differences, with Google DeepMind's levels table." },
  { href: "/models", title: "Which models Keplar uses", text: "The Free and paid rosters, listed from the product." },
];

/** A plain, crawlable link block that connects product pages to the explainers. Server-rendered, no animation. */
export function LearnLinks({ heading = "Go deeper" }: { heading?: string }) {
  return (
    <section className={s.section} aria-labelledby="learn-links-h">
      <div className={s.inner}>
        <h2 id="learn-links-h" className={s.h}>{heading}</h2>
        <ul className={s.list}>
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={s.card}>
                <span className={s.title}>{l.title}</span>
                <span className={s.text}>{l.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
