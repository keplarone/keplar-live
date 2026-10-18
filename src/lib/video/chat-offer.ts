/**
 * What the chat may ask before a clip starts: only 16:9 and 9:16, and only durations the chosen model and the plan both allow.
 * A shape or length the message already stated (and the model accepts) is not asked again. The last confirmed choice is the
 * default highlight the next time a question is shown; it never skips a question the message left open.
 */
import { defaultHfModel, type HfModel } from "@/lib/higgsfield/catalog";
import type { ChatAspect, VideoIntent } from "./chat-intent";

export const CHAT_ASPECTS: readonly ChatAspect[] = ["16:9", "9:16"];

export type VideoOffer = { aspects: ChatAspect[]; durations: number[] };

/** Durations and shapes the text-to-video model documents, cut by the plan's max seconds. */
export function chatVideoOffer(model: Pick<HfModel, "durations" | "aspectRatios">, maxSeconds: number): VideoOffer {
  const cap = Math.max(0, maxSeconds);
  const aspects = CHAT_ASPECTS.filter((a) => model.aspectRatios.includes(a));
  const durations = (model.durations ?? []).filter((d) => d >= 1 && d <= cap);
  return { aspects, durations };
}

/** The default text-to-video model (Seedance 2.0) at a plan's max length. */
export function defaultChatOffer(maxSeconds: number): VideoOffer {
  const model = defaultHfModel("video");
  if (!model) return { aspects: [], durations: [] };
  return chatVideoOffer(model, maxSeconds);
}

export type RememberedVideo = { aspect?: ChatAspect; duration?: number };

export type VideoQuestions = {
  /** True when the message did not name a shape the model accepts. */
  askAspect: boolean;
  /** True when the message did not name a length the model accepts. */
  askDuration: boolean;
  /** Highlighted shape: the stated one, else the remembered one, else the first offered. */
  aspect: ChatAspect;
  /** Highlighted length, same order. */
  duration: number;
  /** Both were named in the message and both are allowed: start without asking. */
  ready: boolean;
};

export function planVideoQuestions(intent: Pick<VideoIntent, "aspect" | "durationSec"> & { needsSubject?: boolean }, offer: VideoOffer, remembered: RememberedVideo = {}): VideoQuestions | null {
  if (!offer.aspects.length || !offer.durations.length) return null;
  const statedAspect = intent.aspect && offer.aspects.includes(intent.aspect) ? intent.aspect : null;
  const statedDuration = intent.durationSec !== null && offer.durations.includes(intent.durationSec) ? intent.durationSec : null;
  const aspect = statedAspect ?? (remembered.aspect && offer.aspects.includes(remembered.aspect) ? remembered.aspect : offer.aspects[0]);
  const duration = statedDuration ?? (remembered.duration !== undefined && offer.durations.includes(remembered.duration) ? remembered.duration : (offer.durations.includes(5) ? 5 : offer.durations[0]));
  const askAspect = statedAspect === null;
  const askDuration = statedDuration === null;
  return { askAspect, askDuration, aspect, duration, ready: !askAspect && !askDuration && intent.needsSubject !== true };
}

const PREF_KEY = "keplar:chat-video";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function readVideoPrefs(storage: StorageLike | null = typeof window === "undefined" ? null : safeLocal()): RememberedVideo {
  try {
    const raw = storage?.getItem(PREF_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as { aspect?: unknown; duration?: unknown };
    const aspect = p.aspect === "16:9" || p.aspect === "9:16" ? p.aspect : undefined;
    const duration = typeof p.duration === "number" && Number.isInteger(p.duration) && p.duration > 0 && p.duration <= 60 ? p.duration : undefined;
    return { ...(aspect ? { aspect } : {}), ...(duration ? { duration } : {}) };
  } catch {
    return {};
  }
}

export function writeVideoPrefs(aspect: ChatAspect, duration: number, storage: StorageLike | null = typeof window === "undefined" ? null : safeLocal()): void {
  try {
    storage?.setItem(PREF_KEY, JSON.stringify({ aspect, duration }));
  } catch {
    /* storage blocked: the next card still works, it just has no remembered default */
  }
}

function safeLocal(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Whether a finished file matches what was asked. Aspect within 8% (encoders pad), length within 0.75s.
 * Width or duration of 0 means the file has not reported metadata yet: not a mismatch.
 */
export function outputMatches(asked: { aspect: ChatAspect; durationSec: number }, actual: { width: number; height: number; durationSec: number }): { aspect: boolean; duration: boolean; pending: boolean } {
  if (!(actual.width > 0) || !(actual.height > 0) || !(actual.durationSec > 0)) return { aspect: true, duration: true, pending: true };
  const ratio = actual.width / actual.height;
  const want = asked.aspect === "16:9" ? 16 / 9 : 9 / 16;
  return {
    aspect: Math.abs(ratio - want) / want <= 0.08,
    duration: Math.abs(actual.durationSec - asked.durationSec) <= 0.75,
    pending: false,
  };
}
