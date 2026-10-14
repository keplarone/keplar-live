"use client";

import { useEffect, useRef, useState } from "react";
import { activeScopeHeaders } from "../state/scope";
import { openDraft } from "./draft-bus";
import { Button, Tooltip } from "@/components/kit";
import s from "./parity.module.css";

/** Whether live voice is switched on for this person (src/lib/voice/realtime.ts). Hidden entirely when it isn't. */
export function useLiveVoice(signedIn: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!signedIn || typeof RTCPeerConnection === "undefined") return;
    let off = false;
    fetch("/api/voice/realtime", { cache: "no-store", headers: activeScopeHeaders() })
      .then((r) => (r.ok ? (r.json() as Promise<{ available: boolean }>) : null))
      .then((d) => { if (!off) setOn(Boolean(d?.available)); })
      .catch(() => undefined);
    return () => { off = true; };
  }, [signedIn]);
  return signedIn && on;
}

type Line = { who: "you" | "voice"; text: string };
const MAX_MS = 10 * 60_000;

/** Talk with Keplar out loud. One model answering live (not the cross-checked panel), so the transcript can go to a draft for checking. */
export function LiveVoice() {
  const [state, setState] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const pc = useRef<RTCPeerConnection | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<number | null>(null);

  const stop = (note = "") => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    pc.current?.close();
    pc.current = null;
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    setState("idle");
    setMsg(note);
  };
  useEffect(() => () => stop(), []);

  const start = async () => {
    setState("connecting");
    setMsg("Connecting...");
    setLines([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.current = stream;
      const conn = new RTCPeerConnection();
      pc.current = conn;
      conn.ontrack = (e) => { if (audio.current) audio.current.srcObject = e.streams[0]; };
      stream.getTracks().forEach((t) => conn.addTrack(t, stream));
      const dc = conn.createDataChannel("oai-events");
      dc.onmessage = (e) => {
        try {
          const ev = JSON.parse(String(e.data)) as { type?: string; transcript?: string };
          const text = ev.transcript?.trim();
          if (!text) return;
          if (ev.type === "conversation.item.input_audio_transcription.completed") setLines((l) => [...l, { who: "you", text }]);
          else if (ev.type === "response.output_audio_transcript.done" || ev.type === "response.audio_transcript.done") setLines((l) => [...l, { who: "voice", text }]);
        } catch { /* not an event we read */ }
      };
      conn.onconnectionstatechange = () => { if (conn.connectionState === "failed" || conn.connectionState === "disconnected") stop("The call dropped."); };
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      const r = await fetch("/api/voice/realtime", { method: "POST", headers: { ...activeScopeHeaders(), "content-type": "application/sdp" }, body: offer.sdp ?? "" });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || "Live voice isn't available right now.");
      }
      await conn.setRemoteDescription({ type: "answer", sdp: await r.text() });
      setState("live");
      setMsg("Live. Speak any time. Calls end after 10 minutes.");
      timer.current = window.setTimeout(() => stop("Call ended at the 10 minute limit."), MAX_MS);
    } catch (e) {
      stop();
      setState("error");
      setMsg(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in your browser to talk live." : e instanceof Error ? e.message : "Couldn't start live voice.");
    }
  };

  const toDraft = () => openDraft({ kind: "open", title: "Live voice transcript", markdown: lines.map((l) => `**${l.who === "you" ? "You" : "Keplar voice"}:** ${l.text}`).join("\n\n") });

  const busy = state === "connecting" || state === "live";
  return (
    <>
      <Tooltip content="Talk out loud with one model in real time. Not cross-checked by the panel.">
        <Button size="sm" variant="ghost" className={s.toggle} aria-pressed={busy} onClick={() => (busy ? stop("Call ended.") : void start())} data-live-voice="" leadingIcon={<span className={s.pip} aria-hidden="true" />}>
          {state === "live" ? "End live voice" : state === "connecting" ? "Connecting..." : "Talk live"}
        </Button>
      </Tooltip>
      {msg ? <span className={s.note} role="status">{msg}{state === "live" ? " One model, not cross-checked." : ""}</span> : null}
      {!busy && lines.length ? <Button size="sm" variant="ghost" onClick={toDraft}>Open transcript as a draft</Button> : null}
      <audio ref={audio} autoPlay hidden />
    </>
  );
}
