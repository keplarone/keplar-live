"use client";

import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import Link from "next/link";
import { KeplarSymbol } from "@/components/brand";
import { SkyBackdrop } from "@/components/sky/SkyBackdrop";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { Attachment, ComposerModes, KeplarRequest, ResearchEvent } from "@/lib/orchestration/types";
import { hasResearchBridge, noSubscribe, researchBridge } from "@/lib/desktop/research-bridge";
import { deepResearchRunsLeft, PLAN_ALLOWANCES } from "@/lib/orchestration/plans";
import { checkLiveAnswer, modesWithoutLive, prepareLiveResearch, previousRunIds, researchQuestion, wantsLiveResearch, type LiveSession } from "./state/live-run";
import { liveFallbackNote } from "./state/live-research";
import { UsageNotice } from "./UsageNotice";
import { Composer, toMediaInput, type ComposerHandle } from "./Composer";
import { IconArrowDown, IconMemory, IconPlus } from "./icons";
import { KeplarTurn } from "./KeplarTurn";
import { ChatToolsBar } from "./ChatTools";
import { ThreadBar, EditMessage } from "./ThreadBar";
import { docsFor } from "./doc-client";
import { SearchDialog } from "./SearchDialog";
import { Sidebar } from "./Sidebar";
import { initialState, loadScope, persist, reducer, remaining, settle, uid } from "./state/store";
import { activeScopeHeaders, declineImport, importCandidates, importDeclined, importProjects, removeImported, scopeOf, setActiveScope, userIdOf, clearAccountCaches, type Scope } from "./state/scope";
import type { ImportOffer } from "./AccountMenu";
import { StreamHttpError, StreamNetworkError, streamKeplar } from "./state/stream";
import { newTurnKey, pollTurn, stopTurn } from "./state/recovery";
import { notePreloaded, predictNext, recordTransition } from "./predict";
import { draftKeyFor } from "./drafts";
import type { AccountInfo, ChatImage, KeplarMessage, Message, MessageMedia, Project, Thread, UserMessage, View } from "./state/types";
import { ChatImageTurn } from "./chat-image/ChatImageTurn";
import { detectImageIntent } from "@/lib/images/chat-intent";
import { expandPromptIfSlash } from "@/lib/images/slash-commands";
import { OPEN_APP_SEARCH_EVENT } from "@/lib/nav/commands";
import { inDesktopApp } from "@/lib/desktop";
import { followUpPrompt, newKey } from "@/lib/images/chat-flow";
import { UserMedia } from "./UserMedia";
import { RESUME_KEY } from "./SiteProjects";
import { AgentsView, HistoryView, ProjectsView } from "./Views";
import { ReferralClaim } from "./ReferralClaim";
import { useChatSync } from "./useChatSync";
import { useTopicTitles } from "./useTopicTitles";
import { DeleteChatAction, UndoToast } from "./delete/DeleteChat";
import { Presence, usePresence } from "@/components/motion/usePresence";
import { withViewTransition } from "@/lib/ui/view-transition";
import { UNDO_MS, useChatDelete } from "./delete/useChatDelete";
import { UseForPrompt } from "./UseForPrompt";
import { shouldWelcomeBack, WelcomeBack } from "./WelcomeBack";
import { useDockHeight } from "./dock-height";
import { HomeStart } from "./HomeStart";
import { pathForView, viewForPath } from "./app-paths";
import { AppOnboarding } from "@/components/onboarding/AppOnboarding";
import { DeploymentsView } from "./DeploymentsView";
import { StudioView } from "./studio-mode/StudioView";
import { BUSINESS_URL, BUSINESS_VIEWS } from "@/lib/business-site";
import { businessProminent, examplesFor, readUseFor, useForOptions, writeUseFor, type UseFor } from "./use-for";
import type { Ledger } from "./state/types";
import { formatDailyReset } from "@/lib/usage/format";
import { giveBackOne, takeOne } from "@/lib/usage/meter";
import { dismissUpsell, isComplexAnswer, nextUpsell, readUpsell, writeUpsell } from "@/lib/upsell";
import { FIELD_EVENT, askProgress, sceneForView } from "@/field/profile";
import { SendFieldLazy } from "@/components/spatial/SendFieldLazy";
import { looksLikeCorrection, sendSignal } from "@/lib/learning/signals";
import { looksConfused, looksRephrased, sendCoreSignal } from "@/lib/core/signals-client";
import { ExtensionReturn } from "./ExtensionReturn";
import { StudioTurn, type StudioOpen } from "./studio/StudioTurn";
import { AgentFlowTurn } from "./agent-flow/AgentFlow";
import { giveHandoff, SLIDES_OPEN_KEY, STUDY_OPEN_KEY } from "./studio/handoff";
import { CreateTurn } from "./create/CreateTurn";
import { giveAppHandoff } from "../create/apps/handoff";
import { studioOf, type StudioMode } from "@/lib/composer/modes";
import { intentLabel, routeChat, type Intent } from "@/lib/chat-actions/intent";
import { cardHistoryLine, lastCardOf, previousAnswer, previousQuestion } from "./state/cards";
import { deleteProject, mergeProjects, renameProject, type Ops } from "./workspace/project-ops";
import { WorkspaceTurn, type TabTarget } from "./workspace/WorkspaceTurn";
import { AnswerTools } from "./parity/AnswerTools";
import { ChatOptionsBar, PrivateBanner, SpecialistStarters, useSpecialists } from "./parity/ChatOptionsBar";
import { DraftPane } from "./parity/DraftPane";
import s from "./App.module.css";

// Three.js stays out of the main app bundle: loaded on a send (SendFieldLazy), only when a scene can run.
// The studios are separate views; each downloads only when it is opened (AppLoader starts the fetch early for its own route).
/**
 * A studio view that downloads when first needed. Not next/dynamic: that suspends once even when the chunk is already in, and React holds a
 * Suspense fallback for ~300 ms before revealing, which made opening Create feel slow. Here an already-fetched view renders on the first pass.
 */
function lazyView<P extends object>(load: () => Promise<ComponentType<P>>) {
  let cached: ComponentType<P> | null = null;
  const warm = () => load().then((c) => (cached = c));
  function View(props: P) {
    const [C, setC] = useState<ComponentType<P> | null>(() => cached);
    useEffect(() => {
      if (C) return;
      let live = true;
      warm().then((c) => live && setC(() => c)).catch(() => {});
      return () => { live = false; };
    }, [C]);
    return C ? <C {...props} /> : <div aria-busy="true" />;
  }
  return { View, warm };
}
const create = lazyView(() => import("@/components/create/CreateStudio").then((m) => m.CreateStudio as ComponentType<{ embedded?: boolean; signedIn?: boolean | null; plan?: string }>));
const business = lazyView(() => import("@/components/business/BusinessOS").then((m) => m.BusinessOS as ComponentType<{ embedded?: boolean; initialTab?: "overview" | "orders" | "crm" | "apps" | "approvals" }>));
const slides = lazyView(() => import("@/components/slides/SlidesStudio").then((m) => m.SlidesStudio as ComponentType<object>));
const study = lazyView(() => import("@/components/study/StudyMode").then((m) => m.StudyMode as ComponentType<object>));
const CreateStudio = create.View;
const BusinessOS = business.View;
const SlidesStudio = slides.View;
const StudyMode = study.View;
/** Fetch (not run) the studios so opening one is instant: Create once the page is idle, the others when the pointer reaches the sidebar. Skipped on Data Saver. */
function warmViews(all: boolean) {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  create.warm().catch(() => {});
  if (all) for (const v of [business, slides, study]) v.warm().catch(() => {});
}

const newKeplar = (replyTo: string): KeplarMessage => ({
  id: uid("k"),
  role: "keplar",
  replyTo,
  status: "running",
  stages: [],
  capabilities: [],
  models: [],
  draft: "",
  startedAt: Date.now(),
});

/** A picture turn: no panel answer, a card that checks the plan and cost, makes the picture and shows it (chat-image/). */
const newImageKeplar = (replyTo: string, image: ChatImage): KeplarMessage => ({ ...newKeplar(replyTo), status: "done", finishedAt: Date.now(), image });

/** Home greeting by local hour: "Good morning" before noon, "Good afternoon" until 6 pm, then "Good evening". */
const dayGreeting = (hour: number) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

/** Tell Keplar what the person did with an answer (router learning). Negative signals also carry the question; the server keeps it only if the person opted in. */
function signalFor(thread: Thread | undefined, k: KeplarMessage, kind: "up" | "down" | "regenerate" | "copy" | "correct") {
  const user = thread?.messages.find((m): m is UserMessage => m.id === k.replyTo && m.role === "user");
  sendSignal(k.answer?.id, kind, kind === "down" || kind === "regenerate" || kind === "correct" ? user?.text : undefined);
}

function historyFor(thread: Thread | undefined, uptoId?: string) {
  if (!thread) return [];
  const out: KeplarRequest["history"] = [];
  for (const m of thread.messages) {
    if (m.id === uptoId) break;
    if (m.role === "user") out.push({ role: "user", text: m.text });
    else if (m.answer) out.push({ role: "keplar", text: m.answer.markdown.slice(0, 3000) });
    else if (m.image && m.image.phase !== "canceled") out.push({ role: "keplar", text: `[Keplar made a picture here: ${m.image.prompt.slice(0, 300)}]` });
    else {
      const line = cardHistoryLine(m);
      if (line) out.push({ role: "keplar", text: line });
    }
  }
  // The server sends the recent turns word for word and shortens older ones to fit the plan's budget.
  return out.slice(-40);
}

