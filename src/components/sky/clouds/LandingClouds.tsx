"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { afterPaint } from "@/lib/perf/after-paint";
import s from "../Sky.module.css";

/**
 * One cloud sky for the whole site. The root layout mounts it once, fixed behind every page.
 * The canvas is fetched after first paint so the first screen and the composer stay responsive.
 */
export function SiteClouds() {
  const ref = useRef<HTMLCanvasElement>(null);
  const path = usePathname() || "/";
  const space = path === "/space-studio" || path.startsWith("/space-studio/");

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || space) return;
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
  }, [space]);

  if (space) return null;

  return (
    <div className={s.siteSky} aria-hidden="true">
      <canvas ref={ref} className={s.landingClouds} />
    </div>
  );
}
