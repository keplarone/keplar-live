export type ProjectKind = "site" | "app";

export type SiteSpec = {
  name: string;
  tagline: string;
  kind: "landing" | "shop" | "portfolio" | "app-todo" | "app-calculator";
  theme: "light" | "dark";
  accent: string;
  sections: ("hero" | "features" | "products" | "pricing" | "gallery" | "contact" | "faq")[];
  features: { title: string; text: string }[];
  products: { id: string; name: string; price: number; currency: string; description: string }[];
  headline?: string;
};

export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; at: string; units?: number };

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  kind: ProjectKind;
  spec: SiteSpec | null;
  /** Latest draft version number (files in blob drafts/<id>/v<n>/). */
  draftVersion: number;
  files: string[];
  messages: ChatMessage[];
  liveDeployId: string | null;
  publishedAt: string | null;
  /** Safety state */
  scan: { verdict: "pass" | "review" | "block"; findings: string[]; at: string } | null;
  takenDown: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Deploy = {
  id: string;
  workspaceId: string;
  projectId: string;
  version: number;
  url: string;
  provider: "local" | "vercel";
  status: "ready" | "error";
  createdAt: string;
};

export type DomainStatus = "pending" | "verifying" | "active" | "error";

export type DnsRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string; purpose: string };

export type Domain = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  apex: boolean;
  status: DomainStatus;
  records: DnsRecord[];
  ssl: "pending" | "issued";
  error?: string;
  provider: "local" | "vercel";
  createdAt: string;
  lastCheckedAt: string | null;
};

export type MediaKind = "image" | "video";
export type MediaJob = {
  id: string;
  workspaceId: string;
  kind: MediaKind;
  prompt: string;
  model: string;
  params: { aspectRatio: string; durationSec?: number; audio?: boolean; quality?: string; negativePrompt?: string };
  status: "queued" | "running" | "completed" | "failed" | "blocked";
  estimatedUnits: number;
  units: number | null;
  outputKey: string | null;
  contentType: string | null;
  error?: string;
  createdAt: string;
  completedAt: string | null;
  /** Higgsfield jobs only (src/lib/higgsfield). Absent on legacy OpenRouter jobs. */
  hf?: HiggsfieldJobMeta;
  /** OpenRouter video: the provider's polling URL once submitted (internal; a resumed job polls it instead of submitting again). */
  pollUrl?: string;
  submittedAt?: string;
};

export type HiggsfieldJobMeta = {
  endpoint: string;
  mode: string;
  /** Higgsfield request_id (also the webhook de-duplication key). */
  requestId: string | null;
  plan: string;
  /** USD quoted at approval time and where it came from; the user is charged this (with the usage margin) on success only. */
  quoteUsd: number;
  quoteSource: "estimate" | "list";
  outputUrl: string | null;
  /** True when a copy sits in Keplar storage; false means playback uses Higgsfield's output URL (kept at least 7 days). */
  storedCopy: boolean;
  errorCode: string | null;
  submittedAt: string | null;
  lastPolledAt: string | null;
  /** How many references were attached, and whether this model ignored them. */
  refs: { images: number; video: boolean; ignored: boolean };
  rightsConfirmedAt: string | null;
  /** Jobs started together from Compare share this id. */
  compareId: string | null;
  /** True for jobs of a Compare run (own daily cap; submitted through a small window so Higgsfield's concurrency is never exceeded). */
  compare?: boolean;
  /** Compare clips waiting for a free slot: not yet sent to Higgsfield. Holds what the submission needs. */
  pending?: { imageUrls: string[]; videoUrls: string[] } | null;
};

export type AbuseReport = {
  id: string;
  workspaceId: string;
  target: string;
  reason: string;
  details: string;
  reporterEmail?: string;
  /** `u:<account id>` or `ip:<keyed hash>`: counts distinct reporters (see src/lib/create/abuse-policy.ts). Never the raw IP. */
  reporterKey?: string;
  /** The reporter was signed in with a verified email. */
  verifiedReporter?: boolean;
  /** CSAM/NCII: shown first in the admin inbox. */
  urgent?: boolean;
  /** This report took the target down automatically (verified reporter or enough distinct reporters). */
  autoTakedown?: boolean;
  status: "open" | "actioned" | "dismissed";
  reviewedBy?: string;
  reviewedAt?: string;
  lastAction?: "takedown" | "restore" | "dismiss" | "reopen";
  createdAt: string;
};
