import type { DirectionId } from "./design";
import type { SiteBrief } from "./brief";
import type { SiteFx } from "./fx/types";
import type { AppMeta } from "@/lib/app-builder/types";

export type PageSeo = { title?: string; description?: string };

export type SiteSeo = {
  /** Browser title / social title for the home page and fallback for pages without their own. */
  title: string;
  description: string;
  /** https image URL for link previews. */
  ogImage: string;
  /** Let search engines index the published site. Off by default. */
  indexable: boolean;
  pages: Record<string, PageSeo>;
};

export type ChatMsg = { id: string; role: "user" | "assistant" | "system"; text: string; at: string; version?: number; units?: number };

export type Site = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  template: string | null;
  headVersion: number;
  versionCount: number;
  seo: SiteSeo;
  publishedVersion: number | null;
  publishedAt: string | null;
  /** Publish scan said "review": published, queued for a human look. */
  needsReview: boolean;
  takenDown: boolean;
  leadCount: number;
  messages: ChatMsg[];
  /** Approved brief the site is built from (set by the discovery flow; absent on older sites). */
  brief?: SiteBrief;
  /** Style direction + brand overrides. The design-system CSS is derived from this. */
  design?: SiteDesign;
  /** Effects (three.js scenes, reveals, parallax). Off unless the owner or the brief turns it on. */
  fx?: SiteFx;
  /** Result of the latest browser test run (Screen Library tab). */
  qa?: QaSummary;
  /** Owner choices for site features. Everything that sends email is off until the owner turns it on. */
  featureSettings?: { notifyOwner?: boolean; confirmVisitors?: boolean; /** Count page views (cookie-free). On unless false. */ analytics?: boolean };
  /** Hidden from the main Projects list (not deleted). */
  archived?: boolean;
  /** "app" = built by Keplar Apps (scripts, backend runtime); absent = classic static site. */
  kind?: "site" | "app";
  /** Keplar Apps: spec, design and runtime settings. */
  app?: AppMeta;
  /** Set when the site was copied from another site. */
  duplicatedFrom?: string | null;
  /** Set when the site was remixed from a template in the gallery (slug and title only; nothing about the template's owner). */
  remixedFrom?: { slug: string; title: string; credited: boolean };
  /** Soft delete: set when the owner deletes the site. It is hidden, answers 410 publicly and can be restored until `purgeAfter`. */
  deletedAt?: string | null;
  /** After this moment the site's data is removed for good (see deletion.ts). */
  purgeAfter?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SiteDesign = { direction: DirectionId; accent: string | null; mode: "auto" | "light" | "dark"; /** Per-project font loading (from the structure recipe); absent = swap. */ fontDisplay?: "swap" | "optional" | "fallback" };

export type LintSummary = { errors: number; warnings: number; fixed: string[]; repaired: boolean; remaining: { code: string; message: string; file: string; severity: "error" | "warn" }[]; placeholders: number; /** Security and mobile checklist (src/lib/create/output-checklist.ts). */ checklist?: { passed: number; total: number; failed: { id: string; label: string; detail: string }[] } };

export type VersionKind = "template" | "ai" | "restore" | "edit";

export type SiteVersion = {
  id: string;
  workspaceId: string;
  siteId: string;
  n: number;
  files: Record<string, string>;
  summary: string;
  prompt: string;
  kind: VersionKind;
  model: string | null;
  units: number;
  bytes: number;
  createdAt: string;
  /** Result of the post-generation critique pass (AI builds). */
  lint?: LintSummary;
  /** HTML pages in `files`, stored at save time so listing versions never reads their files (absent on versions saved before). */
  pages?: number;
};

export type Lead = {
  id: string;
  workspaceId: string;
  siteId: string;
  page: string;
  fields: Record<string, string>;
  email: string | null;
  createdAt: string;
};

export type QaSummary = {
  version: number;
  at: string;
  errors: number;
  warnings: number;
  shots: number;
  pages: number;
  score: number | null;
  summary: string | null;
  repaired: boolean;
  issues: { code: string; severity: "error" | "warn"; page: string; viewport: string; message: string }[];
};
