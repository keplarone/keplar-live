import type { ChatTemplate, FlowApproval } from "@/lib/business/chat-flow";
import type {
  Attachment,
  Capability,
  ComposerModes,
  KeplarAnswer,
  RoutingPreferences,
  StageId,
  ToolUse,
} from "@/lib/orchestration/types";
import type { ImageInput } from "@/lib/orchestration/media";
import type { ChatImage } from "@/lib/images/chat-types";
import type { LiveDebate } from "./debate";
import type { LiveResearch } from "./research";
import type { LiveCore } from "./core";
import type { DeckTheme } from "@/lib/slides/types";
import type { Choice, StudyFocus, WorkspaceAct, WorkspaceKind } from "@/lib/chat-actions/intent";

export type { ChatImage };

export type StageState = { id: StageId; status: "active" | "done"; detail?: string };

export type ModelTick = { id: string; name: string; status: "responded" | "failed" | "refused" };

/**
 * Images / a video attached to a user message. `thumb` and `images` (the data
 * URLs actually sent) live only in memory: persist() strips them, so media is
 * never written to localStorage and is gone after a reload.
 */
export type MessageMedia = {
  id: string;
  kind: "image" | "video";
  name: string;
  bytes: number;
  durationSec?: number;
  frames?: number;
  thumb?: string;
  /** Object URL of the original file (in memory), for full-quality viewing. */
  full?: string;
  images?: ImageInput[];
};

export type UserMessage = {
  id: string;
  role: "user";
  text: string;
  attachments: Attachment[];
  media?: MessageMedia[];
  modes: ComposerModes;
  /** What the chat did with this message when it wasn't a plain question ("Slides", "Approvals", ...): shown under it. */
  via?: string;
  createdAt: number;
};

/**
 * A Study or Slides turn started from the composer chips. The work is done by the existing studio APIs (/api/study/sets,
 * /api/slides/decks); the message keeps only what the card needs to show the result again and to open it in the studio.
 *   study:  waiting (for the answer) -> working -> ready | failed      signin / skipped end it early
 *   slides: waiting -> working -> ready | failed                       signin / locked end it early
 * A reload during "working" becomes "interrupted" (the studio may still have finished it; the card says where to look).
 */
export type StudioTurn = {
  kind: "study" | "slides";
  phase: "waiting" | "working" | "ready" | "failed" | "signin" | "locked" | "skipped" | "interrupted";
  /** Study set id or deck id once made. */
  id?: string;
  title?: string;
  /** Slides asked for (slides) while working. */
  count?: number;
  theme?: DeckTheme;
  error?: string;
  credits?: number;
  /** Study: what the set was built from. */
  source?: "documents" | "answer";
  /** Slides: the brief when it isn't the message itself ("turn this into slides" uses the question before it). */
  brief?: string;
  /** Slides follow-up on a deck already made ("make slide 3 shorter", "switch to light", "present it"). Needs `id`. */
  op?: { type: "slide"; index: number; instruction: string } | { type: "theme"; theme: DeckTheme } | { type: "present" } | { type: "move"; from: number; to: number } | { type: "delete"; index: number };
  /** Study "my exam is on Nov 3" follow-up: the exam date to save on the set (YYYY-MM-DD; "" clears it). Saved once (opDone). */
  examDate?: string;
  /** Slides "delete" follow-up: done after the confirm click, or left as it was. Study exam date: saved. */
  opDone?: "done" | "cancelled";
  /** Slides: the slide the follow-up rewrote (highlighted). */
  changed?: number;
  /** Study: what opens first inside the card (flashcards, the A-D quiz, or the overview with mastery). */
  focus?: StudyFocus;
  /** A card with no panel answer above it: a follow-up on a set or deck, or a set built from an earlier answer. */
  standalone?: boolean;
  /** Study built from an earlier answer in the thread (that Keplar message's id). */
  from?: string;
};

/**
 * Agent mode in the chat: the workflow card under the answer (Schedule → data → Draft → Owner approval).
 *   choose (no clear workflow) | ready (planned, waits for the owner's click) -> running -> done | error      signin ends it early
 * Everything after "ready" comes from the real run (POST /api/business/agents/from-chat) and the approvals route.
 */
