"use client";

import { useEffect } from "react";
import { track, type FunnelEvent } from "@/lib/analytics";

export function TrackOnMount({ event }: { event: FunnelEvent }) {
  useEffect(() => {
    track(event);
  }, [event]);
  return null;
}
