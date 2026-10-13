"use client";

import { Fragment, useSyncExternalStore } from "react";
import { cx } from "./cx";
import { detectPlatform, formatKey, spokenKey, type KeyPlatform } from "./keys";
import c from "./controls.module.css";

const noSubscribe = () => () => {};

/** "mac" or "other" on the client; "other" during server render (the client corrects it after hydration). */
export function useKeyPlatform(): KeyPlatform {
  return useSyncExternalStore(
    noSubscribe,
    () => detectPlatform(typeof navigator === "undefined" ? undefined : navigator),
    () => "other" as KeyPlatform,
  );
}

export interface KbdProps {
  /** Keys in order, e.g. ["Mod", "Shift", "P"]. "Mod" renders ⌘ on macOS and Ctrl elsewhere. */
  keys: readonly string[];
  className?: string;
}

/** A keyboard shortcut as key caps, with a spoken label ("Command Enter"). */
export function Kbd({ keys, className }: KbdProps) {
  return <KeyCombo keys={keys} className={className} />;
}

/** Shortcut text. `plain` drops the key caps (used inside a tooltip). */
export function KeyCombo({ keys, className, plain }: KbdProps & { plain?: boolean }) {
  const platform = useKeyPlatform();
  const sep = platform === "mac" ? "" : "+";
  return (
    <span className={cx(c.kbdGroup, className)} aria-label={keys.map((k) => spokenKey(k, platform)).join(" ")} role="img">
      {keys.map((k, i) => (
        <Fragment key={`${k}-${i}`}>
          {i > 0 && sep && !plain ? <span className={c.kbdSep} aria-hidden="true">{sep}</span> : null}
          {plain ? (
            <span aria-hidden="true">{(i > 0 && sep ? sep : "") + formatKey(k, platform)}</span>
          ) : (
            <kbd className={c.kbd} aria-hidden="true">{formatKey(k, platform)}</kbd>
          )}
        </Fragment>
      ))}
    </span>
  );
}
