"use client";

import { SEND_EVENT } from "@/lib/spatial/events";
import { spaceFx } from "@/lib/fx/space-fx";
import { forwardRef, useCallback, useDeferredValue, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { hasResearchBridge, noSubscribe, researchCapabilities } from "@/lib/desktop/research-bridge";
import { wantsLiveResearch } from "./state/live-run";
import { readDraft, writeDraft } from "./drafts";
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { computeLevel, computeLevelLabel } from "@/lib/orchestration/compute";
import { CostAwareRouter } from "@/lib/orchestration/router";
import { DEBATE_POLICY, debateCostFactor } from "@/lib/orchestration/debate";
import { DEEP_RESEARCH_UNITS, deepResearchRunsLeft, formatResetAt } from "@/lib/orchestration/plans";
import { brand } from "@/lib/site";
import Link from "next/link";
import { providerFamilies } from "@/lib/orchestration/catalog";
import type { Depth } from "@/lib/core/types";
import type { Attachment, ComposerModes, RoutingPreferences, RoutingStrategy } from "@/lib/orchestration/types";
import { MEDIA_LIMITS, type MediaInput } from "@/lib/orchestration/media";
import { IconMic, IconPlus, IconDebate, IconDeep, IconCreate, IconImage, IconMore, IconReason, IconRouting, IconSlides, IconStop, IconStudy, IconWeb } from "./icons";
import { toggleMode, type ModeKey } from "@/lib/composer/modes";
import { canUseSlides, slidesLimitsFor } from "@/lib/tools/limits";
import { estimateDeckCredits } from "@/lib/slides/estimate";
import { deckRequestFrom } from "@/lib/slides/from-chat";
import { fmtClock } from "./media-client";
import { AttachTray, type TrayItem } from "./AttachTray";
import { Lightbox } from "./Lightbox";
import { ACCEPT_ALL, hostOf, isDocKind, KIND_NAME, kindOfFile, limitsForPlan, MAX_FILES, READS, urlsIn, type AttachKind } from "@/lib/attachments/kinds";
import { DocUploadError, readDocument, forgetDocument, keepTranscript, readLink, type LinkPreview } from "./doc-client";
import { AudioTooLongError, NoAudioError, transcribe } from "./audio-client";
import { GLYPH, GlyphCamera, GlyphLink, GlyphUpload } from "./attach-glyphs";
import { FREE_DOCS_NOT_SENT } from "@/lib/privacy/free-gate";
import { fmtSize, IMAGE_BUDGET_TOTAL, mediaChars, prepareImage, prepareVideo, VideoTooLongError, type ComposerMedia, type MediaKind } from "./media-client";
import type { Ledger, MessageMedia } from "./state/types";
import { useVoice } from "./useVoice";
import { VoiceTalk } from "./VoiceTalk";
import { armReadback, disarmReadback, stopSpeaking } from "./speech";
import { voiceStatusText } from "@/lib/voice";
import { usePrefs } from "@/lib/use-prefs";
import s from "./Composer.module.css";
import { Button, Icon as KitIcon, IconButton, Popover } from "@/components/kit";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { useScreenShare } from "./screen-share";
import {
  activeSlashToken,
  expandSlashCommand,
  filterSlashCommands,
  type SlashCommand,
} from "@/lib/images/slash-commands";
import { chatSlashToken, filterChatCommands, type ChatCommand } from "@/lib/chat-actions/intent";

export type ComposerHandle = { focus: () => void; setText: (t: string) => void; setModes: (m: Partial<ComposerModes>) => void };

type Props = {
  running: boolean;
  onSend: (text: string, attachments: Attachment[], modes: ComposerModes, media?: MessageMedia[]) => void;
  onStop: () => void;
  routing: RoutingPreferences;
  onRouting: (r: RoutingPreferences) => void;
  placeholder: string;
  /** Remaining Keplar Usage units this period . */
  computeRemaining: number;
  /** Billing-period end from the server meter. */
  resetsAt?: string | null;
  /** Caller's plan (server meter): Free shows the free-host logging note for media. */
  plan?: Ledger["plan"];
  /** Signed in (server meter). Study and Slides save to the account, so their notes say when signing in is needed. */
  signedIn?: boolean;
  /** The modes as they change (the sidebar highlights Study / Slides while their chip is on). */
  onModesChange?: (m: ComposerModes) => void;
  /** Session continuity (drafts.ts): this chat's unsent draft is restored and kept as it is typed. null = keep nothing (private chats). */
  draftKey?: string | null;
};

const MB = 1024 * 1024;
const LIMITS_TEXT = `Up to ${MEDIA_LIMITS.maxImages} images (${MEDIA_LIMITS.maxImageBytes / MB} MB each), 1 video (${MEDIA_LIMITS.maxVideoBytes / MB} MB, ${MEDIA_LIMITS.maxVideoSeconds / 60} min, audio transcribed), ${MAX_FILES} files (4 MB each) and a few links`;
const FREE_MEDIA_NOTE = "Free plan: media and links go to free model hosts that may log prompts";
const PAID_MEDIA_NOTE = "Attachments are read for this answer only and aren't stored";

type DocItem = { id: string; name: string; size: number; type: string; kind: AttachKind; status: "processing" | "ready" | "warn"; progress?: number; stage?: string; pages?: number; truncated?: boolean; summary?: string; note?: string; warnShort?: string; attachment?: Attachment };
type LinkItem = { id: string; url: string; status: "processing" | "ready" | "warn"; read?: LinkPreview; attachment?: Attachment; pinned?: boolean; note?: string };
type AudioTrack = { status: "processing" | "ready" | "none" | "failed"; progress?: number; attachment?: Attachment; note?: string };

const newId = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/** The media part of a request, from composer items (ready ones only). */
export function toMediaInput(items: { kind: MediaKind; name: string; images?: MediaInput["images"]; durationSec?: number }[]): MediaInput | undefined {
  const images = items.flatMap((m) => m.images ?? []);
  if (!images.length) return undefined;
  const videos = items.filter((m) => m.kind === "video" && m.images?.length).map((m) => ({ name: m.name, durationSec: m.durationSec ?? 0, frames: m.images!.length }));
  return { images, videos };
}

/** Live Research (Keplar One desktop app 0.2.0+): in the desktop app, Web and Deep Research search and read pages on this computer first. */
const LIVE_WEB_HINT = "Live Research: the Keplar desktop app searches the web and reads the pages on this computer, then Keplar answers with citations";
const LIVE_DEPTHS = [
  { id: "auto", label: "Auto", hint: "The desktop app picks the depth from the question (Deep Research: deep)" },
  { id: "fast", label: "Fast", hint: "A few fresh sources and one model: quick, current facts" },
  { id: "standard", label: "Standard", hint: "Several sources, compared" },
  { id: "deep", label: "Deep", hint: "Many sources, followed references and a full panel. Takes longer" },
] as const;

const tools: { key: ModeKey; label: string; Icon: typeof IconWeb; hint: string }[] = [
  { key: "web", label: "Web", Icon: IconWeb, hint: "Web retrieval isn't live yet in this preview" },
  { key: "study", label: "Study", Icon: IconStudy, hint: "Learn it: Keplar answers, then turns the answer (or your attached notes) into a study set with an outline, flashcards and a quiz" },
  { key: "slides", label: "Slides", Icon: IconSlides, hint: "Make a deck: Keplar writes the slides from your message, then you edit, present and export them (Plus and Pro)" },
  { key: "reason", label: "Reason", Icon: IconReason, hint: "Work it through step by step and show how the answer was checked. Paid plans also add a model to the panel" },
  { key: "deepResearch", label: "Deep Research", Icon: IconDeep, hint: "Longer, multi-step research. Uses more usage" },
  { key: "debate", label: "Debate", Icon: IconDebate, hint: "The models argue in rounds and read each other's points, then Keplar writes one answer. Uses more usage" },
  { key: "create", label: "Create", Icon: IconCreate, hint: "Build an app, image, video or document" },
  { key: "image", label: "Create image", Icon: IconImage, hint: "Make a picture from this message (Plus and Pro). Attach an image to use it as a reference" },
];

/**
 * Modes that are off live in the one quiet "Modes" menu (listed in this order of precedence); an active chip always stays in the row, and
 * on a row too narrow even for that it moves into the menu too. Attach (+), Voice and Talk never move (Talk is press-and-hold, which a menu can't do).
 */
/** One short line per mode for the Modes menu (the full hint stays as the tooltip). Agent mode is business-only (business.keplar.one). */
const BLURB: Partial<Record<ModeKey, string>> = {
  web: "Search the live web",
  study: "Flashcards and a quiz",
  slides: "A deck from your message",
  reason: "Step by step, checked",
  deepResearch: "Long, multi-step research",
  debate: "Models argue in rounds",
  create: "Apps, images, video, docs",
  image: "A picture from this message",
};

const OVERFLOW_ORDER: ModeKey[] = ["image", "web", "reason", "debate", "create", "deepResearch", "slides", "study"];

/** Keplar Core depth (src/lib/core). Auto decides per question and escalates when the models disagree. */
const DEPTH_OPTIONS: { id: Depth; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Keplar decides: clear questions get a direct answer; hard ones get a plan, checked steps and a final review." },
  { id: "quick", label: "Quick", hint: "One direct pass. Fastest." },
  { id: "thorough", label: "Thorough", hint: "Plans the work, checks each step (running the math or code when it can) and reviews the answer before showing it." },
  { id: "exhaustive", label: "Exhaustive", hint: "Keeps planning, checking and revising until the answer passes, within your plan's limits. Can keep working in the background." },
];

const strategies: { id: RoutingStrategy; label: string; hint: string }[] = [
  { id: "auto", label: "Automatic", hint: `${brand.engineName} decides per question` },
  { id: "fast", label: "Fastest", hint: "Fewer models, no judge" },
  { id: "balanced", label: "Balanced", hint: "Standard panel sizes" },
  { id: "thorough", label: "Most thorough", hint: "One more model; simple questions get a panel too" },
];

const classifier = new HeuristicClassifier();
const router = new CostAwareRouter();


export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { running, onSend, onStop, routing, onRouting, placeholder, computeRemaining, resetsAt, plan, signedIn, onModesChange, draftKey = null },
  ref,
) {
  const uid = useId();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const prefs = usePrefs();
  const [text, setTextState] = useState("");
  /** Space UI: the composer gives a short squeeze-and-glow as a question leaves it (alternates a/b so each send restarts it). */
  const [pulse, setPulse] = useState<"a" | "b" | undefined>(undefined);
  // The latest text, updated synchronously (typing and dictation both write here), so dictation never mistakes its own write for an edit.
  const textRef = useRef("");
  // The textarea is UNCONTROLLED: the DOM owns the value, so native undo/redo, IME composition and the caret are never
  // disturbed by React. Programmatic writes (dictation, seeds, clearing after send) go through here.
  const setText = useCallback((v: string) => {
    textRef.current = v;
    const ta = taRef.current;
    if (ta && ta.value !== v) ta.value = v;
    setTextState(v);
  }, []);
  const voice = useVoice({ getText: () => textRef.current, setText });
  // Drafts (drafts.ts): opening a chat shows its unsent draft; typing keeps it (debounced); sending clears it (the text goes blank).
  const draftFor = useRef<string | null>(null);
  useEffect(() => {
    // Switching chats: keep what was just typed in the previous one (a pending debounced save is cancelled below), then load this one's.
    if (draftFor.current && draftFor.current !== draftKey) writeDraft(draftFor.current, textRef.current);
    draftFor.current = draftKey;
    if (draftKey === null) return;
    setText(readDraft(draftKey) ?? "");
  }, [draftKey, setText]);
  useEffect(() => {
    if (draftKey === null) return;
    const t = setTimeout(() => writeDraft(draftKey, text), 400);
    return () => clearTimeout(t);
  }, [draftKey, text]);
  /** Voice mode (BETA): a note about voice that isn't an error, and the "ask by voice" hand-off. */
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [voiceAsk, setVoiceAsk] = useState(0);
  const askedByVoice = useRef(false);
  const [media, setMedia] = useState<ComposerMedia[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  /* documents (PDF, text, code, CSV): read on the server, their text travels with the question for this message only */
  const [docs, setDocs] = useState<DocItem[]>([]);
  /* links pasted or typed in the message (and added from the Attach menu): read on the server, shown as chips */
  const [links, setLinks] = useState<LinkItem[]>([]);
  const linksRef = useRef(links);
  useEffect(() => { linksRef.current = links; }, [links]);
  const dismissed = useRef(new Set<string>());
  /* the spoken audio of an attached video, transcribed after its frames */
  const [tracks, setTracks] = useState<Record<string, AudioTrack>>({});
  const [attachOpen, setAttachOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const attachLimits = limitsForPlan(signedIn === false ? "free" : plan);
  const [viewer, setViewer] = useState<{ src: string; name: string; dims?: string } | null>(null);
  const [announce, setAnnounce] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const mediaRef = useRef(media);
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  const trayRef = useRef<HTMLUListElement>(null);
  const [modes, setModes] = useState<ComposerModes>({ web: false, deepResearch: false, create: false, agent: false });
  // The desktop app's Live Research bridge (SSR and the first render see false, so the web page never changes).
  const liveDesktop = useSyncExternalStore(noSubscribe, hasResearchBridge, () => false);
  // Live Research is turned on in the desktop app (it can be off there while the bridge exists): asked once.
  const [liveEnabled, setLiveEnabled] = useState(false);
  useEffect(() => {
    if (!liveDesktop) return;
    let alive = true;
    void researchCapabilities().then((c) => { if (alive) setLiveEnabled(Boolean(c)); });
    return () => { alive = false; };
  }, [liveDesktop]);
  // These modes run Live Research (KeplarApp.run uses the same rule): only then does the composer offer its depth and drop the server
  // Deep Research budget gate. Small talk sent with them never goes as Deep Research (KeplarApp.run), so the text doesn't matter here.
  const liveOn = liveDesktop && liveEnabled && wantsLiveResearch(modes);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("/");
  const [slashActive, setSlashActive] = useState(0);
  const [slashRange, setSlashRange] = useState<{ start: number; end: number } | null>(null);
  // "/" opens the image commands while Create image is on, and the chat's own commands (/slides, /quiz, /approvals ...) otherwise.
  const [slashKind, setSlashKind] = useState<"image" | "chat">("image");
  const slashItems = useMemo<(SlashCommand | ChatCommand)[]>(() => (!slashOpen ? [] : slashKind === "chat" ? filterChatCommands(slashQuery) : filterSlashCommands(slashQuery)), [slashOpen, slashQuery, slashKind]);
  const slashListId = `${uid}-slash`;
  useEffect(() => {
    if (slashOpen && (slashKind === "image") !== Boolean(modes.image)) setSlashOpen(false);
  }, [modes.image, slashOpen, slashKind]);
  const [routingOpen, setRoutingOpen] = useState(false);
  const modesChanged = useRef(onModesChange);
  useEffect(() => { modesChanged.current = onModesChange; });
  useEffect(() => { modesChanged.current?.(modes); }, [modes]);
  /* "More": mode chips that don't fit the row (measured on the live row, so it follows the container-query label steps) */
  const toolsRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [overflow, setOverflow] = useState<ModeKey[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const pressedKeys = tools.filter((t) => modes[t.key]).map((t) => t.key).join(",");
  useLayoutEffect(() => {
    const row = toolsRef.current;
    const more = moreBtnRef.current;
    if (!row || !more || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const chips = [...row.querySelectorAll<HTMLElement>("[data-mode]")];
      chips.forEach((el) => { el.removeAttribute("data-overflow"); el.removeAttribute("data-compact"); });
      more.setAttribute("data-show", "");
      const cs = getComputedStyle(row);
      const gap = parseFloat(cs.columnGap) || 0;
      const avail = row.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const moreW = more.offsetWidth;
      more.removeAttribute("data-show");
      const fixed = [...row.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== more && !el.dataset.mode && el.offsetWidth > 0);
      const width = new Map(chips.map((el) => [el.dataset.mode as ModeKey, el.offsetWidth]));
      const shown = new Set(width.keys());
      const total = () => {
        const n = fixed.length + shown.size;
        return fixed.reduce((a, el) => a + el.offsetWidth, 0) + [...shown].reduce((a, k) => a + (width.get(k) ?? 0), 0) + gap * Math.max(0, n - 1);
      };
      const pinned = new Set(pressedKeys.split(",").filter(Boolean));
      // Calm bar: every mode that is off lives in the one quiet "Modes" menu; a mode that is on shows in the row, so the bar still
      // says what the next message does. (Before, all eleven chips showed whenever they fit.)
      const hidden: ModeKey[] = [];
      for (const k of OVERFLOW_ORDER) {
        if (!shown.has(k) || pinned.has(k)) continue;
        shown.delete(k);
        hidden.push(k);
      }
      // Still too wide with only the pinned (pressed) chips left: they drop their labels too (CSS [data-compact]).
      if (total() + (hidden.length ? gap + moreW : 0) > avail + 0.5) {
        for (const el of chips) {
          const k = el.dataset.mode as ModeKey;
          if (!pinned.has(k) || !shown.has(k)) continue;
          el.setAttribute("data-compact", "");
          width.set(k, el.offsetWidth);
        }
      }
      // A phone row that can't even hold a pressed icon beside More: the pressed chip goes into More too, and More itself shows as pressed.
      if (total() + gap + moreW > avail + 0.5) {
        for (const k of [...pinned] as ModeKey[]) if (shown.has(k)) { shown.delete(k); hidden.push(k); }
      }
      chips.forEach((el) => { if (hidden.includes(el.dataset.mode as ModeKey)) el.setAttribute("data-overflow", ""); });
      if (hidden.length) more.setAttribute("data-show", "");
      if (hidden.some((k) => pinned.has(k))) more.setAttribute("data-active", ""); else more.removeAttribute("data-active");
      const next = tools.map((t) => t.key).filter((k) => hidden.includes(k));
      setOverflow((prev) => (prev.join() === next.join() ? prev : next));
    };
    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(row.parentElement ?? row);
    return () => ro.disconnect();
  }, [pressedKeys, voice.state, voice.supported]);
  useEffect(() => {
    if (!overflow.length) setMoreOpen(false);
  }, [overflow.length]);
  const fileRef = useRef<HTMLInputElement>(null);
  const routingBtnRef = useRef<HTMLButtonElement>(null);
  /*
   * Attach, Modes and Advanced routing are kit Popovers (opaque, top layer; a press outside or Tab closes them). They are anchored
   * to an invisible box over the whole composer, not to their buttons, so they open clear of the text being typed: below the
   * centred composer on the empty home, above it in a chat (whichever side has more room), and get that much height.
   * Escape closes and returns focus to the button that opened it; Up/Down (wrapping), Home/End move between the items.
   */
  const wrapRef = useRef<HTMLDivElement>(null);
  const popAnchorRef = useRef<HTMLSpanElement>(null);
  const [pop, setPop] = useState<{ side: "above" | "below"; room: number }>({ side: "above", room: 560 });
  useLayoutEffect(() => {
    if (!(attachOpen || moreOpen || routingOpen)) return;
    const w = wrapRef.current;
    if (!w) return;
    const place = () => {
      const r = w.getBoundingClientRect();
      const above = r.top - 16;
      const below = window.innerHeight - r.bottom - 16;
      const side = below >= 300 || below > above ? "below" : "above";
      setPop({ side, room: Math.max(140, Math.floor(side === "below" ? below : above)) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [attachOpen, moreOpen, routingOpen]);
  const popSide = pop.side === "below" ? "bottom" : "top";
  // A press outside closes a pop-up (the Popover); when that press was on the button that opened it, its click must not reopen it.
  const popClosedAt = useRef(0);
  const closeOnOutside = (set: (v: boolean) => void) => (open: boolean) => { if (!open) { popClosedAt.current = performance.now(); set(false); } };
  const toggleFrom = (set: (f: (v: boolean) => boolean) => void) => () => { if (performance.now() - popClosedAt.current > 300) set((v) => !v); };
  /** Keys inside a composer pop-up: Escape back to its button; arrows between `items` (the link field counts as an item). */
  const popKeys = (close: () => void, button: React.RefObject<HTMLButtonElement | null>, items: string) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      button.current?.focus({ preventScroll: true });
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) || !items) return;
    const list = [...e.currentTarget.querySelectorAll<HTMLElement>(items)];
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.target instanceof HTMLInputElement && (e.key === "Home" || e.key === "End")) return; // the link field keeps its caret keys
    e.preventDefault();
    const n = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : e.key === "ArrowDown" ? i + 1 : i < 0 ? list.length - 1 : i - 1;
    list[(n + list.length) % list.length]?.focus();
  };

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    setText: (t) => {
      setText(t);
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(t.length, t.length);
      });
    },
    setModes: (m) => setModes((prev) => ({ ...prev, ...m })),
  }));

  // Auto-size the textarea up to a limit. Browsers with `field-sizing: content` (see .input) size it natively with no
  // per-keystroke layout read; the rest fall back to measuring scrollHeight.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [text]);

  // Let the spatial layer reflect dictation (restrained): a window event plus a data attribute on the form.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("keplar:voice", { detail: { state: voice.state } }));
  }, [voice.state]);

  const trayItems = useMemo<TrayItem[]>(() => [
    ...links.map((l): TrayItem => {
      const r = l.read;
      return {
        id: l.id,
        name: r ? r.title || r.host : hostOf(l.url),
        kind: "link",
        status: l.status,
        favicon: r?.kind === "youtube" ? undefined : r?.favicon ?? `https://${hostOf(l.url)}/favicon.ico`,
        thumb: r?.kind === "youtube" ? r.image : undefined,
        badge: r?.kind === "youtube" ? "YT" : undefined,
        host: r?.host ?? hostOf(l.url),
        href: r?.finalUrl ?? l.url,
        note: l.note,
        sub: l.status === "processing" ? `Reading ${hostOf(l.url)}…` : l.status === "warn" && !r ? l.note ?? "Couldn't read" : `${r?.host ?? hostOf(l.url)} · ${r?.summary ?? ""}${r?.truncated ? " · first part" : ""}`,
      };
    }),
    ...media.map((m): TrayItem => {
      const t = m.kind === "video" ? tracks[m.id] : undefined;
      const transcribing = t?.status === "processing";
      return {
        id: m.id,
        name: m.name,
        kind: m.kind,
        thumb: m.thumb,
        status: m.status === "processing" || transcribing ? "processing" : t?.status === "failed" ? "warn" : "ready",
        progress: m.status === "processing" ? m.progress : transcribing ? t?.progress : undefined,
        viewable: m.kind === "image",
        note: t?.note,
        badge: m.kind === "video" ? (m.durationSec ? fmtClock(m.durationSec) : "Video") : undefined,
        sub: m.status === "processing"
          ? m.kind === "video" ? (m.progress !== undefined ? `Finding key scenes ${Math.round(m.progress * 100)}%` : "Finding key scenes…") : "Preparing…"
          : m.kind === "video"
            ? transcribing ? `${m.images.length} scenes · transcribing audio${t?.progress !== undefined ? ` ${Math.round(t.progress * 100)}%` : "…"}` : `${m.images.length} scenes · ${t?.status === "ready" ? "audio transcribed" : t?.status === "failed" ? "frames only" : t?.status === "none" ? "no speech" : fmtSize(m.bytes)}`
            : `${m.original ? "Original" : m.resized ? "Resized" : "Full res"} · ${m.images[0]?.width}×${m.images[0]?.height} · ${fmtSize(m.bytes)}`,
      };
    }),
    ...docs.map((d): TrayItem => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      status: d.status,
      progress: d.progress,
      note: d.note,
      sub: d.status === "processing" ? d.stage ?? "Reading…" : `${KIND_NAME[d.kind]}${d.summary ? ` · ${d.summary}` : ""}${d.truncated ? " · first part" : ""}${d.status === "warn" ? ` · ${d.warnShort ?? "note"}` : ""}`,
    })),
  ], [media, docs, links, tracks]);
  const readyMedia = useMemo(() => toMediaInput(media.filter((m) => m.status === "ready")), [media]);

  // Typing is the urgent work; the routing preview (classify + route) may lag a frame behind.
  const previewText = useDeferredValue(text);
  const preview = useMemo(() => {
    const prompt = previewText.trim();
    if (!prompt) return null;
    try {
      const req = { prompt, modes, routing, media: readyMedia };
      const c = classifier.classify(req);
      const plan = router.route(c, req);
      // Debate re-sends the panel each round: the preview shows the paid-plan estimate (debate.ts debateCostFactor).
      const units = modes.deepResearch ? Math.max(plan.estimate.units, DEEP_RESEARCH_UNITS) : modes.debate ? Math.ceil(plan.estimate.units * debateCostFactor(DEBATE_POLICY.paid.rounds)) : plan.estimate.units;
      return { plan, level: computeLevel(units) };
    } catch {
      return { plan: null, level: null };
    }
  }, [previewText, modes, routing, readyMedia]);

  // Deep Research budget hint: remaining units ÷ typical-run estimate (plans.ts).
  const drRuns = deepResearchRunsLeft(computeRemaining);
  const formatReset = () => formatResetAt(resetsAt);
  // In the desktop app Deep Research runs as Live Research: the pages are read on this computer, so the server Deep Research budget doesn't apply.
  const drBlocked = modes.deepResearch && drRuns < 1 && !liveOn;
  const processing = media.some((m) => m.status === "processing") || docs.some((d) => d.status === "processing") || links.some((l) => l.status === "processing") || Object.values(tracks).some((t) => t.status === "processing");
  const tooLarge = mediaChars(media) > MEDIA_LIMITS.maxTotalDataUrlChars;
  const hasReady = media.some((m) => m.status === "ready") || docs.some((d) => d.status === "ready") || links.some((l) => l.status === "ready" && l.attachment);
  const canSend = (text.trim().length > 0 || hasReady) && !running && !drBlocked && !processing && !tooLarge;
  // Voice mode hand-off: runs once per finished talk session. `latest` holds this render's submit so the effect never uses a stale one.
  const latest = useRef({ canSend, running, submit: () => {} });
  useEffect(() => {
    latest.current = { canSend, running, submit };
  });
  useEffect(() => {
    if (!voiceAsk) return;
    const L = latest.current;
    if (!textRef.current.trim()) { setVoiceNote("I didn't catch a question. Hold the Talk button, speak, and release."); return; }
    if (L.canSend) { askedByVoice.current = true; L.submit(); return; }
    setVoiceNote(L.running ? "Your words are in the box. Send them when the current answer finishes." : "Your words are in the box. Check the attachments, then press Send.");
  }, [voiceAsk]);

  const submit = () => {
    if (!canSend) return;
    voice.abort(); // sending ends dictation immediately
    stopSpeaking(); // a new question ends any answer still being read aloud
    disarmReadback();
    if (askedByVoice.current) { askedByVoice.current = false; armReadback(); } // asked by voice: the next answer reads itself once
    const ready = media.filter((m) => m.status === "ready");
    const hasVideo = ready.some((m) => m.kind === "video");
    const stills = ready.filter((m) => m.kind === "image").length;
    // Media without a question: ask for a description.
    const readyDocs = docs.filter((d) => d.status === "ready");
    const readyLinks = links.filter((l) => l.status === "ready" && l.attachment);
    const heard = ready.map((m) => tracks[m.id]?.attachment).filter((a): a is Attachment => Boolean(a));
    const onlyLinks = readyLinks.length && !readyDocs.length && !ready.length;
    const prompt = text.trim()
      || (onlyLinks ? (readyLinks.length > 1 ? "Summarize these pages and how they relate." : readyLinks[0].read?.kind === "youtube" ? "Summarize this video: the main points, with timestamps where they help." : "Summarize this page: the main points and anything I should know.") : null)
      || (readyDocs.length && !ready.length ? (readyDocs.some((d) => d.kind === "csv" || d.kind === "xlsx" || d.kind === "json") ? "Analyze this data: what it contains, the key numbers and anything notable." : readyDocs.some((d) => d.kind === "code" || d.kind === "zip") ? "Explain what this code does and how it is organized." : readyDocs.some((d) => d.kind === "audio") ? "Summarize this recording." : readyDocs.length > 1 ? "Summarize these documents." : "Summarize this document.") : null)
      || (hasVideo ? (stills ? "Describe these attachments, including what happens in the video." : heard.length ? "Summarize this video: what happens and what is said." : "Describe what happens in this video.") : stills > 1 ? "Describe these images." : "Describe this image.");
    const sent: MessageMedia[] = ready.map((m) => ({ id: m.id, kind: m.kind, name: m.name, bytes: m.bytes, durationSec: m.durationSec, frames: m.kind === "video" ? m.images.length : undefined, thumb: m.thumb, full: m.full, images: m.images }));
    // Spatial layer: the prompt leaves the composer (decorative; the visible result is the thread itself).
    const box = taRef.current?.closest("form")?.getBoundingClientRect();
    if (box) window.dispatchEvent(new CustomEvent(SEND_EVENT, { detail: { rect: { x: box.left, y: box.top, w: box.width, h: box.height }, chars: prompt.length } }));
    setPulse((p) => (p === "a" ? "b" : "a"));
    spaceFx.prompt();
    onSend(prompt, [...readyDocs.map((d) => d.attachment ?? { name: d.name, size: d.size, type: d.type }), ...readyLinks.map((l) => l.attachment!), ...heard], modes, sent.length ? sent : undefined);
    setText("");
    setMedia([]);
    setDocs([]);
    setLinks([]);
    setTracks({});
    dismissed.current.clear();
    setMediaError(null);
  };

  /* media: validate limits up front, then compress / sample in the browser (nothing uploads until Send) */
  const addFiles = (all: File[]) => {
    const errs: string[] = [];
    const list = all.filter((f) => { const k = kindOfFile(f); return k === "image" || k === "video"; });
    const docFiles = all.filter((f) => isDocKind(kindOfFile(f)));
    const audioFiles = all.filter((f) => kindOfFile(f) === "audio");
    for (const f of all) if (!kindOfFile(f)) errs.push(`${f.name} isn't a type Keplar reads yet. Try a PDF, Office file, CSV, JSON, code, image, video or audio file.`);
    if (docFiles.length || audioFiles.length) addDocs([...docFiles, ...audioFiles]);
    if (!list.length) { if (errs.length) setMediaError(errs.join(" ")); return; }
    let images = mediaRef.current.filter((m) => m.kind === "image").length;
    let videos = mediaRef.current.filter((m) => m.kind === "video").length;
    const accepted: { file: File; kind: MediaKind; id: string }[] = [];
    for (const f of list) {
      const kind = kindOfFile(f) as MediaKind;
      if (kind === "image") {
        if (images >= MEDIA_LIMITS.maxImages) { errs.push(`Up to ${MEDIA_LIMITS.maxImages} images per message, so ${f.name} wasn't added.`); continue; }
        if (f.size > MEDIA_LIMITS.maxImageBytes) { errs.push(`${f.name} is ${fmtSize(f.size)}. Images can be up to ${MEDIA_LIMITS.maxImageBytes / MB} MB.`); continue; }
        images++;
      } else {
        if (videos >= MEDIA_LIMITS.maxVideos) { errs.push(`One video per message, so ${f.name} wasn't added.`); continue; }
        if (f.size > MEDIA_LIMITS.maxVideoBytes) { errs.push(`${f.name} is ${fmtSize(f.size)}. Videos can be up to ${MEDIA_LIMITS.maxVideoBytes / MB} MB.`); continue; }
        videos++;
      }
      accepted.push({ file: f, kind, id: newId() });
    }
    setMediaError(errs.length ? errs.join(" ") : null);
    if (!accepted.length) return;
    setMedia((prev) => [...prev, ...accepted.map(({ file, kind, id }): ComposerMedia => ({ id, kind, name: file.name, bytes: file.size, status: "processing", images: [] }))]);
    setAnnounce(accepted.length === 1 ? `Preparing ${accepted[0].file.name}.` : `Preparing ${accepted.length} files.`);
    for (const a of accepted) void prepare(a);
  };

  // Keplar Vision: frames from a screen the person chose to share become ordinary image attachments (screen-share.ts).
  const share = useScreenShare((f) => addFiles([f]), (m) => setMediaError(m));

  const addDocs = (files: File[]) => {
    const room = MAX_FILES - docs.length;
    const take = files.slice(0, Math.max(0, room));
    if (files.length > take.length) setMediaError(`Up to ${MAX_FILES} files per message, so ${files.length - take.length} ${files.length - take.length === 1 ? "wasn't" : "weren't"} added.`);
    for (const file of take) {
      const id = newId();
      const kind = (kindOfFile(file) ?? "text") as AttachKind;
      if (file.size > (kind === "audio" ? 60 * MB : attachLimits.docBytes)) {
        setMediaError((prev) => `${prev ? `${prev} ` : ""}${file.name} is ${fmtSize(file.size)}. ${kind === "audio" ? "Audio files can be up to 60 MB." : `Files can be up to ${fmtSize(attachLimits.docBytes)}.`}`);
        continue;
      }
      setDocs((prev) => [...prev, { id, name: file.name, size: file.size, type: file.type, kind, status: "processing", stage: kind === "audio" ? "Decoding audio…" : `Reading ${KIND_NAME[kind].toLowerCase()}…` }]);
      setAnnounce(`Reading ${file.name}.`);
      const patch = (p: Partial<DocItem>) => setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...p } : d)));
      const fail = (msg: string) => { setDocs((prev) => prev.filter((d) => d.id !== id)); setMediaError((prev) => (!prev ? msg : prev.includes(msg) ? prev : `${prev} ${msg}`)); };
      if (kind === "audio") {
        transcribe(file, attachLimits.audioSeconds, (done, total) => patch({ progress: total ? Math.max(0.05, done / total) : undefined, stage: `Transcribing ${done}/${total}` })).then(
          (out) => {
            if (!out.text.trim()) { fail(`No speech was found in ${file.name}.`); return; }
            const attachment = keepTranscript(file.name, out.text);
            patch({ status: out.failed ? "warn" : "ready", progress: undefined, attachment, summary: `${fmtClock(out.seconds)} · transcribed`, note: out.failed ? "Part of the audio couldn't be transcribed." : undefined });
            setAnnounce(`${file.name} transcribed.`);
          },
          (e) => fail(e instanceof AudioTooLongError ? `${file.name} is ${fmtClock(e.seconds)} long. Your plan transcribes up to ${fmtClock(e.max)}.` : e instanceof NoAudioError ? `Your browser couldn't decode ${file.name}. Try MP3, M4A or WAV.` : `${file.name}: ${(e as Error).message}`),
        );
        continue;
      }
      readDocument(file).then(
        (out) => {
          // Free: file text isn't sent to free hosts (privacy gate); say so on the chip before sending, not after.
          const freeBlocked = plan === "free";
          patch({ status: freeBlocked || out.notes.length ? "warn" : "ready", pages: out.pages, truncated: out.truncated, summary: out.summary, kind: out.kind, warnShort: freeBlocked ? "not sent on Free" : "read with a note", note: freeBlocked ? FREE_DOCS_NOT_SENT : out.notes.join(" ") || undefined, attachment: { name: file.name, size: file.size, type: file.type } });
          setAnnounce(`${file.name} attached${out.truncated ? ". Only the first part fits." : "."}`);
        },
        (e) => fail(e instanceof DocUploadError ? e.message : `Couldn't read ${file.name}.`),
      );
    }
  };

  /* links: read when pasted, typed (once the address is complete) or added from the Attach menu */
  const addLink = useCallback((raw: string, pinned = false) => {
    const url = raw.trim();
    if (!url || dismissed.current.has(url) || linksRef.current.some((l) => l.url === url)) return;
    if (linksRef.current.length >= attachLimits.linksPerMessage) { setMediaError(`Keplar reads up to ${attachLimits.linksPerMessage} links per message.`); return; }
    const id = newId();
    const item: LinkItem = { id, url, status: "processing", pinned };
    linksRef.current = [...linksRef.current, item];
    setLinks((prev) => [...prev, item]);
    setAnnounce(`Reading ${hostOf(url)}.`);
    readLink(url).then(
      async ({ read, attachment }) => {
        if (!linksRef.current.some((l) => l.id === id)) return; // removed meanwhile
        if (read.kind === "image" && read.dataUrl) {
          // An image link becomes an image attachment for the vision models.
          setLinks((prev) => prev.filter((l) => l.id !== id));
          const dims = await new Promise<{ w: number; h: number }>((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 1024, h: 1024 }); im.src = read.dataUrl!; });
          const mid = newId();
          setMedia((prev) => [...prev, { id: mid, kind: "image", name: read.title || hostOf(url), bytes: Math.round(read.dataUrl!.length * 0.75), status: "ready", thumb: read.dataUrl, images: [{ dataUrl: read.dataUrl!, width: dims.w, height: dims.h, name: read.title || hostOf(url) }], original: true }]);
          return;
        }
        setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, status: read.notes.length ? "warn" : "ready", read, attachment, note: read.notes.join(" ") || undefined } : l)));
        setAnnounce(`Read ${read.title || read.host}.`);
      },
      (e) => {
        if (!linksRef.current.some((l) => l.id === id)) return;
        const msg = e instanceof DocUploadError ? e.message : "Couldn't read that link.";
        setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, status: "warn", note: msg } : l)));
      },
    );
  }, [attachLimits.linksPerMessage]);

  // Links in the message: read once the address looks finished (followed by a space or a pause); dropped when deleted from the text.
  const linkText = useDeferredValue(text);
  useEffect(() => {
    const found = urlsIn(linkText, attachLimits.linksPerMessage + 2).filter((u) => /\.[a-z]{2,}(?:[:/?#]|$)/i.test(new URL(u).host + new URL(u).pathname.slice(0, 1)));
    // Still typing at the end of an address: wait longer before reading it.
    const typingUrl = /https?:\/\/\S+$/.test(linkText);
    const t = setTimeout(() => { for (const u of found) addLink(u); }, typingUrl ? 1400 : 400);
    setLinks((prev) => {
      const next = prev.filter((l) => l.pinned || found.includes(l.url));
      return next.length === prev.length ? prev : next;
    });
    return () => clearTimeout(t);
  }, [linkText, addLink, attachLimits.linksPerMessage]);

  const submitLinkDraft = () => {
    const d = (linkDraft ?? "").trim();
    if (!d) return;
    const u = urlsIn(/^https?:\/\//i.test(d) ? d : `https://${d}`, 1)[0];
    if (!u) { setMediaError("That doesn't look like a web address."); return; }
    addLink(u, true);
    setLinkDraft(null);
    setAttachOpen(false);
    taRef.current?.focus();
  };

  /** After a video's frames: transcribe its sound track (silent clips and clips without audio are noted, not errors). */
  const hearVideo = (file: File, id: string) => {
    setTracks((p) => ({ ...p, [id]: { status: "processing" } }));
    transcribe(file, MEDIA_LIMITS.maxVideoSeconds, (done, total) => setTracks((p) => (p[id] ? { ...p, [id]: { ...p[id], progress: total ? done / total : undefined } } : p))).then(
      (out) => {
        if (!mediaRef.current.some((m) => m.id === id)) return;
        if (!out.text.trim()) { setTracks((p) => ({ ...p, [id]: { status: "none", note: "No speech in this video, so Keplar uses the scenes only." } })); return; }
        setTracks((p) => ({ ...p, [id]: { status: "ready", attachment: keepTranscript(file.name, out.text), note: out.failed ? "Part of the audio couldn't be transcribed." : undefined } }));
      },
      (e) => {
        if (!mediaRef.current.some((m) => m.id === id)) return;
        setTracks((p) => ({ ...p, [id]: e instanceof NoAudioError ? { status: "none", note: "This video has no audio track Keplar can hear, so it uses the scenes only." } : { status: "failed", note: (e as Error).message || "The audio couldn't be transcribed, so Keplar uses the scenes only." } }));
      },
    );
  };

  const prepare = async ({ file, kind, id }: { file: File; kind: MediaKind; id: string }) => {
    try {
      const out = kind === "image"
        ? await prepareImage(file, shareFor(id))
        : await prepareVideo(file, (done, total) => setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, progress: done / total } : m))));
      if (!mediaRef.current.some((m) => m.id === id)) { if ("full" in out && out.full) URL.revokeObjectURL(out.full); return; } // removed while preparing
      setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, ...out, file: kind === "image" ? file : undefined, progress: undefined, status: "ready" } : m)));
      setAnnounce(kind === "video" ? `${file.name}: ${out.images.length} key scenes found. Transcribing the audio.` : `${file.name} attached.`);
      if (kind === "video") hearVideo(file, id);
    } catch (e) {
      setMedia((prev) => prev.filter((m) => m.id !== id));
      const msg =
        e instanceof VideoTooLongError
          ? `${file.name} is longer than ${MEDIA_LIMITS.maxVideoSeconds / 60} minutes. Trim it and attach it again.`
          : kind === "video"
            ? `Your browser couldn't read ${file.name}. Try an MP4 (H.264) or WebM file.`
            : `Couldn't read ${file.name}. Try a PNG or JPG.`;
      setMediaError((prev) => (!prev ? msg : prev.includes(msg) ? prev : `${prev} ${msg}`));
    }
  };

  /** Data-URL budget for one image: the request's image budget, less video frames, split across the images. */
  const shareFor = (id: string) => {
    const cur = mediaRef.current;
    const stills = cur.filter((m) => m.kind === "image" || m.id === id).length || 1;
    const videoChars = cur.filter((m) => m.kind === "video").reduce((a, m) => a + m.images.reduce((b, i) => b + i.dataUrl.length, 0), 0) || (cur.some((m) => m.kind === "video") ? 16 * 70_000 : 0);
    return Math.max(300_000, Math.floor((IMAGE_BUDGET_TOTAL - videoChars) / stills));
  };

  /* If the images together no longer fit one request, re-fit the largest from their originals (resolution first, then quality). */
  useEffect(() => {
    if (media.some((m) => m.status === "processing")) return;
    if (mediaChars(media) <= MEDIA_LIMITS.maxTotalDataUrlChars) return;
    const stills = media.filter((m) => m.kind === "image" && m.file);
    if (!stills.length) return;
    const videoChars = media.filter((m) => m.kind === "video").reduce((a, m) => a + m.images.reduce((b, i) => b + i.dataUrl.length, 0), 0);
    const share = Math.max(300_000, Math.floor((IMAGE_BUDGET_TOTAL - videoChars) / stills.length));
    const big = stills.filter((m) => m.images.reduce((a, i) => a + i.dataUrl.length, 0) > share);
    if (!big.length) return;
    setMedia((prev) => prev.map((m) => (big.some((b) => b.id === m.id) ? { ...m, status: "processing", progress: undefined } : m)));
    for (const b of big) {
      void prepareImage(b.file!, share).then(
        (out) => { if (b.full && b.full !== out.full) URL.revokeObjectURL(b.full); setMedia((prev) => prev.map((m) => (m.id === b.id ? { ...m, ...out, status: "ready" } : m))); },
        () => setMedia((prev) => prev.map((m) => (m.id === b.id ? { ...m, status: "ready" } : m))),
      );
    }
  }, [media]);

  const removeMedia = (id: string) => {
    const link = links.find((l) => l.id === id);
    if (link) { dismissed.current.add(link.url); if (link.attachment) forgetDocument(link.attachment); setLinks(links.filter((l) => l.id !== id)); setAnnounce(`Removed ${link.read?.title ?? hostOf(link.url)}.`); return; }
    const doc = docs.find((d) => d.id === id);
    if (doc) { forgetDocument(doc.attachment ?? doc); setDocs(docs.filter((d) => d.id !== id)); setMediaError(null); setAnnounce(`Removed ${doc.name}.`); return; }
    if (tracks[id]?.attachment) forgetDocument(tracks[id].attachment!);
    if (tracks[id]) setTracks((p) => { const n = { ...p }; delete n[id]; return n; });
    const idx = media.findIndex((m) => m.id === id);
    const name = media[idx]?.name;
    if (media[idx]?.full) URL.revokeObjectURL(media[idx].full!);
    setMedia(media.filter((m) => m.id !== id));
    setMediaError(null);
    if (name) setAnnounce(`Removed ${name}.`);
    // Keep keyboard focus in the tray: the next remove button, else the message box.
    requestAnimationFrame(() => {
      const btns = trayRef.current?.querySelectorAll<HTMLButtonElement>("button[data-remove]");
      const next = btns?.[Math.min(idx, (btns?.length ?? 1) - 1)];
      (next ?? taRef.current)?.focus();
    });
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(e.clipboardData?.files ?? []);
    // A pasted link is read right away (no need to wait for a space).
    const pastedText = e.clipboardData?.getData("text/plain") ?? "";
    if (pastedText) for (const u of urlsIn(pastedText, attachLimits.linksPerMessage)) addLink(u);
    if (!pasted.length) return;
    // A screenshot or copied image: attach it. Plain text in the same paste still goes into the box.
    if (!e.clipboardData.types.includes("text/plain")) e.preventDefault();
    addFiles(pasted);
  };

  /* Don't let a file dropped next to the composer open in the tab. */
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  const syncSlashFromCaret = useCallback((value: string, caret: number, imageMode: boolean) => {
    if (!imageMode) {
      const chat = chatSlashToken(value, caret);
      if (chat) {
        setSlashKind("chat");
        setSlashOpen(true);
        setSlashQuery(chat.query);
        setSlashRange({ start: chat.end - chat.query.length, end: chat.end });
        setSlashActive(0);
        return;
      }
      setSlashOpen(false);
      setSlashRange(null);
      return;
    }
    setSlashKind("image");
    const tok = activeSlashToken(value, caret);
    if (!tok) {
      setSlashOpen(false);
      setSlashRange(null);
      return;
    }
    setSlashOpen(true);
    setSlashQuery(tok.query);
    setSlashRange({ start: tok.start, end: tok.end });
    setSlashActive(0);
  }, []);

  const applySlash = useCallback((picked: SlashCommand | ChatCommand) => {
    const ta = taRef.current;
    const value = ta?.value ?? textRef.current;
    if (!("build" in picked)) {
      // A chat command: put "/slides " in place of the typed token and leave the caret after it for the rest.
      const range = slashRange ?? { start: 0, end: value.length };
      const insert = `${picked.slash} `;
      setText(`${value.slice(0, range.start)}${insert}${value.slice(range.end).replace(/^\S*\s?/, "")}`);
      setSlashOpen(false);
      setSlashRange(null);
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (!el) return;
        const pos = range.start + insert.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
      return;
    }
    const cmd = picked;
    const range = slashRange ?? activeSlashToken(value, ta?.selectionStart ?? value.length);
    if (!range) return;
    const hasRef = mediaRef.current.some((m) => m.kind === "image" && m.status === "ready");
    const lineAfter = value.slice(range.end).split("\n")[0] ?? "";
    const subject = lineAfter.trim();
    const expanded = expandSlashCommand(cmd, subject, hasRef);
    const rest = value.slice(range.end + lineAfter.length);
    const next = `${value.slice(0, range.start)}${expanded}${rest}`;
    setText(next);
    setSlashOpen(false);
    setSlashRange(null);
    setModes((m) => ({ ...m, image: true }));
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      const pos = range.start + expanded.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }, [setText, slashRange]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && slashItems.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashActive((i) => (i + 1) % slashItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashActive((i) => (i - 1 + slashItems.length) % slashItems.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (!e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          applySlash(slashItems[Math.min(slashActive, slashItems.length - 1)]!);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }
    // Settings → Chat → Send with: Enter (Shift+Enter for a new line) or Ctrl/⌘+Enter (Enter adds a new line).
    const sendCombo = prefs.sendKey === "mod-enter" ? e.metaKey || e.ctrlKey : e.metaKey || e.ctrlKey || !e.shiftKey;
    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && sendCombo) {
      e.preventDefault();
      submit();
    }
  };

  const depth = routing.depth ?? "auto";
  const strategyLabel = depth !== "auto" ? (DEPTH_OPTIONS.find((d) => d.id === depth)?.label ?? "Automatic") : strategies.find((x) => x.id === (routing.strategy ?? "auto"))?.label ?? "Automatic";
  const customised = depth !== "auto" || (routing.strategy ?? "auto") !== "auto" || routing.tier === "sensitive" || (routing.excludeProviders?.length ?? 0) > 0 || routing.preferOpenWeights || (routing.maxModels ?? 6) < 6;

  return (
    <div ref={wrapRef} className={s.wrap} data-pop={pop.side} style={{ ["--pop-room" as string]: `${pop.room}px` }}>
      <span ref={popAnchorRef} className={s.popAnchor} aria-hidden="true" />
      <Popover open={routingOpen} onOpenChange={closeOnOutside(setRoutingOpen)} anchorRef={popAnchorRef} side={popSide} align="end" label="Advanced routing" id={`${uid}-routing`} className={s.panel} onKeyDown={popKeys(() => setRoutingOpen(false), routingBtnRef, "")}>
          <div className={s.panelHead}>
            <p className={s.panelTitle}>Advanced routing</p>
            <p className={s.panelLede}>{brand.engineName} chooses models for you. These settings constrain it; they don&rsquo;t pick models directly.</p>
          </div>

          <fieldset className={s.field}>
            <legend className={s.legend}>Depth</legend>
            <div className={s.segmented}>
              {DEPTH_OPTIONS.map((d) => (
                <label key={d.id} className={s.segment} title={d.hint}>
                  <input type="radio" name={`${uid}-depth`} value={d.id} checked={depth === d.id} onChange={() => onRouting({ ...routing, depth: d.id })} />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
            <p className={s.panelLede}>{DEPTH_OPTIONS.find((d) => d.id === depth)?.hint}</p>
          </fieldset>

          <fieldset className={s.field}>
            <legend className={s.legend}>Strategy</legend>
            <div className={s.choices}>
              {strategies.map((st) => (
                <label key={st.id} className={s.choice}>
                  <input type="radio" name={`${uid}-strategy`} value={st.id} checked={(routing.strategy ?? "auto") === st.id} onChange={() => onRouting({ ...routing, strategy: st.id })} />
                  <span className={s.choiceText}><span className={s.choiceLabel}>{st.label}</span><span className={s.choiceHint}>{st.hint}</span></span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={s.fieldRow}>
            <label className={s.legend} htmlFor={`${uid}-max`}>Most models per question</label>
            <div className={s.rangeRow}>
              <input id={`${uid}-max`} type="range" min={1} max={6} step={1} value={routing.maxModels ?? 6} onChange={(e) => onRouting({ ...routing, maxModels: Number(e.target.value) })} className={s.range} />
              <output className={s.rangeValue} htmlFor={`${uid}-max`}>{routing.maxModels ?? 6}</output>
            </div>
          </div>

          <fieldset className={s.field}>
            <legend className={s.legend}>Data handling</legend>
            <div className={s.segmented}>
              <label className={s.segment}>
                <input type="radio" name={`${uid}-tier`} checked={(routing.tier ?? "standard") === "standard"} onChange={() => onRouting({ ...routing, tier: "standard" })} />
                <span>Standard</span>
              </label>
              <label className={s.segment}>
                <input type="radio" name={`${uid}-tier`} checked={routing.tier === "sensitive"} onChange={() => onRouting({ ...routing, tier: "sensitive" })} />
                <span>Sensitive</span>
              </label>
            </div>
            <p className={s.help}>Sensitive routes only to zero-retention endpoints, which narrows the models available.</p>
          </fieldset>

          <label className={s.check}>
            <input type="checkbox" checked={!!routing.preferOpenWeights} onChange={(e) => onRouting({ ...routing, preferOpenWeights: e.target.checked })} />
            <span>Prefer open-weight models</span>
          </label>

          <fieldset className={s.field}>
            <legend className={s.legend}>Exclude model families</legend>
            <div className={s.families}>
              {providerFamilies.map((f) => {
                const on = routing.excludeProviders?.includes(f) ?? false;
                return (
                  <label key={f} className={s.family}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        onRouting({ ...routing, excludeProviders: e.target.checked ? [...(routing.excludeProviders ?? []), f] : (routing.excludeProviders ?? []).filter((x) => x !== f) })
                      }
                    />
                    <span>{f}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {preview?.plan ? (
            <p className={s.previewLine}>
              For the current draft: {preview.plan.mode === "single" ? "one model" : `${preview.plan.panel.length} models${preview.plan.verifier ? " + verifier" : ""}${preview.plan.judge ? " + judge if needed" : ""}`}
              {" · "}{brand.usage} {computeLevelLabel[preview.level!].toLowerCase()}
            </p>
          ) : null}
      </Popover>

      <form
        className={s.composer}
        data-composer=""
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          if (!hasFiles(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        data-dragging={dragging || undefined}
        data-pulse={pulse}
        data-voice={voice.state !== "idle" ? voice.state : undefined}
        aria-label="Ask Keplar"
      >
        {dragging ? (
          <div className={s.dropZone} aria-hidden="true">
            <span className={s.dropTitle}>Drop to attach</span>
            <span className={s.dropKinds}>
              {READS.map((r) => { const G = GLYPH[r.kind] ?? GLYPH.text; return <span key={r.kind}><G size={13} />{r.label}</span>; })}
            </span>
          </div>
        ) : null}
        <AttachTray
          ref={trayRef}
          items={trayItems}
          onRemove={removeMedia}
          onOpen={(id) => { const m = media.find((x) => x.id === id); const src = m?.full ?? m?.images[0]?.dataUrl; if (m && src) setViewer({ src, name: m.name, dims: m.images[0] ? `${m.images[0].width} × ${m.images[0].height}` : undefined }); }}
        />
        {viewer ? <Lightbox src={viewer.src} alt={viewer.name} caption={viewer.name} onClose={() => setViewer(null)} /> : null}
        {media.length || docs.length || links.length || dragging ? (
          <p id={`${uid}-media-note`} className={s.mediaNote} data-free={plan === "free" || undefined}>
            <span>{plan === "free" ? FREE_MEDIA_NOTE : PAID_MEDIA_NOTE}</span>
            <span className={s.mediaNoteQuiet}>{LIMITS_TEXT}</span>
          </p>
        ) : null}
        {plan === "free" && docs.some((d) => d.status === "warn" && d.warnShort === "not sent on Free") ? <p className={s.fileError} role="status">{FREE_DOCS_NOT_SENT}</p> : null}
        {mediaError ? <p className={s.fileError} role="alert">{mediaError}</p> : null}
        {tooLarge ? <p className={s.fileError} role="alert">These attachments are too large to send together. Remove one.</p> : null}
        <p className="visually-hidden" role="status" aria-live="polite">{voice.state === "listening" || voice.state === "processing" ? voiceStatusText[voice.state] : announce}</p>
        {voice.error ? <p className={s.fileError} role="alert">{voice.error.message}</p> : null}
        {voiceNote && !voice.error ? <p className={s.fileError} role="status" data-testid="voice-note">{voiceNote}</p> : null}

        <label htmlFor={`${uid}-input`} className="visually-hidden">Message Keplar</label>
        {slashOpen ? (
          <SlashCommandMenu
            id={slashListId}
            label={slashKind === "chat" ? "Chat commands" : "Image slash commands"}
            items={slashItems}
            active={slashActive}
            onActive={setSlashActive}
            onPick={applySlash}
          />
        ) : null}
        <textarea
          id={`${uid}-input`}
          ref={taRef}
          className={s.input}
          rows={1}
          placeholder={modes.study ? "What do you want to learn?" : modes.slides ? "Describe the talk: the topic, who it's for, how many slides" : placeholder}
          onChange={(e) => {
            setText(e.target.value);
            syncSlashFromCaret(e.target.value, e.target.selectionStart ?? e.target.value.length, modes.image === true);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          aria-describedby={`${uid}-hint`}
          spellCheck={prefs.spellcheck}
          aria-autocomplete={slashOpen ? "list" : undefined}
          aria-controls={slashOpen ? slashListId : undefined}
          aria-expanded={slashOpen || undefined}
          aria-activedescendant={slashOpen && slashItems[slashActive] ? `${slashListId}-opt-${slashItems[slashActive]!.id}` : undefined}
          role={slashOpen ? "combobox" : undefined}
          data-composer-input
        />
        {!text && !media.length && !docs.length && !links.length && !running ? (
          <p className={s.readsHint} aria-hidden="true">
            <span>Paste a link or drop a file.</span>
            <span className={s.readsKinds}>Keplar reads {READS.map((r) => r.label.toLowerCase()).join(" · ")}</span>
          </p>
        ) : null}

        {liveOn ? (
          <div className={s.budget} role="group" aria-label="Live Research" data-live-research="">
            <span><strong>Live Research</strong> · searched and read on this computer</span>
            <span className={`${s.segmented} ${s.liveDepth}`} role="radiogroup" aria-label="Research depth">
              {LIVE_DEPTHS.map((d) => (
                <label key={d.id} className={s.segment} title={d.hint}>
                  <input
                    type="radio"
                    name={`${uid}-live-depth`}
                    value={d.id}
                    checked={(modes.liveDepth ?? "auto") === d.id}
                    onChange={() => setModes((m) => { const next = { ...m }; if (d.id === "auto") delete next.liveDepth; else next.liveDepth = d.id; return next; })}
                  />
                  <span>{d.label}</span>
                </label>
              ))}
            </span>
          </div>
        ) : null}

        {modes.deepResearch && !liveOn ? (
          <div id={`${uid}-budget`} className={s.budget} data-blocked={drBlocked || undefined} role="status">
            {drBlocked ? (
              <>
                <span>
                  Not enough {brand.usage} left for a Deep Research run this period. It resets {formatReset()}.
                </span>
                <span className={s.budgetActions}>
                  <Button size="sm" variant="ghost" className={s.budgetAct} onClick={() => setModes((m) => ({ ...m, deepResearch: false }))}>
                    Ask without Deep Research
                  </Button>
                  <Link href="/pricing" className={s.budgetLink}>See plans</Link>
                </span>
              </>
            ) : (
              <span>
                {Number.isFinite(drRuns)
                  ? `About ${drRuns} Deep Research ${drRuns === 1 ? "run" : "runs"} left this month`
                  : "Deep Research on"}
                <span className={s.budgetQuiet}> · estimate · resets {formatReset()}</span>
              </span>
            )}
          </div>
        ) : null}

        {modes.debate ? (
          <div className={s.budget} role="status" data-debate-note="">
            <span>
              <strong>Debate.</strong>{" "}
              {plan === "free"
                ? `${DEBATE_POLICY.free.models} free models argue for ${DEBATE_POLICY.free.rounds} rounds, reading each other's points, then ${brand.engineName} writes one answer. Counts as ${DEBATE_POLICY.free.freeQuestions} of today's questions.`
                : `Up to ${DEBATE_POLICY.paid.models} models argue for up to ${DEBATE_POLICY.paid.rounds} rounds, reading each other's points, then ${brand.engineName} writes one answer. Uses about ${debateCostFactor(DEBATE_POLICY.paid.rounds)}× the ${brand.usage} of a normal answer.`}
              {media.length ? " Not with images yet: with an attachment it answers normally." : ""}
            </span>
            <span className={s.budgetActions}>
              <Button size="sm" variant="ghost" className={s.budgetAct} onClick={() => setModes((m) => ({ ...m, debate: false }))}>
                Turn off Debate
              </Button>
            </span>
          </div>
        ) : null}

        {modes.study ? (
          <div className={s.budget} role="status" data-study-note="">
            <span>
              <strong>Study.</strong>{" "}
              {docs.length
                ? `${brand.engineName} answers, then turns your attached ${docs.length > 1 ? "documents" : "document"} into a study set: an outline, flashcards and a quiz.`
                : `${brand.engineName} answers, then turns the answer into a study set: an outline, flashcards and a quiz.`}
              {signedIn === false ? " Sign in to build and save study sets." : plan === "free" ? " Free builds on free models." : " Charged by actual cost."}
            </span>
            <span className={s.budgetActions}>
              <Button size="sm" variant="ghost" className={s.budgetAct} onClick={() => setModes((m) => ({ ...m, study: false }))}>
                Turn off Study
              </Button>
            </span>
          </div>
        ) : null}

        {modes.slides ? (
          <div className={s.budget} role="status" data-slides-note="">
            {signedIn === false || !canUseSlides(plan ?? "free") ? (
              <span>
                <strong>Slides</strong> is part of Plus and Pro: {brand.engineName} writes a deck from your message, then you edit it, present it and export it.{" "}
                <Link href={signedIn === false ? "/signin?next=/app" : "/pricing"} className={s.budgetLink}>{signedIn === false ? "Sign in" : "See plans"}</Link>
              </span>
            ) : (
              <span>
                <strong>Slides.</strong>{" "}
                {(() => {
                  const L = slidesLimitsFor(plan ?? "free")!;
                  const r = deckRequestFrom(text || "deck", L.maxSlides);
                  const est = estimateDeckCredits(plan as "plus" | "pro" | "business", r.topic.length + r.outline.length, r.count);
                  return `${brand.engineName} writes a ${r.count}-slide deck from your message${docs.length ? " and your attached document" : ""}. About ${est.toLocaleString("en-US")} credits; you're charged the actual cost.`;
                })()}
                {media.length ? " Images aren't used for slides." : ""}
              </span>
            )}
            <span className={s.budgetActions}>
              <Button size="sm" variant="ghost" className={s.budgetAct} onClick={() => setModes((m) => ({ ...m, slides: false }))}>
                Turn off Slides
              </Button>
            </span>
          </div>
        ) : null}

        {share.active ? (
          <div className={s.shareBar} role="status" aria-live="polite">
            <span className={s.shareDot} aria-hidden="true" />
            <span className={s.shareLabel}>Sharing {share.label}</span>
            <span className={s.shareNote}>Keplar sees it only when you capture.</span>
            <Button size="sm" variant="secondary" onClick={() => void share.capture()}>Capture</Button>
            <Button size="sm" variant="secondary" onClick={share.stop}>Stop</Button>
          </div>
        ) : null}
        <div className={s.row}>
          <div ref={toolsRef} className={s.tools} role="group" aria-label="Tools">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept={ACCEPT_ALL}
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
              tabIndex={-1}
            />
            <input
              ref={photoRef}
              type="file"
              multiple
              hidden
              accept="image/*,video/mp4,video/webm,video/quicktime"
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
              tabIndex={-1}
            />
            <button
              ref={attachBtnRef}
              type="button"
              className={s.tool}
              onClick={() => { toggleFrom(setAttachOpen)(); setLinkDraft(null); }}
              aria-haspopup="menu"
              aria-expanded={attachOpen}
              aria-controls={`${uid}-attach`}
              title="Attach files, photos, video, audio or a link. You can also paste or drop them."
              aria-label="Attach files, photos or a link"
              aria-describedby={media.length ? `${uid}-media-note` : `${uid}-attach-hint`}
              data-attach-btn=""
            >
              <IconPlus size={16} />
              <span className={s.toolLabel}>Attach</span>
            </button>
            {voice.supported ? (
              <button
                type="button"
                className={s.tool}
                data-voice-btn={voice.state}
                aria-pressed={voice.state === "listening"}
                aria-label={voice.state === "listening" ? "Stop dictation" : voice.state === "processing" ? "Finishing dictation" : "Dictate with your voice"}
                title={voice.state === "listening" ? "Stop dictation" : "Dictate. Your browser's speech service turns your voice into text; Keplar doesn't record audio."}
                disabled={voice.state === "processing"}
                onClick={voice.toggle}
              >
                <IconMic size={15} />
                <span className={s.toolLabel}>{voice.state === "listening" ? "Listening…" : voice.state === "processing" ? "Finishing…" : "Voice"}</span>
              </button>
            ) : null}
            <VoiceTalk voice={voice} className={s.tool} labelClass={s.toolLabel} disabled={running} onNote={setVoiceNote} onAsk={() => setVoiceAsk((n) => n + 1)} />
            {tools.map(({ key, label, Icon, hint }) => (
              <button
                key={key}
                type="button"
                className={s.tool}
                data-mode={key}
                aria-pressed={Boolean(modes[key])}
                aria-label={label}
                title={key === "web" && liveDesktop && liveEnabled ? LIVE_WEB_HINT : hint}
                // Kinds of run are exclusive (composer/modes.ts): Debate vs Deep Research, and Study / Slides vs every other kind.
                onClick={() => setModes((m) => toggleMode(m, key))}
              >
                <Icon size={15} />
                <span className={s.toolLabel}>{label}</span>
                
              </button>
            ))}
            <button
              ref={moreBtnRef}
              type="button"
              className={`${s.tool} ${s.more}`}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-controls={`${uid}-more`}
              aria-label={`More modes: ${overflow.map((k) => tools.find((t) => t.key === k)?.label).join(", ")}${overflow.filter((k) => modes[k]).map((k) => ` (${tools.find((t) => t.key === k)?.label} is on)`).join("")}`}
              title="Modes: Web, Deep Research, Debate, Study, Slides, Create and more"
              data-show={overflow.length ? "" : undefined}
              onClick={toggleFrom(setMoreOpen)}
            >
              {(() => {
                // A pressed mode that lives in More shows its own icon here, so the row still says what the next message does.
                const on = tools.find((t) => overflow.includes(t.key) && modes[t.key]);
                return on ? <on.Icon size={15} /> : <IconMore size={15} />;
              })()}
              <span className={s.toolLabel}>Modes</span>
            </button>
          </div>
          <Popover open={attachOpen} onOpenChange={closeOnOutside(setAttachOpen)} anchorRef={popAnchorRef} side={popSide} align="start" label="Attach" role="menu" id={`${uid}-attach`} className={s.attachMenu} onKeyDown={popKeys(() => setAttachOpen(false), attachBtnRef, '[role="menuitem"], input')}>
              <button type="button" role="menuitem" className={s.attachItem} data-attach-item="files" onClick={() => { setAttachOpen(false); fileRef.current?.click(); }}>
                <GlyphUpload size={16} />
                <span className={s.attachText}><span>Upload files</span><span className={s.attachSub}>Docs, slides, sheets, data, code, .zip, audio</span></span>
              </button>
              <button type="button" role="menuitem" className={s.attachItem} data-attach-item="photos" onClick={() => { setAttachOpen(false); photoRef.current?.click(); }}>
                <GlyphCamera size={16} />
                <span className={s.attachText}><span>Photos and video</span><span className={s.attachSub}>Screenshots, charts, handwriting, clips up to 3 min</span></span>
              </button>
              <button type="button" role="menuitem" className={s.attachItem} data-attach-item="screen" onClick={() => { setAttachOpen(false); void share.start(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                <span className={s.attachText}><span>{share.active ? "Capture the shared screen" : "Share screen"}</span><span className={s.attachSub}>{share.active ? "Attach what it shows now" : "Pick a screen, window or tab; Keplar sees it only when you capture"}</span></span>
              </button>
              {linkDraft === null ? (
                <button type="button" role="menuitem" className={s.attachItem} data-attach-item="link" onClick={() => setLinkDraft("")}>
                  <GlyphLink size={16} />
                  <span className={s.attachText}><span>Read a link</span><span className={s.attachSub}>Pages, articles, PDFs, YouTube. Or just paste it</span></span>
                </button>
              ) : (
                <div className={s.linkForm} role="group" aria-label="Read a link">
                  <GlyphLink size={16} />
                  <input autoFocus className={s.linkInput} type="url" inputMode="url" enterKeyHint="go" placeholder="https://" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} aria-label="Link to read" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setLinkDraft(null); } if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); submitLinkDraft(); } }} />
                  <Button size="sm" variant="primary" disabled={!linkDraft.trim()} onClick={submitLinkDraft}>Read</Button>
                </div>
              )}
              <div className={s.attachReads}>
                <p className={s.attachReadsTitle}>Keplar reads</p>
                <ul>
                  {READS.map((r) => { const G = GLYPH[r.kind] ?? GLYPH.text; return <li key={r.kind} title={r.detail}><G size={13} /><span>{r.label}</span></li>; })}
                </ul>
              </div>
          </Popover>
          <Popover open={moreOpen && overflow.length > 0} onOpenChange={closeOnOutside(setMoreOpen)} anchorRef={popAnchorRef} side={popSide} align="start" label="More modes" role="menu" id={`${uid}-more`} className={s.moreMenu} onKeyDown={popKeys(() => setMoreOpen(false), moreBtnRef, '[role="menuitemcheckbox"]')}>
              {overflow.map((k) => {
                const t = tools.find((x) => x.key === k)!;
                return (
                  <button
                    key={k}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={Boolean(modes[k])}
                    className={s.moreItem}
                    data-more-mode={k}
                    title={k === "web" && liveDesktop && liveEnabled ? LIVE_WEB_HINT : t.hint}
                    onClick={() => { setModes((m) => toggleMode(m, k)); setMoreOpen(false); taRef.current?.focus(); }}
                  >
                    <span className={s.moreIcon}><t.Icon size={16} /></span>
                    <span className={s.moreText}>
                      <span className={s.moreLabel}>{t.label}</span>
                      <span className={s.moreBlurb}>{BLURB[k]}</span>
                    </span>
                  </button>
                );
              })}
          </Popover>

          <div className={s.actions}>
            <button
              ref={routingBtnRef}
              type="button"
              className={s.routingBtn}
              aria-expanded={routingOpen}
              aria-controls={`${uid}-routing`}
              aria-haspopup="dialog"
              onClick={toggleFrom(setRoutingOpen)}
              data-custom={customised || undefined}
            >
              <IconRouting size={15} />
              <span className={s.routingLabel}>{strategyLabel}</span>
              <span className="visually-hidden">. Advanced routing</span>
            </button>
            {running ? (
              <Button variant="secondary" className={s.stop} onClick={onStop} aria-label="Stop generating (Esc)" leadingIcon={<IconStop size={14} />}>
                Stop
              </Button>
            ) : (
              // The send: the area's one ink action, a round arrow. Its name ("Ask Keplar") is the label and the tooltip.
              <IconButton type="submit" variant="primary" shape="circle" className={s.send} label="Ask Keplar" disabled={!canSend} aria-describedby={drBlocked ? `${uid}-budget` : undefined} icon={<KitIcon name="arrow-up" size={18} />} />
            )}
          </div>
        </div>
        <p id={`${uid}-hint`} className="visually-hidden">{prefs.sendKey === "mod-enter" ? "Press Control or Command Enter to send; Enter adds a new line. " : "Press Enter or Command Enter to send, Shift Enter for a new line. "}{modes.image ? "Type / for image slash commands. " : "Type / for chat commands such as /slides, /quiz and /approvals. Turn on Create image to use / image commands. "}Paste a link to have Keplar read it. Paste or drop images, video, audio, documents, code or data files to attach them.</p>
        <p id={`${uid}-attach-hint`} className="visually-hidden">{LIMITS_TEXT}. {plan === "free" ? FREE_MEDIA_NOTE : PAID_MEDIA_NOTE}.</p>
      </form>
    </div>
  );
});
