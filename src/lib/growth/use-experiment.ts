"use client";

import { useEffect, useSyncExternalStore } from "react";
import { assignArm, experimentById, exposureTag, runningIds, type Arm, type Experiment } from "./experiments";
import { consentedBrowserId, seoTrack } from "@/lib/seo-events";

const SEEN = "keplar_xp_seen";
const noSubscribe = () => () => {};

/** The arm id for this browser, or the control's when the experiment is off or the visitor has not allowed Analytics. */
function armIdFor(exp: Experiment | undefined): string {
  if (!exp) return "";
  if (!runningIds().has(exp.id)) return exp.arms[0].id;
  const vid = consentedBrowserId();
  return vid ? assignArm(exp, vid).id : exp.arms[0].id;
}

/**
 * The arm this visitor sees for an experiment. The server render and hydration always use the control (no mismatch); the
 * client then reads its assigned arm, and a consented browser in a running experiment records the exposure once per session.
 * Not running, no consent, or storage blocked: always the control, nothing recorded.
 */
export function useExperiment(id: string): Arm {
  const exp = experimentById(id);
  if (!exp) throw new Error(`Unknown experiment ${id}`);
  const armId = useSyncExternalStore(noSubscribe, () => armIdFor(exp), () => exp.arms[0].id);
  const arm = exp.arms.find((a) => a.id === armId) ?? exp.arms[0];
  const exposed = runningIds().has(exp.id) && armId !== "";
  useEffect(() => {
    if (!exposed || !consentedBrowserId()) return;
    try {
      const seen = new Set((sessionStorage.getItem(SEEN) ?? "").split(",").filter(Boolean));
      if (seen.has(exp.id)) return;
      seen.add(exp.id);
      sessionStorage.setItem(SEEN, [...seen].join(","));
    } catch {
      return;
    }
    seoTrack("experiment_exposure", { where: exposureTag(exp.id, armId) });
  }, [exp.id, armId, exposed]);
  return arm;
}
