"use client";
/**
 * Keplar Studio inside Create: a header with the environment switch (Roblox Studio | Blender) above the chosen
 * environment's view. Both views stay mounted once opened, so switching never loses a conversation or a run.
 *
 * The pane does not import the views itself: CreateStudio passes them in (lazy, warmed on hover) so the Create chunk stays
 * small. A view passed as null has not been opened yet and renders nothing.
 */
import Link from "next/link";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { STUDIO_ENVS, type StudioEnv } from "./keplar-studio-nav";
import s from "./keplarStudio.module.css";

export type KeplarStudioPaneProps = {
  /** The environment on screen. */
  env: StudioEnv;
  /** Called when the person picks an environment (click, or arrow keys / Home / End in the switch). */
  onEnvChange: (env: StudioEnv) => void;
  /** Called when the pointer or focus reaches an environment that is not on screen, to fetch its code early. */
  onWarm?: (env: StudioEnv) => void;
  /** Each environment's view, or null when it has not been opened yet. */
  views: Record<StudioEnv, ReactNode | null>;
  /** Hide the whole pane (another Create tab is on screen) without unmounting it. */
  hidden?: boolean;
};

export function KeplarStudioPane({ env, onEnvChange, onWarm, views, hidden = false }: KeplarStudioPaneProps) {
  const tabs = useRef<Record<StudioEnv, HTMLButtonElement | null>>({ roblox: null, blender: null });
  const index = STUDIO_ENVS.findIndex((e) => e.id === env);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = STUDIO_ENVS.length;
    const next = e.key === "ArrowRight" ? (index + 1) % n : e.key === "ArrowLeft" ? (index - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    const id = STUDIO_ENVS[next]!.id;
    onEnvChange(id);
    tabs.current[id]?.focus();
  };

  return (
    <section className={s.pane} hidden={hidden} aria-label="Keplar Studio" data-env={env}>
      <header className={s.head}>
        <div className={s.switch} role="tablist" aria-label="Environment" data-index={index} onKeyDown={onKey}>
          <span className={s.thumb} aria-hidden="true" />
          {STUDIO_ENVS.map((e) => (
            <button
              key={e.id}
              ref={(el) => { tabs.current[e.id] = el; }}
              type="button"
              role="tab"
              id={`keplar-studio-tab-${e.id}`}
              aria-selected={env === e.id}
              aria-controls={`keplar-studio-panel-${e.id}`}
              tabIndex={env === e.id ? 0 : -1}
              className={s.option}
              onClick={() => onEnvChange(e.id)}
              onPointerEnter={env === e.id ? undefined : () => onWarm?.(e.id)}
              onFocus={env === e.id ? undefined : () => onWarm?.(e.id)}
            >
              {e.label}
            </button>
          ))}
        </div>
      </header>
      {STUDIO_ENVS.map((e) => (
        <div
          key={e.id}
          role="tabpanel"
          id={`keplar-studio-panel-${e.id}`}
          aria-labelledby={`keplar-studio-tab-${e.id}`}
          className={s.panel}
          hidden={env !== e.id}
        >
          {views[e.id]}
        </div>
      ))}
    </section>
  );
}

/** Shown on App when a Keplar Studio link is opened outside the desktop app. Plain text and real links only. */
export function KeplarStudioElsewhere({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className={s.elsewhere} role="note" aria-label="Keplar Studio">
      <p className={s.elsewhereText}>
        <b>Keplar Studio</b> works with Roblox Studio and Blender on your computer, so it opens in the Keplar desktop app (Lite and up). You are in App.
      </p>
      <div className={s.elsewhereLinks}>
        <Link className={s.primary} href="/download">Download the desktop app</Link>
        {STUDIO_ENVS.map((e) => (
          <Link key={e.id} className={s.link} href={e.href}>{e.label}</Link>
        ))}
        <button type="button" className={s.dismiss} onClick={onDismiss} aria-label="Dismiss">Dismiss</button>
      </div>
    </div>
  );
}