export type AgentFlow = {
  phase: "choose" | "ready" | "running" | "done" | "error" | "signin" | "interrupted";
  template?: ChatTemplate;
  monitor?: { url: string; keyword?: string };
  agent?: { id: string; name: string; trigger: string; reused: boolean };
  steps: string[];
  run?: { id: string; status: "succeeded" | "failed" | "waiting_approval" | "running" | "stopped"; error?: string; needs?: { connector: string; label: string; problem: string }[]; units?: number };
  approvals: FlowApproval[];
  error?: string;
  code?: string;
};

/**
 * A Create turn (composer Create chip): the message is built into a working app by the Keplar Apps pipeline, inline in the chat
 * (plan -> files -> tests -> requested vs built, live preview, publish). The app itself lives in Create; the message keeps only
 * what the card needs to show it again or resume the build after a reload.
 *   waiting -> (confirm) -> working -> ready | failed        signin ends it early
 */
export type ChatCreate = {
  phase: "waiting" | "confirm" | "working" | "ready" | "failed" | "signin" | "choose";
  appId?: string;
  buildId?: string;
  name?: string;
  previewUrl?: string;
  liveUrl?: string;
  /** Credits the build is expected to use (confirm step). */
  estimate?: number;
  error?: string;
  /** What to build when it isn't the message itself (a slash command's text). */
  prompt?: string;
  /**
   * A follow-up on an app already built, asked in the chat: change it (an edit build), restyle it (no model, no credits), or
   * publish / unpublish it (the owner confirms with one click). `appName` is resolved against the account's apps when there's no `appId`.
   */
  op?: { type: "edit"; instruction: string } | { type: "theme"; style?: string; mode?: "light" | "dark" } | { type: "publish" } | { type: "unpublish" } | { type: "show" } | { type: "domain"; hostname?: string };
  appName?: string;
  /** Publish / unpublish asked in words: what happened once the owner answered. */
  opDone?: "done" | "declined";
  /** The name matched none (or several) of the account's apps: pick one. */
  choices?: { id: string; name: string }[];
};

/**
 * A workspace card in the chat: the same lists and actions as the Apps, Approvals, Business (CRM, leads, dashboard), Agents,
 * Projects, Deployments and History tabs, loaded live from their APIs each time it is shown (so it is never stale after a reload).
 * The message keeps only what to show and what was already done, so a reload never repeats an action.
 * "choose" is the router's "did you mean" card: a tool, or a normal answer.
 */
export type WorkspaceCard = {
  kind: WorkspaceKind | "choose";
  /** History: what to look for. */
  query?: string;
  /** Asked in words: run / pause / resume an agent, or make a project. */
  act?: WorkspaceAct;
  /** The act's outcome, once it happened (or was declined). */
  acted?: { ok: boolean; text: string };
  /** choose: the topic and the options; `picked` once one was chosen. */
  topic?: string;
  choices?: Choice[];
  picked?: number;
};

export type KeplarMessage = {
  id: string;
  role: "keplar";
  /** The user message this answers; used for retry. */
  replyTo: string;
  status: "running" | "done" | "error" | "limit" | "stopped";
  mode?: "single" | "consensus";
  /** Casual chat: one free model, a plain reply with no comparison UI. */
  smalltalk?: boolean;
  stages: StageState[];
  capabilities: Capability[];
  models: ModelTick[];
  modelCount?: number;
  disagreement?: string;
  draft: string;
  /** Connected-app tool uses while the answer streams (the final answer carries them too). */
  tools?: ToolUse[];
  answer?: KeplarAnswer;
  error?: {
    /** "no_response": no model answered (nothing was charged). */
    kind: "network" | "server" | "no_response";
    message: string;
    retryable: boolean;
    /** Free plan hit a limit, or no model responded: offer Plus. */
    upgrade?: boolean;
  };
  /** Debate mode (BETA): the live transcript while the models argue, or why a requested debate didn't run. */
  debate?: LiveDebate;
  /** Deep Research: the live plan, step progress and pages read while the run works (dropped once the answer arrives). */
  research?: LiveResearch;
  /** Keplar Core: the live plan, step progress and checks while a Thorough / Exhaustive answer is worked on (dropped once the answer arrives). */
  core?: LiveCore;
  /** Signed in: what memory did for this answer ("Memory updated" when `saved` > 0). */
  memory?: { saved: number; summarized?: boolean; used?: number };
  /** Free plan only: a soft, dismissible note about Plus (upsell.ts). */
  upsell?: "milestone" | "complex";
  /** A picture turn (Create image toggle or a clear "draw me..." request). Has no panel answer. */
  image?: ChatImage;
  /** A Study or Slides turn (composer chips). Slides turns have no panel answer; Study turns follow the answer. */
  studio?: StudioTurn;
  /** Agent mode: the workflow card under the answer. */
  agentFlow?: AgentFlow;
  /** A Create turn (composer Create chip): an app built inline. Has no panel answer. */
  create?: ChatCreate;
  /** A workspace card (apps, approvals, CRM, leads, dashboard, agents, projects, deployments, history) or a choice card. No panel answer. */
  workspace?: WorkspaceCard;
  limit?: { required: number; remaining: number; window?: { id: "fiveHour" | "weekly"; label: string; resetsAt: string; message: string }; daily?: { limit: number; resetsAt: string }; budget?: "day"; resetsAt?: string };
  startedAt: number;
  finishedAt?: number;
};

