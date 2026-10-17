"use client";

import { useEffect, useRef } from "react";
import { afterPaint } from "@/lib/perf/after-paint";
import s from "../Sky.module.css";

/** Fixed sky behind the home. The canvas is fetched after first paint so the hero and the composer stay responsive. */
export function LandingClouds() {
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
    <div className={s.landingSky} aria-hidden="true">
      <canvas ref={ref} className={s.landingClouds} />
    </div>
  );
}
