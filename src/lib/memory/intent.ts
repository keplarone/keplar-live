/**
 * Memory commands typed in chat: "forget that", "erase my memory", "delete everything you know about me",
 * "remember that ...". Handled deterministically BEFORE the engine, like the creator question: no model call,
 * no cost, and the reply says plainly what happened.
 *
 * The classifier is conservative: the WHOLE message must be the command. "Forget that Paris is in France",
 * "remember the Alamo", a question, code, a link, or a message with attachments all fall through to the engine.
 */
import type { KeplarRequest } from "@/lib/orchestration/types";

export type MemoryIntent =
  | { kind: "forget-last" }
  | { kind: "erase-all"; chats: boolean }
  | { kind: "remember"; text: string }
  | { kind: "toggle"; enabled: boolean }
  | { kind: "list" };

type Probe = Pick<KeplarRequest, "prompt" | "attachments" | "media" | "modes">;

const LEAD = /^(?:(?:hey|hi|ok|okay|so|and|please|pls|keplar|kepler|now|just|can you|could you|would you|will you|i want you to|i['’]?d like you to|i need you to|go ahead and)\b[ ,]*)+/;
const TRAIL = /(?: (?:please|pls|now|thanks|thank you|for me|right now|ok|okay))+$/;

const norm = (s: string) =>
  s.toLowerCase().replace(/[\u2018\u2019\u02bc`]/g, "'").replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, " ").replace(/[^a-z0-9'\s:,]/g, " ").replace(/\s+/g, " ").trim();

const FORGET_LAST = /^(?:(?:forget|delete|remove|erase|unsave|disregard) (?:that|this|it|that last thing|the last thing(?: i (?:told|said to) you| i said)?|what i (?:just )?(?:said|told you)|that last (?:fact|note|memory))|(?:do not|don't|dont) (?:remember|save|keep) (?:that|this|it)|never ?mind(?:,)? forget (?:that|it))$/;
const ERASE_ALL = /^(?:(?:erase|delete|wipe|clear|remove|reset|forget) (?:all (?:of )?)?(?:my )?(?:memory|memories|long term memory|saved memory|saved memories)|(?:erase|delete|wipe|clear|remove|forget) (?:all (?:of )?)?(?:everything|all) (?:that )?(?:you (?:know|remember|have saved|saved|stored)|you['’]?ve saved) about me|(?:erase|delete|wipe|clear|remove|forget) (?:everything|all) about me|(?:erase|delete|wipe|clear|remove|forget) (?:what|everything) you (?:know|remember) about me|(?:erase|delete|wipe|clear|forget) me)(?: (?:and|plus|including|along with) (?:also )?(?:delete |erase |clear |wipe )?(?:all )?(?:of )?(?:my )?(chat|chats|chat history|conversations?|history|saved chats|saved conversations))?$/;
const TOGGLE = /^(?:turn|switch|toggle|set) (?:my )?memory (off|on)$|^(?:stop|disable) (?:remembering(?: things| stuff| anything)?(?: about me)?|memory|saving memories)$|^(?:enable|start) (?:memory|remembering(?: things)?)$/;
const LIST = /^(?:what|show me what|tell me what) (?:do )?you (?:remember|know|have saved) about me$|^(?:show|list|see|view) (?:my )?(?:memory|memories|saved memories)$/;
const REMEMBER = /^(?:remember|keep in mind|note|save|store)(?: that|:| this:?)\s+(.+)$|^(?:remember|keep in mind) ((?:i|i'm|im|i am|i've|ive|my|we|our|to call me)\b.+)$|^(?:don't|do not|dont) forget(?: that)?\s+((?:i|i'm|im|i am|my|we|our)\b.+)$/i;

/** The memory command in a message, or null for anything else. Pure; no network. */
export function memoryIntent(req: Probe): MemoryIntent | null {
  const raw = req.prompt ?? "";
  if (!raw.trim() || raw.length > 400) return null;
  if (req.attachments?.length) return null;
  if (req.media && (req.media.images?.length || req.media.videos?.length)) return null;
  if (req.modes && Object.values(req.modes).some(Boolean)) return null;
  if (/[`{}<>\\|~[\]]|https?:|www\./i.test(raw)) return null;
  if (/\?\s*$/.test(raw.trim())) return null;
  const sentences = raw.split(/[.!;]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length > 2) return null;
  let text = norm(raw);
  for (let i = 0; i < 4; i++) {
    const before = text;
    text = text.replace(LEAD, "").replace(TRAIL, "").trim();
    if (text === before) break;
  }
  if (!text) return null;
  if (FORGET_LAST.test(text)) return { kind: "forget-last" };
  const all = ERASE_ALL.exec(text);
  if (all) return { kind: "erase-all", chats: Boolean(all[1]) };
  const t = TOGGLE.exec(text);
  if (t) return { kind: "toggle", enabled: t[1] ? t[1] === "on" : /^(?:enable|start)/.test(text) };
  if (LIST.test(text)) return { kind: "list" };
  const r = REMEMBER.exec(raw.trim().replace(/^(?:(?:hey|hi|ok|okay|so|please|pls|keplar)[ ,]+)+/i, "").replace(/\s+/g, " "));
  if (r) {
    const fact = (r[1] ?? r[2] ?? r[3] ?? "").trim().replace(/[.!\s]+$/, "");
    if (fact.length >= 3 && fact.split(" ").length <= 40) return { kind: "remember", text: fact };
  }
  return null;
}
