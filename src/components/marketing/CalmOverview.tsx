import Link from "next/link";
import { localizedPath } from "@/lib/i18n/routing";
import { PRODUCT_SHOTS } from "./product-shots";
import s from "./Overview.module.css";

/**
 * Marketing page on the same graphite surface as the chat. One statement, one button,
 * then the real product. No sky, no scene, no invented proof, no model-provider names.
 */
export function CalmOverview({ locale }: { locale?: string }) {
  const pricing = localizedPath("/pricing", locale ?? "en");
  return (
    <article className={s.page}>
      <header className={s.hero}>
        <h1 className={s.h1}>Several models. One answer.</h1>
        <p className={s.lede}>
          Keplar asks the models your question needs, shows where they disagree, and writes one answer. Free to try.
        </p>
        <Link className={s.primary} href="/">Ask Keplar</Link>
      </header>
      {PRODUCT_SHOTS.map((shot) => (
        <section key={shot.src} className={s.section}>
          <h2>{shot.title}</h2>
          <p>{shot.text}</p>
          <figure className={s.frame}>
            <img src={shot.src} alt={shot.alt} />
          </figure>
        </section>
      ))}
      <p className={s.more}>
        <Link href={pricing}>Pricing</Link>
        <Link href="/docs">Docs</Link>
      </p>
    </article>
  );
}
