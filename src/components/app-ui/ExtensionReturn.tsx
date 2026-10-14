"use client";

import { useEffect } from "react";
import { notify } from "@/components/kit";
import { extensionNote } from "@/lib/usage/meter";
import type { Ledger } from "./state/types";

type Meter = { plan: Ledger["plan"]; admin?: boolean; extension?: Ledger["extension"] };
const FRESH_MS = 15 * 60_000;
/** One toast, replaced in place as the purchase is confirmed (kit toast id). */
export const EXTENSION_TOAST_ID = "extension-return";

/**
 * Back from Whop checkout (/app?extension=success). The credits are granted by Whop's verified webhook, not by this page,
 * so this only waits for them to show up on the server meter (up to a minute) and then says so, in one kit toast that
 * updates in place. It never grants anything.
 */
export function ExtensionReturn({ onChanged }: { onChanged: () => void }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("extension") !== "success") return;
    url.searchParams.delete("extension");
    window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
    let live = true;
    const say = (title: string, tone: "neutral" | "success", duration: number) => { if (live) notify({ id: EXTENSION_TOAST_ID, title, tone, duration }); };
    window.setTimeout(() => say("Thanks. Confirming your purchase with Whop…", "neutral", 0), 0);
    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        const r = await fetch("/api/compute", { cache: "no-store" });
        const m = (await r.json().catch(() => null)) as Meter | null;
        const e = m?.extension;
        if (live && e && e.balance > 0 && e.latestGrantAt && Date.now() - Date.parse(e.latestGrantAt) < FRESH_MS) {
          say(`Your extra credits are in. ${extensionNote({ plan: m.plan, admin: m.admin, extension: e }) ?? ""}`.trim(), "success", 9000);
          onChanged();
          return;
        }
      } catch {
        /* try again */
      }
      if (!live) return;
      if (tries >= 20) {
        say("Still waiting for Whop to confirm the payment. Your credits appear here as soon as it does; there's nothing more to do.", "neutral", 12000);
        return;
      }
      window.setTimeout(() => void tick(), 3000);
    };
    void tick();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
