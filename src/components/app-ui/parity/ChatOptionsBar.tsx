"use client";

import { useEffect, useState } from "react";
import { activeScopeHeaders } from "../state/scope";
import { LiveVoice, useLiveVoice } from "./LiveVoice";
import { useFamilyMode } from "./family-client";
import { Button } from "@/components/kit";
import s from "./parity.module.css";

export type SpecialistLite = { id: string; name: string; description: string; starters: string[] };

/** The signed-in person's specialists (loaded once per account; refreshed when the window regains focus). */
export function useSpecialists(signedIn: boolean, scope: string): SpecialistLite[] {
  const [list, setList] = useState<{ scope: string; items: SpecialistLite[] }>({ scope: "", items: [] });
  useEffect(() => {
    if (!signedIn) return;
    let off = false;
    const load = () =>
      fetch("/api/specialists", { cache: "no-store", headers: activeScopeHeaders() })
        .then((r) => (r.ok ? (r.json() as Promise<{ specialists: SpecialistLite[] }>) : null))
        .then((d) => { if (!off && d) setList({ scope, items: d.specialists.map(({ id, name, description, starters }) => ({ id, name, description, starters })) }); })
        .catch(() => undefined);
    void load();
    window.addEventListener("focus", load);
    return () => { off = true; window.removeEventListener("focus", load); };
  }, [signedIn, scope]);
  return signedIn && list.scope === scope ? list.items : [];
}

/**
 * Above the composer: the Specialist for this chat (signed in) and Talk live when live voice is switched on
 * (src/lib/voice/realtime.ts). Private chat and Record notes live in the composer's + menu.
 * Private chat is a request: the server also refuses to read or write memory for it; this browser keeps it out of history.
 */
export function ChatOptionsBar({
  specialists, specialistId, onSpecialist, signedIn,
}: {
  specialists: SpecialistLite[];
  specialistId: string | null;
  onSpecialist: (id: string | null) => void;
  signedIn: boolean;
}) {
  const current = specialists.find((x) => x.id === specialistId) ?? null;
  const family = useFamilyMode(signedIn); // Family mode: chats stay in history, no live voice (src/lib/personalize/family.ts)
  const showSpecialist = signedIn && specialists.length > 0;
  const voiceOn = useLiveVoice(signedIn);
  const showVoice = voiceOn && !family;
  if (!showSpecialist && !showVoice) return null;
  return (
    <div className={s.bar} data-chat-options="">
      {showSpecialist ? (
        <label className={s.row}>
          <span>Specialist</span>
          <select className={s.select} value={current?.id ?? ""} onChange={(e) => onSpecialist(e.target.value || null)} data-specialist-select="">
            <option value="">None</option>
            {specialists.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      ) : null}
      {showVoice ? <LiveVoice /> : null}
      <span className={s.note} role="status">
        {current?.description ? current.description : ""}
      </span>
    </div>
  );
}

/** Shown at the top of a private chat. */
export function PrivateBanner({ onClose }: { onClose: () => void }) {
  return (
    <div className={s.banner} role="note" data-private-banner="">
      <strong>Private chat</strong>
      <span>Not saved to your history, not used for memory or learning, and gone when you leave it or reload. Your answer preferences still apply.</span>
      <Button size="sm" variant="ghost" onClick={onClose}>Close private chat</Button>
    </div>
  );
}

/** A specialist's conversation starters, on an empty chat. */
export function SpecialistStarters({ specialist, onSend }: { specialist: SpecialistLite | null; onSend: (text: string) => void }) {
  if (!specialist || !specialist.starters.length) return null;
  return (
    <div className={s.tools} aria-label={`Starters for ${specialist.name}`}>
      <div className={s.row}>
        {specialist.starters.map((t) => <Button key={t} size="sm" variant="secondary" onClick={() => onSend(t)}>{t}</Button>)}
      </div>
    </div>
  );
}
