"use client";
/**
 * Requests that belong in another Keplar studio, said plainly with one way to get there:
 *   video  -> Create > Video (Higgsfield), with the prompt filled in. Nothing is generated or charged until the person starts it there.
 *   roblox -> Space Studio, the desktop app that builds the game inside Roblox Studio.
 */
import { useState } from "react";
import { VIDEO_HANDOFF_KEY } from "@/lib/higgsfield/handoff";
import type { KeplarMessage, Ledger } from "../state/types";
import s from "./OutboundTurn.module.css";
import h from "./HandoffTurn.module.css";

const HAS_VIDEO = new Set(["pro", "business"]);

export function HandoffTurn({ message, plan }: { message: KeplarMessage; plan: Ledger["plan"] }) {
  const c = message.handoff!;
  const [copied, setCopied] = useState(false);
  const video = c.kind === "video";
  const noVideo = video && !HAS_VIDEO.has(plan);

  async function copy() {
    try {
      await navigator.clipboard.writeText(c.prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={`${s.card} k-enter`} aria-label={video ? "Make a video" : "Make a Roblox game"}>
      <header className={s.head}>
        <span className={s.app} aria-hidden="true">{video ? <FilmIcon /> : <CubeIcon />}</span>
        <div className={s.headText}>
          <h3 className={s.title}>{video ? "Make this video in Create" : "Build this in Space Studio"}</h3>
          <p className={s.sub}>{video ? "Video clips, made with Higgsfield" : "Keplar's desktop app for Roblox Studio"}</p>
        </div>
      </header>
      {c.prompt ? <p className={h.prompt}>{c.prompt}</p> : null}
      <ul className={s.facts}>
        {video ? (
          <>
            {noVideo ? (
              <li>Video needs Keplar Pro or Business.</li>
            ) : (
              <li>Your prompt is filled in. You pick the model and length, and see the price before anything is made.</li>
            )}
          </>
        ) : (
          <>
            <li>Space Studio works inside Roblox Studio on your computer: it builds the map, scripts and UI, and you test it there.</li>
            <li>Publishing to Roblox stays with you.</li>
          </>
        )}
      </ul>
      <div className={s.actions}>
        {video ? (
          noVideo ? (
            <a className="k3d k3d-primary" href="/pricing">See plans</a>
          ) : (
            <a className="k3d k3d-primary" href="/app/create?tab=video" onClick={() => { try { sessionStorage.setItem(VIDEO_HANDOFF_KEY, c.prompt); } catch { /* storage blocked: opens empty */ } }}>
              Open Video
            </a>
          )
        ) : (
          <>
            <a className="k3d k3d-primary" href="/space-studio">Get Space Studio</a>
            <button type="button" className="k3d" onClick={() => void copy()}>{copied ? "Copied" : "Copy idea"}</button>
          </>
        )}
      </div>
      <p className="visually-hidden" aria-live="polite">{copied ? "Idea copied" : ""}</p>
    </section>
  );
}

function FilmIcon() {
  return <svg viewBox="0 0 20 20" width="20" height="20"><rect x="2.5" y="4" width="15" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m8.5 7.5 4 2.5-4 2.5z" fill="currentColor" /></svg>;
}
function CubeIcon() {
  return <svg viewBox="0 0 20 20" width="20" height="20"><path d="M10 2.5 16.5 6v8L10 17.5 3.5 14V6z M3.5 6 10 9.5 16.5 6 M10 9.5v8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}