export default function KeplarApp({ initialView }: { initialView?: View }) {
  // Client-only component (no SSR), so the address is readable on the first render.
  const [oauthBack] = useState(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    if (q.get("stripe_connect")) return "stripe"; // back from Stripe's hosted onboarding: open Business → Orders
    const r = q.get("mcp_oauth")?.slice(0, 16) ?? null;
    if (r) {
      try {
        sessionStorage.setItem("keplar.mcp.oauth", JSON.stringify({ result: r })); // idempotent; read once by Connected apps
      } catch {
        /* storage unavailable: the Connected apps list still shows the connection's own status */
      }
    }
    return r;
  });
  const [state, dispatch] = useReducer(reducer, initialView, (v?: View) => { const base = initialState(); return oauthBack ? { ...base, view: "business" as View } : v ? { ...base, view: v } : base; });
  const dockRef = useDockHeight<HTMLDivElement>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The desktop title bar's search box (DesktopTitleBar) opens this search.
  useEffect(() => {
    const open = () => { setDrawerOpen(false); setSearchOpen(true); };
    window.addEventListener(OPEN_APP_SEARCH_EVENT, open);
    return () => window.removeEventListener(OPEN_APP_SEARCH_EVENT, open);
  }, []);
  // Search (Cmd+K toggles it from outside) and the drawer scrim stay mounted while they animate out.
  const search = usePresence(searchOpen);
  const drawerScrim = usePresence(drawerOpen);
  const [atBottom, setAtBottom] = useState(true);
  const [mac] = useState(() => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent));
  const composerRef = useRef<ComposerHandle>(null);
  // The welcome-back screen's own Composer (the same component, so it can attach, talk, switch modes and pick models).
  const welcomeComposerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  // Answer recovery (state/recovery.ts): the turn key each answer attempt was sent with, by Keplar message id.
  const turnKeys = useRef(new Map<string, string>());
  /** Turns started by Refresh research: their Live Research run skips the desktop's cache. */
  const freshResearch = useRef(new Set<string>());
  // In the Keplar One desktop app (Live Research): only there can Refresh research read the pages again. False on the server render.
  const desktopResearch = useSyncExternalStore(noSubscribe, hasResearchBridge, () => false);
  const seedRef = useRef<{ text: string; modes: Partial<ComposerModes> } | null>(null);
  // Bumped on every seed: from the empty home thread "new-thread" changes neither view nor activeThreadId, so without it the
  // "Research a topic" / "Hand off a task" cards did nothing (Deep Research / Agent never switched on).
  const [seedTick, setSeedTick] = useState(0);
  const stateRef = useRef(state);
  // Connected-app tools switch, per conversation ("new" until the first message creates the thread). A request only; the server decides.
  const [toolsMap, setToolsMap] = useState<Record<string, boolean>>({});
  const toolsRef = useRef(toolsMap);
  useEffect(() => { toolsRef.current = toolsMap; }, [toolsMap]);
  // Which account is on screen. The scope id is set synchronously (before any request) so every call carries it.
  const scopeRef = useRef<string>("pending");
  const meterSeq = useRef(0);
  const identityRef = useRef<() => void>(() => undefined);
  const [importTick, setImportTick] = useState(0);
  const [importing, setImporting] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });
  useEffect(() => { setActiveScope(state.scope); }, [state.scope]);
  useEffect(() => {
    // Ask does not preload the Create studio. Create's own route fetches that chunk when it opens.
    if (state.view === "thread") return;
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }).requestIdleCallback;
    if (!ric) { const t = setTimeout(() => warmViews(false), 3000); return () => clearTimeout(t); }
    const id = ric(() => warmViews(false), { timeout: 6000 });
    return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
  }, [state.view]);
  // Predictive preloading (predict.ts): learn which studio usually comes next on this browser and download its code while idle.
  // Code only (never an action or a model call); off with Save-Data or the switch in /account#personalization.
  const prevView = useRef<View | null>(null);
  useEffect(() => {
    const from = prevView.current;
    const to = state.view;
    prevView.current = to;
    if (from && from !== to) recordTransition(from, to);
    const warmers: Partial<Record<View, () => Promise<unknown>>> = { create: create.warm, slides: slides.warm, study: study.warm };
    const go = () => {
      const next = (predictNext(to, 2, undefined, to === "thread") as View[]).filter((v) => v !== to && warmers[v]);
      if (!next.length) return;
      notePreloaded(next);
      for (const v of next) void warmers[v]!().catch(() => {});
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (!w.requestIdleCallback) { const t = setTimeout(go, 2000); return () => clearTimeout(t); }
    const id = w.requestIdleCallback(go, { timeout: 5000 });
    return () => w.cancelIdleCallback?.(id);
  }, [state.view]);
  // Account-bound UI state resets whenever the account on screen changes (adjusting state while rendering, the React way).
  const [seenEpoch, setSeenEpoch] = useState(0);
  if (seenEpoch !== state.epoch) {
    setSeenEpoch(state.epoch);
    setSearchOpen(false);
    setDrawerOpen(false);
    setToolsMap({});
    setImporting({ busy: false, note: null });
  }
  const sync = useChatSync(state, dispatch, () => identityRef.current());
  // Private chats stay out of every list, search and title service: they exist only while they are open.
  const listedThreads = useMemo(() => state.threads.filter((t) => !t.private), [state.threads]);
  const listedState = useMemo(() => (listedThreads.length === state.threads.length ? state : { ...state, threads: listedThreads }), [state, listedThreads]);
  useTopicTitles(listedThreads, dispatch, sync.signedIn, sync.retitle);
  // Delete a chat: gone from the screen at once, brought back by Undo for a few seconds, then deleted for good.
  const del = useChatDelete({ threads: state.threads, activeId: state.activeThreadId, drop: sync.drop, restore: sync.restore, commit: sync.commit });
  const { setMemory } = sync;
  // First-visit preference (localStorage only); null until chosen. Default examples are personal.
  const [useFor, setUseFor] = useState<UseFor | null>(() => readUseFor());
  const [askUseFor, setAskUseFor] = useState(() => readUseFor() === null);
  const [onboardingSettled, setOnboardingSettled] = useState(false);
  const [holdOver, setHoldOver] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setHoldOver(true), 1800); return () => window.clearTimeout(t); }, []);
  const homeReady = holdOver || (state.ledger.synced && (!state.ledger.signedIn || onboardingSettled));
  // Greeting: the signed-in person's first name when the account has one (never guessed from the email address).
  const firstName = state.ledger.signedIn ? (state.account?.name?.trim().split(/\s+/)[0] ?? "").slice(0, 40) : "";
  const [welcome] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "1");
  // The desktop app is its own app, not a mirror of the website: no welcome-back screen (the site home's nav pills, Learn and
  // Company links, model carousel) and no moving home-page backdrop. It opens straight into the app. (KeplarApp is client-only.)
  const [desktop] = useState(inDesktopApp);
  // Coming back signed in (a new visit, landing on the ask page): the welcome-back screen (WelcomeBack, Keplar Canvas Page 1).
  const [welcomeBackOk] = useState(() => typeof window !== "undefined" && !desktop && !welcome && /^\/app(\/ask)?\/?$/.test(window.location.pathname) && shouldWelcomeBack());
  const [welcomeBackDone, setWelcomeBackDone] = useState(false);
  // Keplar Business has its own desktop app (keplarone/keplar-business) and site (business.keplar.one): Keplar One never sends
  // a Business account over. Keplar One's desktop window only shows keplar.one, so a redirect to the Business host would leave it.
  const chooseUseFor = useCallback((v: UseFor) => {
    writeUseFor(v);
    setUseFor(v);
    setAskUseFor(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  useEffect(() => {
    // Drop ?welcome=1 (from sign-up) so a reload doesn't repeat the greeting.
    if (!welcome) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("welcome");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [welcome]);

  useEffect(() => {
    // "Try it now" boxes on marketing pages hand the question over in the URL fragment (#q=...). Prefill only; the visitor presses Send.
    const m = /^#q=(.*)$/.exec(window.location.hash);
    if (!m) return;
    let q = "";
    try {
      q = decodeURIComponent(m[1]).slice(0, 600);
    } catch {
      /* malformed: ignore */
    }
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (q.trim()) composerRef.current?.setText(q);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /* "Import chats from this device?": only for a signed-in account, only chats made before signing in, only after an explicit yes. */
  const signedUserId = userIdOf(state.scope);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- importTick re-reads the device store after an import or a "Not now"
  const deviceChats = useMemo(() => (signedUserId && !importDeclined(signedUserId) ? importCandidates() : []), [signedUserId, importTick]);
  const doImport = useCallback(async () => {
    const scope = scopeRef.current;
    if (!userIdOf(scope)) return;
    const items = importCandidates().map(settle);
    setImporting({ busy: true, note: null });
    const ok: Thread[] = [];
    let stopped = false;
    for (const t of items) {
      if (scopeRef.current !== scope) return; // switched account mid-import: stop, nothing more is sent
      const r = await sync.upload(t);
      if (r === "ok") ok.push(t);
      else if (r === "rate") { stopped = true; break; }
    }
    if (scopeRef.current !== scope) return;
    if (ok.length) {
      dispatch({ type: "import", scope: scope as Scope, threads: ok, projects: importProjects(ok) });
      removeImported(ok.map((t) => t.id)); // saved to the account, so they leave this device
    }
    const left = items.length - ok.length;
    setImporting({ busy: false, note: left ? `Imported ${ok.length} of ${items.length}. The rest are still on this device${stopped ? "; try again in a minute" : ""}.` : null });
    setImportTick((n) => n + 1);
  }, [sync]);
  const declineDeviceChats = useCallback(() => {
    const id = userIdOf(scopeRef.current);
    if (id) declineImport(id);
    setImporting({ busy: false, note: null });
    setImportTick((n) => n + 1);
  }, []);
  const importOffer: ImportOffer | null = deviceChats.length ? { count: deviceChats.length, busy: importing.busy, note: importing.note, onImport: () => void doImport(), onDecline: declineDeviceChats } : null;

  const thread = state.threads.find((t) => t.id === state.activeThreadId);
  const specialists = useSpecialists(state.ledger.signedIn, state.scope);
  const chatSpecialistId = thread ? thread.specialistId ?? null : state.specialistNext ?? null;
  const running = thread?.messages.some((m) => m.role === "keplar" && m.status === "running") ?? false;
  const lastKeplar = [...(thread?.messages ?? [])].reverse().find((m): m is KeplarMessage => m.role === "keplar");

  // Tell the page-wide particle layer how the answer is going: real run state only (stages finished, models responded).
  const fieldP = running && lastKeplar ? askProgress(lastKeplar.stages.filter((x) => x.status === "done").length, lastKeplar.stages.length, lastKeplar.models.length, lastKeplar.modelCount ?? 0) : null;
  useEffect(() => {
    // The particle layer is not mounted on Ask or Create. Skip the event unless a field is actually listening.
    if (!document.documentElement.hasAttribute("data-field")) return;
    window.dispatchEvent(new CustomEvent(FIELD_EVENT, { detail: fieldP === null ? { phase: "idle" } : { phase: "ask", p: Math.round(fieldP * 100) / 100 } }));
  }, [fieldP]);
  // Each view of the app has its own scene (Ask fans out, Create builds, Projects constellation, Agents orbit, Business streams).
  useEffect(() => {
    if (!document.documentElement.hasAttribute("data-field")) return;
    window.dispatchEvent(new CustomEvent(FIELD_EVENT, { detail: { phase: "scene", scene: sceneForView(state.view) } }));
  }, [state.view]);

  /* Usage meter: one server ledger for /app, Create and Business. */
  const syncMeter = useCallback(async () => {
    const seq = ++meterSeq.current;
    try {
      const res = await fetch("/api/compute", { cache: "no-store" });
      if (seq !== meterSeq.current) return true; // a newer sync applies the count
      if (!res.ok) return false;
      const m = (await res.json()) as { used: number; total: number | null; plan: Ledger["plan"]; resetsAt: string | null; paused: boolean; signedIn: boolean; admin?: boolean; account?: AccountInfo | null; windows: Ledger["windows"]; cooldown?: { until: string; message: string } | null; breaker?: { notice: string | null }; daily?: Ledger["daily"]; extension?: Ledger["extension"] };
      if (seq !== meterSeq.current) return true; // a newer answer is on its way: never apply an older identity
      // Whose chats are these? Signed in as one account, or anonymous on this device. Anything else is replaced, not merged.
      if (!m.signedIn || m.account?.id) {
        const next = scopeOf(m.signedIn ? m.account?.id : null);
        const account: AccountInfo | null = m.signedIn && m.account ? { id: m.account.id, email: m.account.email ?? null, name: m.account.name ?? null } : null;
        const prev = scopeRef.current;
        if (prev !== next) {
          scopeRef.current = next;
          setActiveScope(next);
          if (prev !== "pending") {
            controllers.current.forEach((c) => c.abort()); // a run for the previous account must not continue into the next
            controllers.current.clear();
          } // pending: a first question sent before this answer belongs to whoever is on screen, so its run continues (the reducer merges it)
          if (userIdOf(prev)) clearAccountCaches(); // leaving an account: its caches go
          toolsRef.current = {};
          dispatch({ type: "scope", scope: next, account, loaded: loadScope(next) });
        } else dispatch({ type: "scope", scope: next, account });
      }
      dispatch({ type: "ledger", ledger: { used: m.used, total: m.total, plan: m.plan, resetsAt: m.resetsAt, paused: m.paused, signedIn: m.signedIn, windows: m.windows ?? null, cooldown: m.cooldown ?? null, breakerNotice: m.breaker?.notice ?? null, daily: m.plan === "free" ? m.daily ?? null : null, admin: Boolean(m.admin), extension: m.extension ? { balance: m.extension.balance, expiresAt: m.extension.expiresAt, latestGrantAt: m.extension.latestGrantAt ?? null } : null } });
      return true;
    } catch {
      /* offline: keep the last known meter and whoever is on screen */
      return false;
    }
  }, []);
  useEffect(() => { identityRef.current = () => void syncMeter(); }, [syncMeter]);

  useEffect(() => {
    void syncMeter();
    const onFocus = () => void syncMeter();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [syncMeter]);

  useEffect(() => {
    // Create and Business spend from the same ledger; refresh when leaving them.
    if (state.view === "thread") void syncMeter();
  }, [state.view, syncMeter]);

  /* persistence (debounced) */
  useEffect(() => {
    const t = window.setTimeout(() => persist(state), running ? 2000 : 800);
    return () => window.clearTimeout(t);
  }, [state, running]);

  /* The app is a full-screen surface above the marketing chrome: hide that
     chrome from AT and keyboard while /app is mounted. */
  useEffect(() => {
    const root = rootRef.current;
    const main = root?.closest("main");
    // The desktop app's title bar (DesktopTitleBar) is the app's own chrome, not the site's: it stays usable.
    const siblings = main ? [...document.body.children].filter((el) => el !== main && el.tagName !== "SCRIPT" && !el.hasAttribute("data-desktop-titlebar")) : [];
    siblings.forEach((el) => el.setAttribute("inert", ""));
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.scrollbarGutter = "auto"; // the app is a fixed full-screen shell: no empty scrollbar strip beside it on Windows/Linux
    return () => {
      siblings.forEach((el) => el.removeAttribute("inert"));
      document.documentElement.style.overflow = "";
      document.documentElement.style.scrollbarGutter = "";
    };
  }, []);

  /* runs */
  const run = useCallback(async (threadId: string, keplar: KeplarMessage, user: UserMessage, history: KeplarRequest["history"]) => {
    const ctl = new AbortController();
    controllers.current.set(keplar.id, ctl);
    const st = stateRef.current;
    // Media lives in memory only (never localStorage): after a reload it's gone, so don't silently ask without it.
    if (user.media?.some((m) => !m.images?.length)) {
      controllers.current.delete(keplar.id);
      dispatch({ type: "fail", threadId, keplarId: keplar.id, error: { kind: "server", message: "The images and video from this message aren't kept after a reload. Attach them again in a new message.", retryable: false } });
      return;
    }
    const media = user.media?.length ? toMediaInput(user.media) : undefined;
    // Documents are read for one message and kept in this tab only (the chat keeps the file name): after a reload, say so instead of answering without them.
    const docs = docsFor(user.attachments);
    if (user.attachments.length && (docs?.length ?? 0) < user.attachments.length) {
      controllers.current.delete(keplar.id);
      dispatch({ type: "fail", threadId, keplarId: keplar.id, error: { kind: "server", message: "The attached file isn't kept after a reload. Attach it again in a new message.", retryable: false } });
      return;
    }
    // The saved project this chat sits in (the server checks it belongs to this account and applies the Free privacy gate before using it).
    const existingThread = st.threads.find((t) => t.id === threadId);
    const threadProjectId = existingThread ? existingThread.projectId : st.projectFilter;
    const req: KeplarRequest = {
      prompt: user.text,
      history,
      chatId: threadId,
      ...(threadProjectId ? { projectId: threadProjectId } : {}),
      tz: browserTimeZone(),
      attachments: user.attachments,
      ...(docs ? { docs } : {}),
      ...(media ? { media } : {}),
      modes: user.modes,
      ...((existingThread ? existingThread.private : st.privateNext) ? { private: true } : {}),
      ...((existingThread ? existingThread.specialistId : st.specialistNext) ? { specialistId: (existingThread ? existingThread.specialistId : st.specialistNext) as string } : {}),
      routing: st.settings.routing,
      ...(toolsRef.current[threadId] ? { tools: true } : {}),
    };
    // Live Research (Keplar One desktop app 0.2.0+, state/live-run.ts): a web question is researched on this computer first, and the pages
    // it read go with the question. In a browser there is no bridge and nothing here runs. If research can't run, the question still goes.
    const bridge = researchBridge();
    const emitResearch = (research: ResearchEvent) => dispatch({ type: "event", threadId, keplarId: keplar.id, event: { type: "research", research } });
    let live: LiveSession | null = null;
    // Not when the answer can't come anyway (Free out of questions for today, or paused): the server's reply says so at once.
    const L = stateRef.current.ledger;
    // Keplar's own Deep Research takes over from the desktop only where it can run now (a plan with it and a run left).
    const serverDeep = PLAN_ALLOWANCES[L.plan]?.deepResearch === true && deepResearchRunsLeft(remaining(stateRef.current)) >= 1;
    if (bridge && wantsLiveResearch(user.modes) && !wantsLiveResearch(user.modes, user.text)) {
      // Small talk ("thanks!") with Web or Deep Research still on: nothing to research, and never a Deep Research run.
      req.modes = { ...user.modes, deepResearch: false };
    } else if (bridge && wantsLiveResearch(user.modes) && (L.paused || L.daily?.left === 0)) {
      req.modes = modesWithoutLive(user.modes, serverDeep);
    } else if (bridge && wantsLiveResearch(user.modes)) {
      const fresh = freshResearch.current.delete(keplar.id);
      const prep = await prepareLiveResearch({ bridge, question: researchQuestion(user.text, history), depth: user.modes.liveDepth ?? (user.modes.deepResearch ? "deep" : undefined), previousRunIds: previousRunIds(existingThread?.messages, user.id), fresh, signal: ctl.signal, emit: emitResearch });
      if (ctl.signal.aborted) { controllers.current.delete(keplar.id); return; }
      if (prep.ok) {
        live = prep.session;
        // The modes go as the person set them: the server makes it a web question once it keeps the pages (never a second, server Deep
        // Research), and runs the question as asked if it can't use them.
        req.liveResearch = live.field;
        emitResearch({ phase: "step", step: "write", status: "active" });
      } else {
        req.modes = modesWithoutLive(user.modes, serverDeep);
        // Keplar's own Deep Research starts its own card; otherwise the card says why no pages were read.
        if (user.modes.deepResearch && serverDeep) emitResearch({ phase: "reset" });
        else {
          emitResearch({ phase: "live", label: "Live Research didn\u2019t run" });
          emitResearch({ phase: "off", reason: liveFallbackNote(prep.error) });
        }
      }
    }
    // Answer recovery: this attempt's key. A retry after a dropped connection set it to the failed attempt's key (retry below), so the
    // server replays an answer that finished meanwhile instead of running and charging again.
    const turnKey = turnKeys.current.get(keplar.id) ?? newTurnKey();
    turnKeys.current.set(keplar.id, turnKey);
    req.turnKey = turnKey;
    // Free: the question count drops the moment the question is sent (the server confirms it, or gives it back if no answer comes).
    const L0 = stateRef.current.ledger;
    const took = L0.plan === "free" && Boolean(L0.daily);
    if (took && L0.daily) dispatch({ type: "ledger", ledger: { ...L0, daily: takeOne(L0.daily) } });
    let unreached = false;
    try {
      let handedOver = false;
      for await (const event of streamKeplar(req, ctl.signal)) {
        // The server sends research steps only when it runs its own Deep Research (it couldn't use the pages): its card replaces the desktop's.
        if (live && event.type === "research" && !handedOver) { handedOver = true; emitResearch({ phase: "reset" }); }
        // Live Research: the desktop checks the answer's citations against the pages it read before the answer is shown.
        const shown = live && bridge && event.type === "answer" && event.answer.research?.live && !ctl.signal.aborted ? { ...event, answer: await checkLiveAnswer({ bridge, session: live, answer: event.answer, emit: emitResearch }) } : event;
        // Stopped while the desktop was checking: the turn stays stopped.
        if (ctl.signal.aborted) break;
        dispatch({ type: "event", threadId, keplarId: keplar.id, event: shown });
        if (event.type === "memory") setMemory(event.enabled);
        // Soft upsell (Free only, real answers only: never small talk or the creator reply).
        if (event.type === "answer" && !event.answer.smalltalk && stateRef.current.ledger.synced && stateRef.current.ledger.plan === "free") {
          const { state: next, show } = nextUpsell(readUpsell(), { complex: isComplexAnswer(event.answer) });
          writeUpsell(next);
          if (show) dispatch({ type: "upsell", threadId, keplarId: keplar.id, reason: show });
        }
      }
    } catch (e) {
      if (ctl.signal.aborted) return;
      // Answer recovery: the question reached Keplar (the stream dropped mid-answer), or an earlier send of this turn is still being
      // answered. Either way the run carries on there: fetch its answer instead of failing (every state shown is the server's).
      const raced = e instanceof StreamHttpError && e.status === 409 && e.code === "turn_running";
      if ((e instanceof StreamNetworkError && e.reached) || raced) {
        dispatch({ type: "event", threadId, keplarId: keplar.id, event: { type: "recovery", state: "recovering" } });
        const got = await pollTurn(turnKey, ctl.signal).catch(() => null);
        if (ctl.signal.aborted) return;
        if (got?.status === "done" && got.answer) {
          dispatch({ type: "event", threadId, keplarId: keplar.id, event: { type: "recovery", state: "recovered", headless: got.headless } });
          dispatch({ type: "event", threadId, keplarId: keplar.id, event: { type: "answer", answer: got.answer } });
          return;
        }
        dispatch({ type: "event", threadId, keplarId: keplar.id, event: { type: "recovery", state: "lost" } });
        if (got?.status === "failed" && got.error) {
          dispatch({ type: "fail", threadId, keplarId: keplar.id, error: { kind: "server", message: got.error.message, retryable: true } });
          return;
        }
        if (raced) {
          dispatch({ type: "fail", threadId, keplarId: keplar.id, error: { kind: "network", message: "This answer is taking longer than usual. Try again in a moment; it won't run twice.", retryable: true } });
          return;
        }
      }
      if (e instanceof StreamNetworkError) {
        unreached = !e.reached;
        dispatch({ type: "fail", threadId, keplarId: keplar.id, error: { kind: "network", message: e.message, retryable: true } });
      }
      else if (e instanceof StreamHttpError) {
        if (e.status === 409) void syncMeter(); // signed in as someone else in another tab: reload who is on screen
        dispatch({ type: "fail", threadId, keplarId: keplar.id, error: { kind: "server", message: e.message, retryable: e.status >= 500 || e.status === 429, upgrade: (e.status === 429 || e.status === 413) && stateRef.current.ledger.plan === "free" } });
      } else dispatch({ type: "fail", threadId, keplarId: keplar.id, error: { kind: "server", message: "Something went wrong while reading the answer.", retryable: true } });
    } finally {
      controllers.current.delete(keplar.id);
      // Offline: the question never reached Keplar and the real count can't be fetched either, so the one taken on send goes back
      // (it used to stay off: "49 of 50 left" next to "Couldn't reach Keplar"). Back online, the next sync shows the server's number.
      void syncMeter().then((ok) => {
        const L = stateRef.current.ledger;
        if (!ok && took && unreached && L.daily) dispatch({ type: "ledger", ledger: { ...L, daily: giveBackOne(L.daily) } });
      });
    }
  }, [syncMeter, setMemory]);

  const send = useCallback(
    /** `forced`: a card asked for this (a choice, "Show here", "Review drafts"): do `intent` (null = a normal answer) without routing. */
    (text: string, attachments: Attachment[], modes: ComposerModes, media?: MessageMedia[], forced?: { intent: Intent | null }) => {
      const st = stateRef.current;
      const threadId = st.activeThreadId ?? uid("thr");
      const current = st.threads.find((t) => t.id === threadId);
      // Learning: a follow-up that says the last answer was wrong counts against that answer (a signal, never stored text unless the person opted in).
      if (looksLikeCorrection(text)) {
        const prev = [...(current?.messages ?? [])].reverse().find((x): x is KeplarMessage => x.role === "keplar" && Boolean(x.answer));
        if (prev) signalFor(current, prev, "correct");
      } else {
        // Keplar Core outcome tracking (content-free; the server ignores turns it doesn't know and respects the opt-out):
        // a follow-up that reads as confusion, or moving on after a Core answer.
        const last = [...(current?.messages ?? [])].reverse().find((x): x is KeplarMessage => x.role === "keplar" && Boolean(x.answer));
        const lastAsk = [...(current?.messages ?? [])].reverse().find((x): x is UserMessage => x.role === "user");
        if (last?.answer?.core && last.answer.id) sendCoreSignal(last.answer.id, looksConfused(text) ? "confused" : looksRephrased(lastAsk?.text, text) ? "edit" : "complete");
      }
      const stills = Boolean(media?.some((x) => x.kind === "image"));
      const slash = expandPromptIfSlash(text, { hasReference: stills });
      const promptText = slash.prompt;
      const modesForSend: ComposerModes = slash.command ? { ...modes, image: true } : modes;
      const user: UserMessage = { id: uid("u"), role: "user", text: slash.command ? promptText : text, attachments, modes: modesForSend, createdAt: Date.now(), ...(media?.length ? { media } : {}) };
      // Everything a tab does also works here: a chat slash command (/slides, /quiz, /approvals ...) or a clear request in words
      // ("make a slideshow about X", "show my pending approvals", "make slide 3 shorter") becomes that tab's card in the thread.
      // A mode chip is already an explicit choice, so only slash commands override one. Not sure -> null -> a normal answer.
      const msgs = current?.messages ?? [];
      const anyMode = Boolean(modes.deepResearch || modes.create || modes.agent || modes.debate || modes.image || modes.study || modes.slides);
      const routed = forced ? (forced.intent ? { intent: forced.intent, via: "pick" as const } : null) : slash.command || media?.length ? null : routeChat(text, { last: lastCardOf(msgs) });
      if (routed && (forced || routed.via === "slash" || !anyMode)) {
        const i = routed.intent;
        const label = intentLabel(i);
        const base: UserMessage = { ...user, ...(label ? { via: label } : {}) };
        const card = (extra: Partial<KeplarMessage>, u: UserMessage = base) => {
          dispatch({ type: "send", threadId, user: u, keplar: { ...newKeplar(u.id), status: "done", finishedAt: Date.now(), ...extra }, projectId: st.projectFilter });
          setAtBottom(true);
        };
        const answerWith = (u: UserMessage, keplar: KeplarMessage) => {
          dispatch({ type: "send", threadId, user: u, keplar, projectId: st.projectFilter });
          setAtBottom(true);
          void run(threadId, keplar, u, historyFor(current));
        };
        const app = (x: { appId?: string; appName?: string }) => ({ ...(x.appId ? { appId: x.appId } : {}), ...(x.appName ? { appName: x.appName } : {}) });
        switch (i.type) {
          case "slides.new": {
            const brief = i.brief || previousQuestion(msgs)?.text || "";
            return card({ studio: { kind: "slides", phase: "waiting", ...(brief ? { brief } : {}) } }, { ...base, modes: { ...modes, slides: true } });
          }
          case "slides.edit":
            return card({ studio: { kind: "slides", phase: "waiting", id: i.deckId, op: { type: "slide", index: i.index, instruction: i.instruction }, standalone: true } });
          case "slides.theme":
            return card({ studio: { kind: "slides", phase: "waiting", id: i.deckId, op: { type: "theme", theme: i.theme }, standalone: true } });
          case "slides.present":
            return card({ studio: { kind: "slides", phase: "waiting", id: i.deckId, op: { type: "present" }, standalone: true } });
          case "slides.move":
            return card({ studio: { kind: "slides", phase: "waiting", id: i.deckId, op: { type: "move", from: i.from, to: i.to }, standalone: true } });
          case "slides.delete":
            return card({ studio: { kind: "slides", phase: "waiting", id: i.deckId, op: { type: "delete", index: i.index }, standalone: true } });
          case "study.new": {
            if (!i.topic) {
              const prev = previousAnswer(msgs);
              if (prev) return card({ studio: { kind: "study", phase: "waiting", standalone: true, from: prev.id, focus: i.focus } });
            }
            const u: UserMessage = { ...base, text: routed.via === "slash" && i.topic ? i.topic : text, modes: { ...modes, study: true } };
            return answerWith(u, { ...newKeplar(u.id), studio: { kind: "study", phase: "waiting", focus: i.focus } });
          }
          case "study.again":
            return card({ studio: { kind: "study", phase: "ready", id: i.setId, focus: i.focus, standalone: true, ...(i.examDate !== undefined ? { examDate: i.examDate } : {}) } });
          case "create.new":
            return card({ create: { phase: "waiting", ...(i.prompt !== text ? { prompt: i.prompt } : {}) } }, { ...base, modes: { ...modes, create: true } });
          case "create.edit":
            return card({ create: { phase: "waiting", op: { type: "edit", instruction: i.instruction }, ...app(i) } });
          case "create.theme":
            return card({ create: { phase: "waiting", op: { type: "theme", ...(i.style ? { style: i.style } : {}), ...(i.mode ? { mode: i.mode } : {}) }, ...app(i) } });
          case "create.publish":
          case "create.unpublish":
            return card({ create: { phase: "waiting", op: { type: i.type === "create.publish" ? "publish" : "unpublish" }, ...app(i) } });
          case "create.show":
            return card({ create: { phase: "waiting", op: { type: "show" }, appId: i.appId } });
          case "create.domain":
            return card({ create: { phase: "waiting", op: { type: "domain", ...(i.hostname ? { hostname: i.hostname } : {}) }, ...app(i) } });
          case "workspace":
            return card({ workspace: { kind: i.card, ...(i.query ? { query: i.query } : {}), ...(i.act ? { act: i.act } : {}) } });
          case "choose":
            return card({ workspace: { kind: "choose", topic: i.topic, choices: i.choices } });
          case "agent.new": {
            const rest = routed.via === "slash" ? text.replace(/^\s*\/agent\b[\s:]*/i, "").trim() : text;
            const u: UserMessage = { ...base, text: rest || "Set up an agent for me", modes: { ...modes, agent: true } };
            return answerWith(u, newKeplar(u.id));
          }
        }
      }
      // Study / Slides chips: the message goes to that studio (Slides has no panel answer; Study builds after the answer).
      const studio = studioOf(modesForSend);
      if (studio === "slides") {
        const keplar: KeplarMessage = { ...newKeplar(user.id), status: "done", finishedAt: Date.now(), studio: { kind: "slides", phase: "waiting" } };
        dispatch({ type: "send", threadId, user, keplar, projectId: st.projectFilter });
        setAtBottom(true);
        return;
      }
      // Create chip: the message is built into an app right in the chat (the Create pipeline, streamed into a card with a live preview).
      if (modesForSend.create && !studio && !slash.command) {
        const keplar: KeplarMessage = { ...newKeplar(user.id), status: "done", finishedAt: Date.now(), create: { phase: "waiting" } };
        dispatch({ type: "send", threadId, user, keplar, projectId: st.projectFilter });
        setAtBottom(true);
        return;
      }
      // "Create image" toggle, a leading slash image command, or a clear "draw / make / generate an image of ..." request.
      const found = detectImageIntent(promptText, { hasImage: stills });
      const wantsImage = !studio && (modesForSend.image === true || slash.command !== null || (found !== null && !modes.deepResearch && !modes.create && !modes.agent && !modes.debate));
      if (wantsImage) {
        const edit = stills && (found?.edit === true || modesForSend.image === true || Boolean(slash.command?.prefersReference));
        const image: ChatImage = {
          phase: "checking", kind: edit ? "edit" : "create", prompt: (slash.command ? promptText : (found?.prompt ?? promptText)).slice(0, 1000), size: found?.size ?? "1536x1024", quality: "high", key: newKey(),
          ...(edit ? { ref: { from: "upload" as const } } : {}), ...(found?.asked ? { asked: found.asked } : {}),
        };
        dispatch({ type: "send", threadId, user, keplar: newImageKeplar(user.id, image), projectId: st.projectFilter });
        setAtBottom(true);
        return;
      }
      const keplar: KeplarMessage = studio === "study" ? { ...newKeplar(user.id), studio: { kind: "study", phase: "waiting" } } : newKeplar(user.id);
      if (!st.activeThreadId && toolsRef.current.new) {
        toolsRef.current = { ...toolsRef.current, [threadId]: true, new: false };
        setToolsMap((m) => ({ ...m, [threadId]: true, new: false }));
      }
      dispatch({ type: "send", threadId, user, keplar, projectId: st.projectFilter });
      setAtBottom(true);
      void run(threadId, keplar, user, historyFor(current));
    },
    [run],
  );

  const patchImage = useCallback((threadId: string, keplarId: string, patch: Partial<ChatImage>) => dispatch({ type: "image", threadId, keplarId, patch }), []);

  /* Regenerate / Variation / Edit: a new picture turn from this one (the same checks, cost and approval as any picture). */
  const imageFollowUp = useCallback((k: KeplarMessage, f: { kind: "regenerate" | "variation" | "edit"; instruction?: string }) => {
    const st = stateRef.current;
    const t = st.threads.find((x) => x.messages.some((m) => m.id === k.id));
    const from = k.image;
    const jobId = from?.jobId;
    if (!t || !from || !jobId) return;
    const text = f.kind === "regenerate" ? "Regenerate that image" : f.kind === "variation" ? "Make a variation of that image" : `Edit that image: ${f.instruction}`;
    const user: UserMessage = { id: uid("u"), role: "user", text, attachments: [], modes: { web: false, deepResearch: false, create: false, agent: false, image: true }, createdAt: Date.now() };
    const image: ChatImage = {
      phase: "checking", kind: f.kind, size: from.size, quality: from.quality, key: newKey(),
      prompt: f.kind === "regenerate" ? from.prompt : followUpPrompt(f.kind, from.prompt, f.instruction),
      ...(f.kind === "regenerate" ? { regenerateOf: jobId } : { ref: { from: "job" as const, jobId } }),
    };
    dispatch({ type: "send", threadId: t.id, user, keplar: newImageKeplar(user.id, image), projectId: st.projectFilter });
    setAtBottom(true);
  }, []);

  /* "Ask as a normal question": the picture turn becomes an ordinary answer to the same message. */
  const askAsText = useCallback((k: KeplarMessage) => {
    const st = stateRef.current;
    const t = st.threads.find((x) => x.messages.some((m) => m.id === k.id));
    const user = t?.messages.find((m): m is UserMessage => m.id === k.replyTo && m.role === "user");
    if (!t || !user) return;
    const next = newKeplar(user.id);
    dispatch({ type: "retry", threadId: t.id, keplarId: k.id, next });
    void run(t.id, next, user, historyFor(t, user.id));
  }, [run]);

  const retry = useCallback(
    (k: KeplarMessage, opts?: { freshResearch?: boolean }) => {
      const st = stateRef.current;
      const t = st.threads.find((x) => x.messages.some((m) => m.id === k.id));
      const user = t?.messages.find((m): m is UserMessage => m.id === k.replyTo && m.role === "user");
      if (!t || !user) return;
      // A Study turn that never got its set tries again with the new answer; a made set stays where it is.
      const next: KeplarMessage = k.studio?.kind === "study" && k.studio.phase !== "ready" ? { ...newKeplar(user.id), studio: { kind: "study", phase: "waiting" } } : newKeplar(user.id);
      signalFor(t, k, "regenerate");
      // Refresh research (Live Research): the desktop reads the pages again instead of using its cache.
      if (opts?.freshResearch) freshResearch.current.add(next.id);
      // Answer recovery: a retry after a dropped connection is the same turn (an answer that finished meanwhile is replayed, not charged
      // twice). Regenerating an answer that arrived, or retrying any other failure, is a new turn with a new key.
      const prevKey = turnKeys.current.get(k.id);
      if (prevKey && k.error?.kind === "network") turnKeys.current.set(next.id, prevKey);
      dispatch({ type: "retry", threadId: t.id, keplarId: k.id, next });
      void run(t.id, next, user, historyFor(t, user.id));
    },
    [run],
  );

  const stop = useCallback(() => {
    const st = stateRef.current;
    const t = st.threads.find((x) => x.id === st.activeThreadId);
    const k = t?.messages.find((m): m is KeplarMessage => m.role === "keplar" && m.status === "running");
    if (!t || !k) return;
    // Answer recovery: a run keeps going when only its connection drops; Stop says it was the person (before the abort, so the server sees it first).
    const key = turnKeys.current.get(k.id);
    if (key) stopTurn(key);
    controllers.current.get(k.id)?.abort();
    dispatch({ type: "stop", threadId: t.id, keplarId: k.id });
  }, []);

  useEffect(() => {
    const map = controllers.current;
    return () => map.forEach((c) => c.abort());
  }, []);

  const newThread = useCallback((projectId?: string | null) => {
    dispatch({ type: "new-thread", projectId });
    setDrawerOpen(false);
    const path = pathForView("thread");
    if (typeof window !== "undefined" && window.location.pathname !== path) window.history.pushState({ view: "thread" }, "", path);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const openThread = useCallback((id: string) => {
    dispatch({ type: "open-thread", id });
    setDrawerOpen(false);
    setAtBottom(true);
    const path = pathForView("thread");
    if (typeof window !== "undefined" && window.location.pathname !== path) window.history.pushState({ view: "thread" }, "", path);
    const t = stateRef.current.threads.find((x) => x.id === id);
    if (t?.remote) void sync.hydrate(id);
  }, [sync]);

  const tabFocusClear = useRef<() => void>(() => undefined);
  /**
   * Tab switches run inside a view transition (the view area fades and rises; the sidebar holds still), which applies the
   * update a frame later. The latest request lives here, so a quick second switch wins over one still pending.
   */
  const viewTarget = useRef<{ view: View; projectFilter?: string | null } | null>(null);
  const applyView = useCallback(() => {
    const t = viewTarget.current;
    if (!t) return;
    viewTarget.current = null;
    dispatch({ type: "view", view: t.view, projectFilter: t.projectFilter });
  }, []);
  const switchView = useCallback((view: View, projectFilter?: string | null) => {
    viewTarget.current = { view, projectFilter };
    if (view !== stateRef.current.view) withViewTransition(applyView);
    else applyView();
  }, [applyView]);
  const goView = useCallback((view: View, projectFilter?: string | null) => {
    if (BUSINESS_VIEWS.has(view)) { window.location.assign(BUSINESS_URL); return; }
    tabFocusClear.current();
    switchView(view, projectFilter ?? null);
    setDrawerOpen(false);
    const path = pathForView(view);
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      // pushState keeps the shell mounted (a Next.js navigation would remount and drop in-flight answers)
      window.history.pushState({ view }, "", path);
    }
  }, [switchView]);

  /* Back from an app's OAuth sign-in (the callback redirects to /app?mcp_oauth=<result>): keep only the result word, clean the URL. Business opens on /app/business. */
  useEffect(() => {
    if (!oauthBack) return;
    const path = pathForView("business");
    window.history.replaceState(null, "", path);
  }, [oauthBack]);

  /* Browser back/forward: the path is the source of truth for which tab is open. */
  useEffect(() => {
    const onPop = () => {
      const v = viewForPath(window.location.pathname);
      if (v) switchView(v);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [switchView]);

  /* "Open in Study / Slides" from a chat card: the studio opens that set or deck (read once on mount). */
  const openStudio = useCallback((t: StudioOpen) => {
    if (t.id) giveHandoff(t.kind === "study" ? STUDY_OPEN_KEY : SLIDES_OPEN_KEY, t);
    goView(t.kind);
  }, [goView]);
  /* "Open in Create studio" from a chat Create card: the App tab opens that app (or a new one with the chat's prompt). */
  const openCreateApp = useCallback((t: { id?: string; prompt?: string }) => {
    giveAppHandoff(t);
    goView("create");
  }, [goView]);
  const patchCreate = useCallback((threadId: string, keplarId: string, patch: Partial<NonNullable<KeplarMessage["create"]>>) => dispatch({ type: "create", threadId, keplarId, patch }), []);
  const patchStudio = useCallback((threadId: string, keplarId: string, patch: Partial<NonNullable<KeplarMessage["studio"]>>) => dispatch({ type: "studio", threadId, keplarId, patch }), []);
  const patchAgentFlow = useCallback((threadId: string, keplarId: string, patch: Partial<NonNullable<KeplarMessage["agentFlow"]>>) => dispatch({ type: "agentFlow", threadId, keplarId, patch }), []);
  const patchWorkspace = useCallback((threadId: string, keplarId: string, patch: Partial<NonNullable<KeplarMessage["workspace"]>>) => dispatch({ type: "workspace", threadId, keplarId, patch }), []);
  /** A card asks for a follow-up in the chat (a choice, "Show here", "Review drafts", "Rewrite this slide"). */
  const actFromCard = useCallback((text: string, intent: Intent | null) => send(text, [], { web: false, deepResearch: false, create: false, agent: false }, undefined, { intent }), [send]);
  /** "Open in <Tab>" from a chat card: that tab, on the same object where the tab can show one. */
  const [tabFocus, setTabFocus] = useState<TabTarget | null>(null);
  useEffect(() => { tabFocusClear.current = () => setTabFocus(null); }, []);
  const openTab = useCallback((t: TabTarget) => {
    if (t.view === "create") { if (t.appId) openCreateApp({ id: t.appId }); else goView("create"); return; }
    goView(t.view, t.view === "history" ? t.projectId ?? null : null);
    setTabFocus(t);
  }, [goView, openCreateApp]);
  const createProject = useCallback((raw: string): { ok: true; project: Project } | { ok: false; error: string } => {
    const n = raw.trim().replace(/\s+/g, " ");
    if (!n) return { ok: false, error: "Name the project." };
    if (stateRef.current.projects.some((p) => p.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: `A project called “${n}” already exists.` };
    const project: Project = { id: `prj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: n.slice(0, 60), createdAt: Date.now() };
    dispatch({ type: "add-project", project });
    if (stateRef.current.ledger.signedIn) void fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json", ...activeScopeHeaders() }, body: JSON.stringify({ id: project.id, name: project.name }) }).catch(() => undefined);
    return { ok: true, project };
  }, []);
  /** Project and chat housekeeping from chat cards: the same routes and reducer actions as the Projects and History tabs. */
  const projectOps = useMemo<Ops>(() => ({
    fetch: (url, init) => fetch(url, { method: init.method, cache: "no-store", headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...activeScopeHeaders() }, body: init.body }),
    dispatch: (a) => dispatch(a),
    get signedIn() { return stateRef.current.ledger.signedIn; },
  }), []);
  const renameProjectFromCard = useCallback((id: string, name: string) => renameProject(projectOps, stateRef.current.projects, id, name), [projectOps]);
  const deleteProjectFromCard = useCallback((id: string, chats: "keep" | "delete") => deleteProject(projectOps, stateRef.current.projects, stateRef.current.threads, id, chats), [projectOps]);
  const mergeProjectsFromCard = useCallback((from: string, into: string) => mergeProjects(projectOps, stateRef.current.projects, stateRef.current.threads, from, into), [projectOps]);
  // The sidebar marks Study / Slides while its chip is on, and on a thread whose latest turn is a study set or deck (as in the product videos).
  const [composerStudio, setComposerStudio] = useState<StudioMode | null>(null);
  const onComposerModes = useCallback((m: ComposerModes) => setComposerStudio(studioOf(m)), []);
  const modeView: StudioMode | null = state.view === "thread" ? (composerStudio ?? lastKeplar?.studio?.kind ?? null) : null;

  const seedComposer = (text: string, modes: Partial<ComposerModes>) => {
    seedRef.current = { text, modes };
    dispatch({ type: "new-thread" });
    setSeedTick((n) => n + 1);
    const path = pathForView("thread");
    if (typeof window !== "undefined" && window.location.pathname !== path) window.history.pushState({ view: "thread" }, "", path);
  };

  /* apply a pending composer seed once the thread view has rendered */
  useEffect(() => {
    if (state.view !== "thread" || !seedRef.current) return;
    const seed = seedRef.current;
    seedRef.current = null;
    composerRef.current?.setModes(seed.modes);
    composerRef.current?.setText(seed.text);
  }, [state.view, state.activeThreadId, seedTick]);

  /* keyboard shortcuts (app-wide) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (mod && e.shiftKey && k === "o") {
        e.preventDefault();
        newThread();
      } else if (e.key === "Escape") {
        if (searchOpen) return;
        if (drawerOpen) { setDrawerOpen(false); return; }
        if (running) { e.preventDefault(); stop(); return; }
        (document.activeElement as HTMLElement | null)?.blur?.();
      } else if (e.key === "/" && !mod) {
        const el = document.activeElement as HTMLElement | null;
        const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
        if (!typing) { e.preventDefault(); goView("thread"); composerRef.current?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, drawerOpen, running, stop, newThread, goView]);

  /* drawer: focus the first control, trap Tab */
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!drawerOpen) return;
    const el = drawerRef.current;
    const menuBtn = menuBtnRef; // read at close time: the topbar (and its button) remounts with each epoch
    el?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Closing the drawer (Escape, scrim, or picking Projects/Agents/Search...) must not drop focus on <body>:
      // return it to the menu button unless the next view already took it (e.g. the composer, a dialog).
      requestAnimationFrame(() => {
        const a = document.activeElement;
        if (!a || a === document.body || el?.contains(a)) menuBtn.current?.focus({ preventScroll: true });
      });
    };
  }, [drawerOpen]);

  /* scroll: follow the stream while the reader is at the bottom */
  const lastSignature = lastKeplar ? `${lastKeplar.id}:${lastKeplar.stages.length}:${lastKeplar.draft.length}:${lastKeplar.status}` : "";
  useEffect(() => {
    const el = scrollRef.current;
    // Empty thread: keep the welcome (and the first-visit question) in view.
    if (!el || !atBottom || !lastSignature) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [lastSignature, atBottom, state.activeThreadId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Empty chat: the composer sits mid-column over the scroller (not inside it), so it follows the scroll offset and the greeting,
    // composer and starters move as one column instead of sliding through each other (phones, short windows).
    el.parentElement?.style.setProperty("--empty-scroll", `${el.scrollTop}px`);
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (near !== atBottom) setAtBottom(near);
  };

  const jump = () => {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setAtBottom(true);
  };

  const messages: Message[] = useMemo(() => thread?.messages ?? [], [thread]);

  /* The typing reveal grows the answer without any state change here: follow it while the reader is at the bottom. */
  const threadRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(atBottom);
  useEffect(() => {
    atBottomRef.current = atBottom;
  }, [atBottom]);
  useEffect(() => {
    const thread = threadRef.current;
    const el = scrollRef.current;
    if (!thread || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTo({ top: el.scrollHeight });
    });
    ro.observe(thread);
    return () => ro.disconnect();
  }, [state.activeThreadId, state.view, messages.length]);
  const title = state.view === "thread" ? thread?.title ?? "New chat" : state.view === "history" ? "All chats" : state.view[0].toUpperCase() + state.view.slice(1);
  const dailyLow = Boolean(state.ledger.daily && (state.ledger.paused || state.ledger.daily.left / Math.max(1, state.ledger.daily.limit) < 0.2));
  const projectName = state.projects.find((p) => p.id === (thread?.projectId ?? state.projectFilter))?.name;

  return (
    <div ref={rootRef} className={s.app} data-own-search="" data-drawer={drawerOpen || undefined} data-app-ready={state.scope === "pending" ? undefined : ""}>
      {desktop ? null : <SkyBackdrop />}
      <ExtensionReturn onChanged={() => void syncMeter()} />
      <ReferralClaim signedIn={state.ledger.signedIn} onChanged={() => void syncMeter()} />
      <div ref={drawerRef} className={s.sideWrap} data-open={drawerOpen || undefined} onPointerEnter={() => warmViews(true)} onFocus={() => warmViews(true)}>
        <Sidebar
          state={listedState}
          mac={mac}
          onNew={() => newThread()}
          onSearch={() => { setDrawerOpen(false); setSearchOpen(true); }}
          onView={(v) => goView(v)}
          onOpen={openThread}
          onDeleteChat={del.request}
          onClose={drawerOpen ? () => setDrawerOpen(false) : undefined}
          businessProminent={businessProminent(useFor)}
          account={state.ledger.signedIn ? state.account : null}
          importOffer={importOffer}
          modeView={modeView}
          id="keplar-sidebar"
        />
      </div>
      <SendFieldLazy />
      {welcomeBackOk && !welcomeBackDone && state.ledger.synced && state.ledger.signedIn && state.view === "thread" && messages.length === 0 && state.threads.some((t) => !t.private) ? (
        <WelcomeBack
          firstName={firstName}
          plan={state.ledger.plan}
          threads={state.threads}
          composer={
            <Composer
              ref={welcomeComposerRef}
              running={running}
              onSend={(text, attachments, modes, media) => { setWelcomeBackDone(true); send(text, attachments, modes, media); }}
              onStop={stop}
              routing={state.settings.routing}
              onRouting={(routing) => dispatch({ type: "settings", settings: { routing } })}
              computeRemaining={remaining(state)}
              resetsAt={state.ledger.resetsAt}
              plan={state.ledger.plan}
              signedIn={state.ledger.synced ? state.ledger.signedIn : undefined}
              onModesChange={onComposerModes}
              placeholder="Ask Keplar anything"
              draftKey={draftKeyFor(state.scope, null, Boolean(state.privateNext))}
            />
          }
          onStarter={(text, modes) => { welcomeComposerRef.current?.setModes(modes); welcomeComposerRef.current?.setText(text); welcomeComposerRef.current?.focus(); }}
          onOpenThread={(id) => { setWelcomeBackDone(true); openThread(id); }}
          onOpenChats={() => { setWelcomeBackDone(true); goView("history"); }}
          onView={(v) => { setWelcomeBackDone(true); goView(v); }}
          onNewChat={() => { setWelcomeBackDone(true); requestAnimationFrame(() => composerRef.current?.focus()); }}
          onSearch={() => { setWelcomeBackDone(true); setSearchOpen(true); }}
          onClose={() => setWelcomeBackDone(true)}
        />
      ) : null}
      {drawerScrim.mounted ? <div className={s.drawerScrim} onClick={() => setDrawerOpen(false)} aria-hidden="true" {...drawerScrim.motion("fade")} /> : null}

      <div key={state.epoch} className={s.main} inert={drawerOpen || undefined} data-empty={(state.view === "thread" && messages.length === 0) || undefined}>
        <header className={s.topbar} data-keplar-drag>
          <button ref={menuBtnRef} type="button" className={`${s.iconBtn} ${s.menuBtn}`} onClick={() => setDrawerOpen(true)} aria-label="Open sidebar" aria-expanded={drawerOpen} aria-controls="keplar-sidebar">
            <KeplarSymbol size={22} />
          </button>
          <p className={s.topTitle}>
            {projectName ? <span className={s.topProject}>{projectName} / </span> : null}
            {title}
          </p>
          {sync.memory !== null ? (
            // Minimal pass: a quiet icon, not a chip. The state is in its name and tooltip (and a slash when off); one click opens the setting.
            <Link href="/account#memory" className={s.memoryChip} data-memory-status="" data-on={sync.memory || undefined} aria-label={sync.memory ? "Memory on" : "Memory off"} title={sync.memory ? "Memory is on: Keplar remembers your name, goals and past chats. Click to manage." : "Memory is off. Click to turn it on."}>
              <IconMemory size={16} />
            </Link>
          ) : null}
          {state.ledger.synced && state.ledger.plan === "free" ? (
            // Free only, and only when it matters: the daily count and Upgrade appear once fewer than a fifth of today's questions are left.
            // (Paid plans reach billing from the account menu and Settings.) The count stays in the DOM, hidden, so it never jumps in.
            <>
              {state.ledger.daily ? (
                <span className={s.dailyLeft} hidden={!dailyLow} data-daily-left={state.ledger.daily.left} data-low={state.ledger.daily.left <= 5 || undefined} title={`Free plan: ${state.ledger.daily.limit} questions a day. Resets ${formatDailyReset(state.ledger.daily.resetsAt)}.`} role="status" aria-live="polite">
                  {state.ledger.daily.left} of {state.ledger.daily.limit} left
                </span>
              ) : null}
              {dailyLow ? (
                <Link href="/pricing" className={s.upgradeTop}>
                  Upgrade
                </Link>
              ) : null}
            </>
          ) : null}
          {state.view === "thread" && thread && thread.messages.length ? <DeleteChatAction variant="header" title={thread.title} onDelete={() => del.request(thread.id)} /> : null}
          <ThemeToggle className={s.iconBtn} />
          <button type="button" className={`${s.iconBtn} ${s.newBtnMobile}`} onClick={() => newThread()} aria-label="New chat">
            <IconPlus size={18} />
          </button>
        </header>

        {state.view === "thread" ? (
          <>
            <div ref={scrollRef} className={s.scroll} onScroll={onScroll}>
              {messages.length === 0 ? (
                <div className={s.empty}>
                  <div className={s.welcome}>
                    {/* Held invisible (same height) until the session is known, so the name never pops in over a generic line.
                        firstName is only set after the client knows the session, so the time-of-day greeting never renders on the server. */}
                    <h1 className={s.welcomeTitle} data-welcome-name={firstName || undefined} style={state.ledger.synced ? undefined : { visibility: "hidden" }}>
                      <KeplarSymbol size={22} className={s.welcomeMark} />
                      <span>
                        {firstName ? (
                          <>
                            <span className={s.welcomeGreet}>{welcome ? "Welcome," : `${dayGreeting(new Date().getHours())},`}</span> <span className={s.welcomeName}>{firstName}</span>
                          </>
                        ) : <span className={s.welcomeGreet}>{state.ledger.synced ? `${dayGreeting(new Date().getHours())}.` : "Welcome to Keplar."}</span>}
                      </span>
                    </h1>
                    <p className={s.welcomeLede}>Ask anything. Keplar checks with several models and gives you one clear answer.</p>
                  </div>
                  <div className={s.emptyBody}>
                  {state.privateNext ? <PrivateBanner onClose={() => dispatch({ type: "private-next", on: false })} /> : null}
                  <SpecialistStarters specialist={specialists.find((x) => x.id === chatSpecialistId) ?? null} onSend={(text) => send(text, [], { web: false, deepResearch: false, create: false, agent: false })} />
                  {state.ledger.synced && state.ledger.signedIn ? (
                    <AppOnboarding onAsk={(text) => send(text, [], { web: false, deepResearch: false, create: false, agent: false })} onView={(v) => goView(v)} refresh={state.threads.length} onSettled={() => setOnboardingSettled(true)} />
                  ) : null}
                  {/* Hold the tiles and examples until we know whether the onboarding card goes above them: it used to be inserted
                      ~0.5 s after first paint and shoved everything down 800 px (Lighthouse CLS 0.45 on /app, phone). */}
                  {homeReady ? (<>
                  <HomeStart
                    showBusiness={businessProminent(useFor)}
                    onSeed={seedComposer}
                    onView={(v) => goView(v)}
                    onSend={(text) => send(text, [], { web: false, deepResearch: false, create: false, agent: false })}
                    more={<>
                  {askUseFor ? null : (
                    <p className={s.useForLine}>
                      Examples for {useForOptions.find((o) => o.id === (useFor ?? "personal"))?.label.toLowerCase()} use.{" "}
                      <button type="button" className={s.useForChange} onClick={() => setAskUseFor(true)}>
                        Change
                      </button>
                    </p>
                  )}
                  <ul className={s.examples} aria-label="Example questions">
                    {examplesFor(useFor).map((p) => (
                      <li key={p.label}>
                        <button type="button" className={s.example} onClick={() => send(p.label, [], { web: false, deepResearch: false, create: false, agent: false })}>
                          <span>{p.label}</span>
                          <span className={s.exampleHint}>{p.hint}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                    </>}
                  />
                  {/* The one-time "What will you use Keplar for?" question sits under the suggestions, not above the greeting's chips. */}
                  {askUseFor ? (
                    <UseForPrompt value={useFor} onChoose={chooseUseFor} onSkip={() => chooseUseFor(useFor ?? "personal")} />
                  ) : null}
                  </>) : null}
                  </div>
                </div>
              ) : (
                <div ref={threadRef} className={s.thread} role="log" aria-label={thread?.title} aria-live="off" data-motion="stream">
                  {thread?.private ? <PrivateBanner onClose={() => newThread()} /> : null}
                  {thread ? <ThreadBar thread={thread} signedIn={state.ledger.signedIn} /> : null}
                  {messages.map((m) =>
                    m.role === "user" ? (
                      <div key={m.id} className={s.userTurn}>
                        {m.media?.length ? <UserMedia media={m.media} /> : null}
                        <p className={s.userMsg} dir="auto">{m.text}</p>
                        {m.text && !running ? <EditMessage onEdit={() => { composerRef.current?.setText(m.text); composerRef.current?.focus(); }} /> : null}
                        {m.attachments.length || m.via || Object.values(m.modes).some(Boolean) ? (
                          <p className={s.userMeta}>
                            {[
                              ...m.attachments.map((a) => a.name),
                              m.via,
                              m.modes.web && "Web",
                              m.modes.deepResearch && "Deep Research",
                              m.modes.create && "Create",
                              m.modes.image && "Create image",
                              m.modes.agent && "Agent",
                              m.modes.debate && "Debate",
                              m.modes.reason && "Reason",
                              m.modes.study && m.via !== "Study" && m.via !== "Quiz" && m.via !== "Flashcards" && "Study",
                              m.modes.slides && m.via !== "Slides" && "Slides",
                            ].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    ) : m.image ? (
                      <ChatImageTurn
                        key={m.id}
                        message={m}
                        media={(messages.find((x) => x.id === m.replyTo) as UserMessage | undefined)?.media}
                        onPatch={(patch) => patchImage(thread!.id, m.id, patch)}
                        onFollowUp={(f) => imageFollowUp(m, f)}
                        onAskText={() => askAsText(m)}
                        onSettled={() => void syncMeter()}
                      />
                    ) : m.create ? (
                      <CreateTurn
                        key={m.id}
                        message={m}
                        user={messages.find((x): x is UserMessage => x.id === m.replyTo && x.role === "user")}
                        ledger={state.ledger}
                        onPatch={(patch) => patchCreate(thread!.id, m.id, patch)}
                        onOpen={openCreateApp}
                        onSettled={() => void syncMeter()}
                      />
                    ) : m.workspace ? (
                      <WorkspaceTurn
                        key={m.id}
                        message={m}
                        user={messages.find((x): x is UserMessage => x.id === m.replyTo && x.role === "user")}
                        ledger={state.ledger}
                        isLast={m.id === lastKeplar?.id}
                        onPatch={(patch) => patchWorkspace(thread!.id, m.id, patch)}
                        onSettled={() => void syncMeter()}
                        onOpenTab={openTab}
                        onAct={actFromCard}
                        onSeed={(text) => { composerRef.current?.setText(text); composerRef.current?.focus(); }}
                        projects={state.projects}
                        threads={listedThreads}
                        activeThreadId={state.activeThreadId}
                        onOpenThread={openThread}
                        onCreateProject={createProject}
                        onNewInProject={(id) => newThread(id)}
                        onMoveThread={sync.move}
                        onRenameProject={renameProjectFromCard}
                        onDeleteProject={deleteProjectFromCard}
                        onMergeProjects={mergeProjectsFromCard}
                        onRenameThread={sync.rename}
                        onDeleteThread={del.request}
                      />
                    ) : m.studio?.kind === "slides" || m.studio?.standalone ? (
                      <StudioTurn
                        key={m.id}
                        message={m}
                        user={messages.find((x): x is UserMessage => x.id === m.replyTo && x.role === "user")}
                        ledger={state.ledger}
                        onPatch={(patch) => patchStudio(thread!.id, m.id, patch)}
                        onOpen={openStudio}
                        onSettled={() => void syncMeter()}
                        onAct={actFromCard}
                        sourceAnswer={m.studio.from ? (messages.find((x) => x.id === m.studio!.from) as KeplarMessage | undefined)?.answer?.markdown : undefined}
                      />
                    ) : (
                      <Fragment key={m.id}>
                      <KeplarTurn
                        message={m}
                        isLast={m.id === lastKeplar?.id}
                        onRetry={() => retry(m)}
                        onRefreshResearch={m.answer?.research?.live && desktopResearch ? () => retry(m, { freshResearch: true }) : undefined}
                        onSignal={(kind) => signalFor(thread, m, kind)}
                        onAsk={(text) => send(text, [], { web: false, deepResearch: false, create: false, agent: false })}
                        ledger={state.ledger}
                        onDismissUpsell={() => {
                          writeUpsell(dismissUpsell(readUpsell()));
                          dispatch({ type: "upsell", threadId: thread!.id, keplarId: m.id, reason: null });
                        }}
                      />
                      <AnswerTools message={m} user={messages.find((x): x is UserMessage => x.id === m.replyTo && x.role === "user")} />
                      {m.studio ? (
                        <StudioTurn
                          message={m}
                          user={messages.find((x): x is UserMessage => x.id === m.replyTo && x.role === "user")}
                          ledger={state.ledger}
                          onPatch={(patch) => patchStudio(thread!.id, m.id, patch)}
                          onOpen={openStudio}
                          onSettled={() => void syncMeter()}
                        />
                      ) : null}
                      {m.agentFlow || (m.id === lastKeplar?.id && m.status === "done" && m.answer && (messages.find((x) => x.id === m.replyTo) as UserMessage | undefined)?.modes?.agent) ? (
                        <AgentFlowTurn
                          message={m}
                          user={messages.find((x): x is UserMessage => x.id === m.replyTo && x.role === "user")}
                          ledger={state.ledger}
                          isLast={m.id === lastKeplar?.id}
                          onPatch={(patch) => patchAgentFlow(thread!.id, m.id, patch)}
                          onSettled={() => void syncMeter()}
                        />
                      ) : null}
                      </Fragment>
                    ),
                  )}
                </div>
              )}
            </div>

            {!atBottom && messages.length > 0 ? (
              <button type="button" className={s.jump} onClick={jump}>
                <IconArrowDown size={14} /> Latest
              </button>
            ) : null}

            <div
              ref={dockRef}
              className={s.dock}
              onWheel={(e) => {
                // Overlay dock: a wheel over the composer / footer note scrolls the thread underneath (textarea scrolls only when it overflows).
                const t = e.target as HTMLElement;
                if (t.closest("textarea, [role=listbox], [role=menu], select") && (t.closest("textarea")?.scrollHeight ?? 0) > (t.closest("textarea")?.clientHeight ?? 0) + 1) return;
                scrollRef.current?.scrollBy({ top: e.deltaY, left: 0 });
              }}
            >
              <ChatOptionsBar
                isNew={messages.length === 0}
                privateOn={Boolean(state.privateNext)}
                onPrivate={(on) => dispatch({ type: "private-next", on })}
                specialists={specialists}
                specialistId={chatSpecialistId}
                onSpecialist={(id) => dispatch({ type: "set-specialist", id })}
                signedIn={state.ledger.signedIn}
              />
              <UsageNotice cooldown={state.ledger.cooldown ?? null} breakerNotice={state.ledger.breakerNotice ?? null} onEnd={syncMeter} />
              <ChatToolsBar
                show={state.ledger.synced && state.ledger.signedIn && state.ledger.plan !== "free"}
                synced={state.ledger.synced}
                on={Boolean(toolsMap[state.activeThreadId ?? "new"])}
                onChange={(v) => { const key = state.activeThreadId ?? "new"; toolsRef.current = { ...toolsRef.current, [key]: v }; setToolsMap((m) => ({ ...m, [key]: v })); }}
                onOpenApps={() => goView("business")}
              />
              <Composer
                ref={composerRef}
                running={running}
                onSend={send}
                onStop={stop}
                routing={state.settings.routing}
                onRouting={(routing) => dispatch({ type: "settings", settings: { routing } })}
                computeRemaining={remaining(state)}
                resetsAt={state.ledger.resetsAt}
                plan={state.ledger.plan}
                signedIn={state.ledger.synced ? state.ledger.signedIn : undefined}
                onModesChange={onComposerModes}
                placeholder={messages.length ? "Reply to Keplar…" : "How can Keplar help you today?"}
                draftKey={draftKeyFor(state.scope, state.activeThreadId, Boolean(state.threads.find((x) => x.id === state.activeThreadId)?.private ?? state.privateNext))}
              />
              <p className={s.dockNote}>Keplar can be wrong, even when models agree. Verify important decisions.</p>
            </div>
          </>
        ) : state.view === "create" ? (
          <div className={s.createHost}>
            <CreateStudio embedded signedIn={state.scope === "pending" ? null : state.ledger.signedIn} plan={state.ledger.plan} />
          </div>
        ) : state.view === "slides" ? (
          <div className={s.createHost}>
            <SlidesStudio />
          </div>
        ) : state.view === "study" ? (
          <div className={s.createHost}>
            <StudyMode />
          </div>
        ) : state.view === "business" ? (
          <div className={s.createHost}>
            <BusinessOS embedded initialTab={oauthBack === "stripe" ? "orders" : oauthBack ? "apps" : tabFocus?.view === "business" ? tabFocus.tab : undefined} />
          </div>
        ) : state.view === "approvals" ? (
          <div className={s.createHost}>
            <BusinessOS embedded initialTab="approvals" />
          </div>
        ) : state.view === "studio" ? (
          <div className={s.scroll}>
            <StudioView plan={state.ledger.plan} signedIn={state.ledger.synced ? state.ledger.signedIn : null} />
          </div>
        ) : state.view === "deployments" ? (
          <div className={s.scroll}>
            <DeploymentsView onOpenCreate={() => goView("create")} />
          </div>
        ) : (
          <div className={s.scroll}>
            {state.view === "history" ? (
              <HistoryView key={tabFocus?.view === "history" ? `q:${tabFocus.query ?? ""}` : "h"} initialQuery={tabFocus?.view === "history" ? tabFocus.query : undefined} state={listedState} signedIn={sync.signedIn} onRename={sync.rename} onOpen={openThread} onDelete={del.request} onMove={sync.move} />
            ) : state.view === "projects" ? (
              <ProjectsView
                key={tabFocus?.view === "projects" ? `p:${tabFocus.projectId ?? ""}` : "p"}
                initialOpenId={tabFocus?.view === "projects" ? tabFocus.projectId : undefined}
                state={listedState}
                signedIn={sync.signedIn}
                onCreate={(project) => dispatch({ type: "add-project", project })}
                onMerge={(projects) => dispatch({ type: "merge-projects", scope: state.scope, projects })}
                onRemoved={(id, chats) => dispatch({ type: "remove-project", id, chats })}
                onChatsCleared={(id) => dispatch({ type: "drop-project-chats", id })}
                onOpenProject={(id) => goView("history", id)}
                onNewInProject={(id) => newThread(id)}
                onOpenThread={openThread}
                onResumeSite={(id) => { try { sessionStorage.setItem(RESUME_KEY, id); } catch { /* storage unavailable: Create opens the latest site */ } goView("create"); }}
              />
            ) : (
              <AgentsView onStart={() => seedComposer("", { agent: true })} signedIn={sync.signedIn} onOpenApprovals={() => goView("approvals")} />
            )}
          </div>
        )}
      </div>

      <Presence value={del.toast}>{(t, p) => <UndoToast key={t.id} title={t.title} ms={UNDO_MS} onUndo={() => del.undo(t.id)} motion={p.motion("toast")} />}</Presence>

      <DraftPane key={state.scope} scope={state.scope} plan={state.ledger.plan} onAsk={(text) => send(text, [], { web: false, deepResearch: false, create: false, agent: false })} />

      {search.mounted ? (
        <SearchDialog threads={listedThreads} onClose={() => setSearchOpen(false)} onOpen={openThread} onNew={() => newThread()} onView={(v) => goView(v)} presence={search} />
      ) : null}
    </div>
  );
}
