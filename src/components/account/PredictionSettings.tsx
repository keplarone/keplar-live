"use client";
/**
 * The switch for predictive preloading (src/components/app-ui/predict.ts): this browser learns which studio usually comes next and
 * downloads its code early. View names only, kept in this browser. Turning it off also forgets what it learned.
 */
import { useSyncExternalStore, useState } from "react";
import { predictionOn, predictionStats, setPredictionOn } from "@/components/app-ui/predict";
import s from "./account.module.css";

const noop = () => () => {};

export function PredictionSettings() {
  // Read on the client only (localStorage); the server renders the neutral state.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [, bump] = useState(0);
  const on = ready ? predictionOn() : false;
  const stats = ready ? predictionStats() : { made: 0, used: 0, precision: null };
  const toggle = () => { setPredictionOn(!on); bump((n) => n + 1); };
  return (
    <div className={s.panel} id="predictive-preloading" aria-labelledby="pred-h">
      <div className={s.row}>
        <h2 id="pred-h" className={s.k} style={{ margin: 0 }}>Predictive preloading</h2>
        <button type="button" role="switch" aria-checked={on} aria-label="Predictive preloading on this browser" className={s.btn} style={{ height: 36 }} disabled={!ready} onClick={toggle}>
          {!ready ? "…" : on ? "On" : "Off"}
        </button>
      </div>
      <p className={s.note}>
        This browser learns which studio you usually open next (Create, Slides, Study) and downloads it early, so it opens at once. It keeps
        view names only, here on this device; nothing is sent to Keplar and nothing runs by itself. Turning it off forgets what it learned.
        {stats.made ? ` So far ${stats.used} of ${stats.made} preloads were for the view you opened next.` : ""}
      </p>
    </div>
  );
}
