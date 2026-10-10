"use client";
/** The Live tab inside the App studio: the same live session as /app/create/live/<id>, sized to the studio's stage. */
import { useEffect } from "react";
import { LivePane } from "./LivePane";
import { useLiveSession } from "./useLiveSession";
import s from "./advanced.module.css";

export default function LiveTab({ siteId, toast, onSaved, onOpenCritic, onDeployed }: { siteId: string; toast: (t: string) => void; onSaved?: (v: number) => void; onOpenCritic?: () => void; onDeployed?: () => void }) {
  const session = useLiveSession(siteId, { tab: "live" });
  const { error, info, setLocal } = session;
  useEffect(() => { setLocal({ tab: "live" }); }, [setLocal]);
  if (error) {
    return (
      <div className={s.root}>
        <div className={s.center}>
          <div>
            <h1>The live session didn&apos;t open</h1>
            <p>{error.message}</p>
            <button type="button" className={s.btn} onClick={session.reconnect}>Try again</button>
          </div>
        </div>
      </div>
    );
  }
  if (!info) return <div className={s.root}><div className={s.center}><p className={s.dim}>Opening the live session…</p></div></div>;
  return <LivePane session={session} toast={toast} onSaved={onSaved} onOpenCritic={onOpenCritic} onDeployed={onDeployed} fullHref={`/app/create/live/${siteId}`} />;
}