export type Message = UserMessage | KeplarMessage;

export type Thread = {
  id: string;
  title: string;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  /** Saved on the server (signed in) but its messages are not loaded yet; they load when it is opened. */
  remote?: boolean;
  /** Who wrote the title: "user" (renamed, never touched), "auto" (instant topic title, may be refined once), "topic" (final topic title). Missing = made before topic titles. */
  titleBy?: "user" | "auto" | "topic";
  /** Private chat: kept in memory on this screen only. Never saved (browser or account), never used for memory, gone when you leave it. */
  private?: boolean;
  /** The Specialist (saved instructions + knowledge) this chat answers with. */
  specialistId?: string;
};

export type Project = { id: string; name: string; createdAt: number };

export type View = "thread" | "projects" | "agents" | "create" | "slides" | "study" | "business" | "history" | "deployments" | "approvals" | "studio";

/**
 * Mirror of the server Usage meter (GET /api/compute). The ledger itself
 * lives server-side per workspace; this is display state only.
 */
export type Ledger = {
  used: number;
  /** null = custom contract (no fixed allowance). */
  total: number | null;
  plan: "free" | "lite" | "plus" | "pro" | "business";
  resetsAt: string | null;
  paused: boolean;
  signedIn: boolean;
  /** Rolling 5-hour / weekly limits (Plus and Pro only; null otherwise). */
  windows: { id: "fiveHour" | "weekly"; label: string; used: number; limit: number; resetsAt: string | null }[] | null;
  /** Keplar usage cooldown from the server meter (null/undefined = none). */
  cooldown?: { until: string; message: string } | null;
  /** Global breaker notice (e.g. lighter models today), null when normal. */
  breakerNotice?: string | null;
  /** Free plan: questions used / left today (server count, exact). Null on paid plans. */
  daily?: { used: number; limit: number; left: number; resetsAt: string } | null;
  /** Admin accounts have no allowance (unlimited). */
  admin?: boolean;
  /** Bought limit-extension credits (paid plans): spent only after the plan's own limit; they expire. Null on Free. */
  extension?: { balance: number; expiresAt: string | null; latestGrantAt?: string | null } | null;
  synced: boolean;
};

export type Settings = {
  routing: RoutingPreferences;
};

/** Who is signed in on this browser (from the server session). */
export type AccountInfo = { id: string; email: string | null; name: string | null };

export type AppState = {
  /** The signed-in account, or null. Replaced (never merged) when the account changes. */
  account: AccountInfo | null;
  /** Bumps whenever the account on screen changes, so account-bound UI state is reset. */
  epoch: number;
  /** Who owns the chats on screen: "pending" (not known yet), "anon" (this device) or "user:<id>". */
  scope: "pending" | "anon" | `user:${string}`;
  threads: Thread[];
  projects: Project[];
  activeThreadId: string | null;
  view: View;
  projectFilter: string | null;
  ledger: Ledger;
  settings: Settings;
  /** New-chat options, applied when the first message creates the chat. */
  privateNext?: boolean;
  specialistNext?: string | null;
};
