"use client";
/** Client-side shapes for the app builder (mirrors lib/app-builder types the API returns). */
export type Palette = { bg: string; surface: string; ink: string; muted: string; accent: string; accent2: string };
export type Design = {
  style: string;
  mode: "light" | "dark";
  palette: Palette | null;
  paletteSource: "style" | "picked" | "description" | "image" | "brand" | "surprise";
  fonts: string;
  density: "airy" | "balanced" | "dense";
  shape: "sharp" | "soft" | "round" | "pill";
  motion: "none" | "subtle" | "expressive";
  notes: string;
  direction?: string;
};
export type StyleOpt = { id: string; name: string; line: string; light: Palette; dark: Palette; fonts: string; shape: Design["shape"]; density: Design["density"]; motion: Design["motion"] };
export type FontOpt = { id: string; name: string; display: string; body: string; google: string | null; displayStack: string; bodyStack: string };
export type Config = {
  plan: string;
  planLabel: string;
  verified: boolean;
  maxProjects: number;
  projects: number;
  model: string;
  estimateUnits: number;
  maxUnits: number;
  limits: { files: number; pages: number; collections: number; backend: boolean; ai: boolean; images: number; fixAttempts: number; visual: boolean };
  styles: StyleOpt[];
  fonts: FontOpt[];
};
/** The app's own look, for its poster in the studio's gallery when there is no screenshot yet. */
export type AppLook = { bg: string; surface: string; ink: string; accent: string; display: string; mode: "light" | "dark" };
export type AppSummary = { id: string; name: string; appName: string; slug: string; kind: string | null; previewUrl: string | null; thumb: string | null; publishedVersion: number | null; headVersion: number; look?: AppLook | null; liveUrl?: string | null; updatedAt?: string };
export type VersionMeta = { n: number; summary: string; prompt: string; kind: string; createdAt: string; model?: string | null; units?: number };
export type PublicSpec = {
  name: string; tagline: string; kind: string; summary: string; scope: string; uses: string[]; notBuilt: string[];
  features: { id: string; title: string; detail: string; must: boolean }[];
  pages: { route: string; title: string; auth?: boolean; admin?: boolean }[];
  collections: { name: string; label: string; fields: string[]; realtime?: boolean }[];
  ai: { name: string; label: string }[];
  auth: boolean; files: string[]; images: string[];
};
export type Check = { id: string; label: string; ok: boolean; detail: string; route?: string };
export type Verdict = { id: string; title: string; status: "built" | "partial" | "missing"; evidence: string };
export type Visual = { score: number; summary: string; issues: string[] };
export type Report = { checks: Check[]; verdicts: Verdict[]; visual: Visual | null; shots: { route: string; viewport: string; url: string }[]; attempts: number; version: number; at: string; model: string | null; usd: number; open?: string[] };
export type AppDetail = {
  id: string; name: string; slug: string; kind: string; spec: PublicSpec | null; design: Design | null; settings: { signups: boolean; ai: boolean; uploads: boolean } | null; admins: string[];
  report: Report | null; previewUrl: string | null; liveUrl: string | null; publishedVersion: number | null; headVersion: number;
};
/** GET /api/apps/:id: the app, its newest unfinished build (null when the newest is done) and its versions, newest first. */
export type AppDetailResponse = { app: AppDetail; build: { id: string; stage: string; error?: string | null; startedAt?: string; updatedAt?: string; spec?: PublicSpec | null; checks?: Check[]; verdicts?: Verdict[]; log?: { at: string; text: string }[] } | null; versions?: VersionMeta[] };
