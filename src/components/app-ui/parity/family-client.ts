"use client";

import { useEffect, useState } from "react";
import { activeScopeHeaders } from "../state/scope";

let cached: { scope: string; p: Promise<boolean> } | null = null;
/** Is Family mode on for the signed-in account? (One check per page load and account.) Hides Private chat, Talk live and Posts on X. */
export function familyOn(): Promise<boolean> {
  const scope = JSON.stringify(activeScopeHeaders());
  if (!cached || cached.scope !== scope) {
    cached = { scope, p: fetch("/api/family", { cache: "no-store", headers: activeScopeHeaders() }).then((r) => (r.ok ? (r.json() as Promise<{ enabled: boolean }>) : { enabled: false })).then((d) => Boolean(d.enabled)).catch(() => false) };
  }
  return cached.p;
}

export function useFamilyMode(signedIn: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!signedIn) return;
    let off = false;
    void familyOn().then((v) => { if (!off) setOn(v); });
    return () => { off = true; };
  }, [signedIn]);
  return signedIn && on;
}
