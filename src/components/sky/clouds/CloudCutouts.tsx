"use client";

import { useEffect, useRef } from "react";
import { isPhone, liteFx } from "@/lib/fx/lite";
import { skyFromQuery, skyProfile } from "@/lib/sky/profile";
import { isSkyVariant } from "@/lib/sky/variants";
import { liveVariant, setLiveVariant, subscribeWeather } from "@/lib/sky/weather-mode";
import s from "../Sky.module.css";
import { CLOUD_CUTOUTS } from "./cloud-cutouts";

/**
 * CC0 cumulus cutouts (public/sky/clouds). Two depths drift at different speeds.
 * A dark-mode filter tints these images only. Overcast and rain grey the same clouds.
 */
export function CloudCutouts() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const paint = () => {
      root.dataset.cloudCover = skyProfile(liveVariant()).gray >= 0.16 ? "more" : "few";
    };
    paint();
    const unsub = subscribeWeather(paint);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (ref.current) ref.current.dataset.drift = reduce || isPhone() || liteFx() ? "off" : "on";
    const forced = skyFromQuery(location.search);
    const abort = new AbortController();
    if (forced) setLiveVariant(forced);
    else {
      void fetch("/api/sky/weather", { signal: abort.signal, headers: { accept: "application/json" } })
        .then((res) => (res.ok ? res.json() : null))
        .then((body: { sky?: unknown } | null) => {
          if (body && isSkyVariant(body.sky)) setLiveVariant(body.sky);
        })
        .catch(() => {});
    }
    return () => {
      unsub();
      abort.abort();
    };
  }, []);

  return (
    <div ref={ref} className={s.cloudDeck} data-drift="on">
      {CLOUD_CUTOUTS.map((cloud) => (
        // The files are already sized WebPs. next/image would recompress them and wrap the filter target.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={cloud.src}
          className={cloud.hideOnPhone ? `${s.cloudImg} ${s.cloudPhone}` : s.cloudImg}
          src={cloud.src}
          alt=""
          width={cloud.w}
          height={cloud.h}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          style={{
            left: cloud.left,
            right: cloud.right,
            top: cloud.top,
            width: cloud.width,
            ["--dur" as string]: cloud.dur,
            ["--dx" as string]: cloud.dx,
            ["--dy" as string]: cloud.dy,
            animationDelay: cloud.delay,
          }}
        />
      ))}
    </div>
  );
}
