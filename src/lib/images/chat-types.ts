/** One picture made in chat (/api/images). The image itself lives in the image library; this keeps the card's state. */
export type ChatImage = {
  phase: "checking" | "blocked" | "confirm" | "working" | "ready" | "failed" | "canceled";
  kind: "create" | "regenerate" | "variation" | "edit";
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  quality: "low" | "medium" | "high";
  /** Idempotency key: the same key is the same job, so a retried or double request never makes or charges twice. */
  key: string;
  /** The picture comes from an attached image or from an earlier picture (a reference). */
  ref?: { from: "upload" } | { from: "job"; jobId: string };
  /** Regenerate: the picture this one replaces as a new version. */
  regenerateOf?: string;
  jobId?: string;
  url?: string;
  estimateUnits?: number;
  /** Credits actually charged. */
  units?: number;
  error?: string;
  /** Why it could not start: not signed in, plan, not connected, paused, limit. */
  blocked?: { reason: "signin" | "plan" | "config" | "paused" | "limit" | "credits" | "other"; message: string; upgradeTo?: string };
  /** Images left in today's allowance when the cost was shown. */
  left?: number | null;
  /** The person asked for several; chat makes one at a time. */
  asked?: number;
  /** Provider that made it ("Higgsfield" | "OpenAI"), for the caption. */
  note?: string;
};
