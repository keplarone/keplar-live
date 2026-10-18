/** One clip made from a chat message. The file lives in the video library; this is the card's state. */
import type { ChatAspect } from "./chat-intent";

export type ChatVideo = {
  phase: "checking" | "options" | "confirm" | "working" | "ready" | "failed" | "blocked" | "canceled";
  prompt: string;
  /** The message asked for a clip and never said what it should show. The card asks before Create video enables. */
  needsSubject?: boolean;
  /** Shape named in the message, when it was one of the two the card offers. */
  statedAspect: ChatAspect | null;
  /** Seconds named in the message, before the allowed list is applied. */
  statedDuration: number | null;
  /** The shape that will be (or was) sent. */
  aspect?: ChatAspect;
  /** The length that will be (or was) sent. */
  durationSec?: number;
  /** Lengths the plan's model accepts. Filled once the config is read. */
  durations?: number[];
  aspects?: ChatAspect[];
  /** Idempotency key: the same key is the same job. */
  key: string;
  modelId?: string;
  jobId?: string;
  url?: string;
  estimateUnits?: number;
  units?: number;
  /** Above the pipeline's large-job line: a second confirm before anything is submitted. */
  large?: boolean;
  /** queued | running, while working. */
  status?: string;
  error?: string;
  blocked?: { reason: "signin" | "plan" | "config" | "paused" | "limit" | "credits" | "other"; message: string; upgradeTo?: string };
  /** Set when the file's shape or length does not match what was sent. */
  mismatch?: string;
};
