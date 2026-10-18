"use client";

import { PRODUCT_SHOTS } from "@/components/marketing/product-shots";
import s from "./auth.module.css";

/** A slow column of the real product. Hidden on small screens. Still when motion is reduced. */
export function ScreenCollage() {
  const loop = [...PRODUCT_SHOTS, ...PRODUCT_SHOTS];
  return (
    <aside className={s.collage} aria-hidden="true">
      <div className={s.collageTrack}>
        {loop.map((shot, i) => (
          <figure key={`${shot.src}-${i}`} className={s.shot}>
            <img src={shot.src} alt="" />
          </figure>
        ))}
      </div>
    </aside>
  );
}
