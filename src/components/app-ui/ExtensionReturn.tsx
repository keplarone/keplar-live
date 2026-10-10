"use client";

import { useEffect, useState } from "react";
import { extensionNote } from "@/lib/usage/meter";
import type { Ledger } from "./state/types";
import s from "./limit-extensions.module.css";
import { Presence } from "@/components/motion/usePresence";

type Meter = { plan: Ledger["plan"]; admin?: boolean; extension?: Ledger["extension"] };
const FRESH_MS = 15 * 60_000;

/**
 * Back from Whop checkout (/app?extension=success). The credits are granted by Whop's verified webhook, not by this page,
 * so this only waits for them to show up on the server meter (up to a minute) and then says so. It never grants anything.
 */
export function ExtensionReturn({ onChanged }: { onChanged: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("extension") !== "success") return;
    url.searchParams.delete("extension");
    window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
    let live = true;
    window.setTimeout(() => live && setMsg("Thanks. Confirming your purchase with Whop…"), 0);
    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        const r = await fetch("/api/compute", { cache: "no-store" });
        const m = (await r.json().catch(() => null)) as Meter | null;
        const e = m?.extension;
        if (live && e && e.balance > 0 && e.latestGrantAt && Date.now() - Date.parse(e.latestGrantAt) < FRESH_MS) {
          setMsg(`Your extra credits are in. ${extensionNote({ plan: m.plan, admin: m.admin, extension: e }) ?? ""}`.trim());
          onChanged();
          window.setTimeout(() => live && setMsg(null), 9000);
          return;
        }
      } catch {
        /* try again */
      }
      if (!live) return;
      if (tries >= 20) {
        setMsg("Still waiting for Whop to confirm the payment. Your credits appear here as soon as it does; there's nothing more to do.");
        window.setTimeout(() => live && setMsg(null), 12000);
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

  return (
    <Presence value={msg}>
      {(text, p) => (
        <div className={s.toast} role="status" data-extension-return="" {...p.motion("toast")}>
          {text}
        </div>
      )}
    </Presence>
  );
}
