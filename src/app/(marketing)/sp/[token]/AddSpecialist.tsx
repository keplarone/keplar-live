"use client";

import { useState } from "react";
import Link from "next/link";
import s from "@/components/share/Shared.module.css";

/** "Add to my specialists": copies the shared setup into the visitor's account (sign in first). */
export function AddSpecialist({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "signin" | "error">("idle");
  const [msg, setMsg] = useState("");
  const add = async () => {
    setState("busy");
    try {
      const r = await fetch("/api/specialists/copy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      if (r.status === 401) { setState("signin"); return; }
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setState("error"); setMsg(d.error || "Couldn't add it. Try again."); return; }
      setState("done");
    } catch { setState("error"); setMsg("Couldn't reach Keplar. Try again."); }
  };
  return (
    <div className={s.cta} style={{ marginTop: "var(--s-6)" }}>
      {state === "done" ? (
        <>
          <span role="status">Added to your specialists.</span>
          <Link className={s.btn} href="/app">Use it in a chat</Link>
        </>
      ) : state === "signin" ? (
        <Link className={s.btn} href={`/signin?next=${encodeURIComponent(`/sp/${token}`)}`}>Sign in to add it</Link>
      ) : (
        <button type="button" className={s.btn} style={{ border: 0, font: "inherit", cursor: "pointer" }} disabled={state === "busy"} onClick={() => void add()}>
          {state === "busy" ? "Adding..." : "Add to my specialists"}
        </button>
      )}
      {state === "error" ? <span role="alert">{msg}</span> : null}
    </div>
  );
}
