"use client";
/**
 * Keplar Studio as its own app view (/app/studio): the full-page Workspace for the environment used last (Roblox Studio or
 * Blender, remembered with Create's switch). Switching in the nav keeps the other environment mounted, so a run or a
 * conversation there is never lost.
 */
import { useState } from "react";
import { pickEnv, readRememberedEnv, rememberEnv, type StudioEnv } from "@/components/create/studio/keplar-studio-nav";
import { Workspace } from "./Workspace";
import s from "./shell.module.css";

export function KeplarStudio({ plan, signedIn = null }: { plan?: string; signedIn?: boolean | null }) {
  const [env, setEnv] = useState<StudioEnv>(() => pickEnv(null, readRememberedEnv()));
  const [seen, setSeen] = useState<Record<StudioEnv, boolean>>(() => ({ roblox: env === "roblox", blender: env === "blender" }));
  const pick = (next: StudioEnv) => {
    setEnv(next);
    rememberEnv(next);
    setSeen((v) => (v[next] ? v : { ...v, [next]: true }));
  };
  return (
    <div className={s.host}>
      {(["roblox", "blender"] as const).map((e) =>
        seen[e] ? (
          <div key={e} className={s.hostPane} hidden={env !== e}>
            <Workspace env={e} plan={plan} signedIn={signedIn} onEnvChange={pick} />
          </div>
        ) : null,
      )}
    </div>
  );
}
