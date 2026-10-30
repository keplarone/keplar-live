"use client";

import { useEffect } from "react";
import { installOrbitFx } from "@/lib/orbit-fx";

/** Mounts the one delegated Orbit button-effects runtime for the whole document (root layout). Renders nothing. */
export function OrbitFx() {
  useEffect(() => installOrbitFx(document), []);
  return null;
}
