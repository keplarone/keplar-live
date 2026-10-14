"use client";
import { useEffect, useRef, useState } from "react";
import { IconButton, Tooltip } from "@/components/kit";
import { IconSpeaker, IconStopSquare } from "./icons";
import { clearSpeechError, disarmReadback, shouldAutoRead, speakAnswer, speechSupported, stopSpeaking, useSpeech } from "./speech";

/**
 * "Listen" in an answer card's footer (Voice mode, BETA): reads the answer aloud with the browser's voice; tap again to stop.
 * Hidden where the browser can't read aloud. After a question asked by voice, the newest answer reads itself once.
 */
export function ListenButton({ id, markdown, isLast, className }: { id: string; markdown: string; isLast: boolean; className: string }) {
  const sp = useSpeech();
  const [ok, setOk] = useState(false);
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
    const t = window.setTimeout(() => setOk(speechSupported()), 0); // after hydration
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!ok || !isLast || !shouldAutoRead(mountedAt.current)) return;
    disarmReadback();
    speakAnswer(id, markdown);
  }, [ok, isLast, id, markdown]);
  if (!ok) return null;
  const playing = sp.speakingId === id;
  return (
    <>
      <Tooltip content={playing ? "Stop. Escape also stops." : "Listen to this answer (beta). Your browser's voice reads it; Keplar doesn't record or store audio."}>
        <IconButton
          size="sm"
          className={className}
          tooltip={false}
          pressed={playing}
          label={playing ? "Stop reading the answer aloud" : "Listen to the answer (beta)"}
          data-listen={playing ? "on" : "off"}
          onClick={() => { clearSpeechError(); disarmReadback(); if (playing) stopSpeaking(); else speakAnswer(id, markdown); }}
          icon={playing ? <IconStopSquare size={15} /> : <IconSpeaker size={15} />}
        />
      </Tooltip>
      <span className="visually-hidden" role="status" aria-live="polite">
        {playing ? `Reading the answer aloud.${sp.truncated ? " Only the first part of this long answer is read." : ""} Press Escape or the stop button to stop.` : sp.error && sp.speakingId === null && isLast ? sp.error : ""}
      </span>
    </>
  );
}
