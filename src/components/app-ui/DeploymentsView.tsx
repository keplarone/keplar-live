"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/kit";
import s from "./App.module.css";

type Site = { id: string; name: string; slug: string; headVersion: number; publishedVersion: number | null; publishedUrl: string | null; needsReview: boolean; takenDown: boolean; leadCount: number; updatedAt: string };
type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; sites: Site[] };

/** Real published sites from /api/sites. Nothing is invented: an empty account shows an empty list. */
export function DeploymentsView({ onOpenCreate }: { onOpenCreate: () => void }) {
  const [st, setSt] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/sites", { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 401 ? "Sign in to see your deployments." : "Deployments could not be loaded.");
        const data = (await res.json()) as { sites: Site[] };
        if (live) setSt({ kind: "ready", sites: data.sites ?? [] });
      } catch (e) {
        if (live) setSt({ kind: "error", message: e instanceof Error ? e.message : "Deployments could not be loaded." });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className={s.view} data-hue="verified">
      <header className={s.viewHead}>
        <div>
          <h1 className={s.viewTitle}>Deployments</h1>
          <p className={s.viewLede}>Sites you built in Create and where they are live.</p>
        </div>
        <Button variant="primary" onClick={onOpenCreate} trailingIcon={<span aria-hidden="true">→</span>}>
          Open Create
        </Button>
      </header>
      {st.kind === "loading" ? <p className={s.viewEmpty} role="status">Loading…</p> : null}
      {st.kind === "error" ? <p className={s.viewEmpty} role="alert">{st.message}</p> : null}
      {st.kind === "ready" && st.sites.length === 0 ? <p className={s.viewEmpty}>Nothing deployed yet. Build an app in Create and publish it to see it here.</p> : null}
      {st.kind === "ready" && st.sites.length ? (
        <ul className={s.deployList} aria-label="Your sites">
          {st.sites.map((x) => {
            const live = x.publishedVersion !== null && !x.takenDown;
            const ahead = live && x.headVersion > (x.publishedVersion ?? 0);
            return (
              <li key={x.id} className={s.deployRow}>
                <div className={s.deployMain}>
                  <p className={s.deployName}>{x.name}</p>
                  {live && x.publishedUrl ? (
                    <a className={s.deployUrl} href={x.publishedUrl} target="_blank" rel="noreferrer noopener">{x.publishedUrl.replace(/^https?:\/\//, "")}</a>
                  ) : (
                    <p className={s.deployUrl}>Not published</p>
                  )}
                </div>
                <p className={s.deployMeta}>
                  {x.takenDown ? <span data-tone="danger">Taken down</span> : live ? <span data-tone="ok">Live · v{x.publishedVersion}</span> : <span>Draft · v{x.headVersion}</span>}
                  {ahead ? <span data-tone="attention">Unpublished changes (v{x.headVersion})</span> : null}
                  {x.needsReview ? <span data-tone="attention">Needs review</span> : null}
                  {x.leadCount ? <span>{x.leadCount} form {x.leadCount === 1 ? "message" : "messages"}</span> : null}
                  <span>Updated {new Date(x.updatedAt).toLocaleDateString()}</span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
