"use client";

import { useEffect, useRef } from "react";
import { afterPaint } from "@/lib/perf/after-paint";
import s from "../Sky.module.css";
import { CloudCutouts } from "./CloudCutouts";

/**
 * The cloud sky for marketing pages. Mount it from the marketing layouts only
 * (English and localized). The chat shell, /app, and Space Studio do not.
 * The canvas is fetched after first paint so the first screen stays responsive.
 */
export function SiteClouds() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let dead = false;
    let stop = () => {};
    const cancel = afterPaint(() => {
      void import("./cloud-scene").then(({ mountClouds }) => {
        if (dead) return;
        void mountClouds(canvas).then((dispose) => {
          if (dead) dispose();
          else stop = dispose;
        }).catch((err) => {
          console.error("landing clouds", err);
        });
      }).catch((err) => {
        console.error("landing clouds", err);
      });
    }, { timeout: 1600 });
    return () => {
      dead = true;
      cancel();
      stop();
    };
  }, []);

  return (
    <div className={s.siteSky} aria-hidden="true">
      <canvas ref={ref} className={s.landingClouds} />
      <CloudCutouts />
    </div>
  );
}

/** The only mount. Marketing layouts render this; the root layout and the chat shell do not. */
export function MarketingSky() {
  return (
    <div data-site-sky="">
      <SiteClouds />
    </div>
  );
}
