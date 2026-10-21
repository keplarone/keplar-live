"use client";

import { useEffect, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { brand } from "@/lib/site";
import { answerBrands, brandList, type ModelMark } from "./model-marks";
import b from "./AnswerBrand.module.css";

/** How long each brand stays before the next slides in, when several models contributed. */
export const BRAND_SWAP_MS = 1800;

/** One brand's logo at `size` px: the image, a one-colour mask in the text colour, or a monogram. Decorative (the text names the brand). */
export function BrandMark({ mark, size = 16 }: { mark: ModelMark; size?: number }) {
  const box = { width: size, height: size };
  if (mark.kind === "mono") return <span className={b.mono} style={{ ...box, fontSize: Math.max(7, Math.round(size * 0.53)) }} aria-hidden="true">{mark.text}</span>;
  if (mark.tint) return <span className={b.tint} style={{ ...box, maskImage: `url(${mark.src})`, WebkitMaskImage: `url(${mark.src})` }} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element -- a small static SVG from our own origin; next/image adds nothing here
  return <img className={b.logo} style={box} src={mark.src} alt="" width={size} height={size} decoding="async" />;
}
const Mark = BrandMark;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The answer header: the brand of the model that answered ("ChatGPT" with its logo for a GPT model). When several models
 * contributed, the brand swaps between them with a short slide, one at a time; with reduced motion it stays on the first
 * and says how many more. Screen readers hear one stable heading ("Keplar Answer from ChatGPT and Claude"), not each swap.
 * No model to credit (fixed replies, notices, errors): the Keplar mark, as before.
 */
export function AnswerBrand({ models, id }: { models?: readonly { id: string; name: string; status?: string }[]; id?: string }) {
  const marks = answerBrands(models ?? []);
  const [i, setI] = useState(0);
  const [still, setStill] = useState(false);
  const count = marks.length;

  useEffect(() => {
    if (count < 2) return;
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(rm.matches);
    sync();
    rm.addEventListener("change", sync);
    const t = window.setInterval(() => {
      if (document.hidden || reducedMotion()) return;
      setI((n) => (n + 1) % count);
    }, BRAND_SWAP_MS);
    return () => { window.clearInterval(t); rm.removeEventListener("change", sync); };
  }, [count]);

  if (!count) {
    return (
      <h3 id={id} className={b.title}>
        <KeplarSymbol size={15} />
        {brand.answer}
      </h3>
    );
  }
  const shown = marks[i % count];
  return (
    <h3 id={id} className={b.title} data-brands={count}>
      <span className="visually-hidden">{`${brand.answer} from ${brandList(marks)}`}</span>
      <span className={b.slot} aria-hidden="true">
        <span key={shown.family} className={b.item} data-swap={count > 1 && !still ? "" : undefined}>
          <Mark mark={shown} />
          <span className={b.name}>{shown.family}</span>
        </span>
      </span>
      {count > 1 && still ? <span className={b.more} aria-hidden="true">+{count - 1}</span> : null}
    </h3>
  );
}
