/**
 * Keplar Apps: the one-prompt app builder. A prompt (plus a design choice) becomes an AppSpec (planner), the spec becomes a
 * multi-file project (generator), the project is verified in a real browser and repaired (verify/fix loop), and the result is a
 * normal site version served by the app runtime (src/lib/app-runtime) with a real backend: data, end-user auth, files, AI.
 */

export const APP_KINDS = ["site", "app", "game", "social", "ai", "dashboard", "marketplace", "saas", "tool", "booking"] as const;
export type AppKind = (typeof APP_KINDS)[number];

export const FIELD_TYPES = ["text", "longtext", "number", "boolean", "date", "datetime", "email", "url", "image", "file", "ref", "select", "tags", "json"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldSpec = {
  name: string;
  type: FieldType;
  required?: boolean;
  /** For "ref": the collection it points at ("users" = the app's end users). */
  ref?: string;
  /** For "select". */
  options?: string[];
  /** Max length (text) or max value (number). */
  max?: number;
  label?: string;
};

/**
 * Who may do something with a collection's records.
 * public = anyone (signed in or not); auth = any signed-in end user; owner = the end user who created the record;
 * admin = end users with the admin role (the app's creator signs in as admin); none = nobody through the API.
 */
export const ACCESS = ["public", "auth", "owner", "admin", "none"] as const;
export type Access = (typeof ACCESS)[number];

export type CollectionSpec = {
  name: string;
  label: string;
  fields: FieldSpec[];
  read: Access;
  create: Access;
  update: Access;
  delete: Access;
  /** Field names that must be unique together per app (e.g. ["post", "_owner"] = one like per user per post). "_owner" is the creator. */
  unique?: string[];
  /** Clients may subscribe to changes (feeds, chat, live boards). */
  realtime?: boolean;
  /** Example records created on first run (draft only), so the preview is not empty. */
  seed?: Record<string, unknown>[];
};

export type PageSpec = {
  /** Hash route, e.g. "/", "/profile/:id", "/admin". */
  route: string;
  title: string;
  purpose: string;
  /** Requires a signed-in end user. */
  auth?: boolean;
  /** Requires the admin role. */
  admin?: boolean;
};

/** A job the published app runs on its own (src/lib/app-runtime/schedules.ts): an AI action with fixed input, once a day or
 *  week, whose text is saved as a new record (e.g. a daily digest, a weekly summary, a "word of the day"). */
export type ScheduleSpec = {
  name: string;
  label: string;
  every: "day" | "week";
  ai: string;
  input: Record<string, string>;
  save: { collection: string; field: string };
};

export type AiActionSpec = {
  /** Called from the app as keplar.ai.run(name, input). */
  name: string;
  label: string;
  purpose: string;
  /** System prompt, written by the planner and fixed at build time (end users only supply the input fields). */
  system: string;
  input: { name: string; max: number }[];
  output: "text" | "json";
  maxTokens: number;
  /** fast = cheap model; smart = the plan's stronger model. */
  tier: "fast" | "smart";
  /** Requires a signed-in end user (recommended: it is metered to the creator). */
  auth: boolean;
};

export type FeatureSpec = { id: string; title: string; detail: string; must: boolean };

export type ImageSlot = { slot: string; prompt: string; aspect: "1:1" | "4:3" | "3:2" | "16:9" | "3:4" | "2:3"; alt: string };

export type FileRole = "html" | "css" | "js" | "json" | "svg";
export type FilePlan = { path: string; role: FileRole; purpose: string; exports?: string[] };

export type AppSpec = {
  name: string;
  tagline: string;
  kind: AppKind;
  summary: string;
  audience: string;
  pages: PageSpec[];
  collections: CollectionSpec[];
  auth: { enabled: boolean; methods: ("password" | "magic")[]; roles: string[]; profileFields: string[] };
  ai: AiActionSpec[];
  /** Jobs the published app runs by itself (absent on apps planned before schedules existed). */
  schedules?: ScheduleSpec[];
  features: FeatureSpec[];
  /** Vendored libraries the app loads: "ui" = Preact + hooks + htm (window.kui), "three" = three.js (window.THREE). */
  uses: ("ui" | "three")[];
  images: ImageSlot[];
  copy: { voice: string; keyMessages: string[] };
  files: FilePlan[];
  /** reduced = Free plan scope (no backend features beyond local state, fewer files). */
  scope: "full" | "reduced";
  /** Things the request asked for that this build will not do, said plainly to the owner. */
  notBuilt: string[];
  /** Key choices and why they fit the owner's goal, with what each trades away (narrated after the build). */
  decisions?: { choice: string; why: string; tradeoff?: string }[];
  /** What the planner assumed where the request was open, so the owner can correct it. */
  assumptions?: string[];
};

/* ── design ── */

export const STYLE_IDS = ["editorial", "brutalist", "playful", "luxury", "minimal", "retro", "glassy", "dimensional", "swiss", "organic", "terminal", "y2k"] as const;
export type StyleId = (typeof STYLE_IDS)[number];
export type Density = "airy" | "balanced" | "dense";
export type Shape = "sharp" | "soft" | "round" | "pill";
export type MotionLevel = "none" | "subtle" | "expressive";

export type Palette = { bg: string; surface: string; ink: string; muted: string; accent: string; accent2: string };

export type DesignChoice = {
  style: StyleId;
  mode: "light" | "dark";
  /** Null = derive from the style. */
  palette: Palette | null;
  paletteSource: "style" | "picked" | "description" | "image" | "brand" | "surprise";
  /** Font pairing id from design/presets.ts. */
  fonts: string;
  density: Density;
  shape: Shape;
  motion: MotionLevel;
  /** The owner's own words about the look. */
  notes: string;
  /** Short art-direction paragraph ("Surprise me" or the owner's notes made concrete). */
  direction?: string;
};

export type DesignTokens = {
  palette: Palette & { line: string; onAccent: string; accentText: string; surface2: string };
  fonts: { display: string; body: string; mono: string; google: string | null; displayName: string; bodyName: string };
  radius: { sm: string; md: string; lg: string; pill: string };
  space: number;
  motion: MotionLevel;
  style: StyleId;
  mode: "light" | "dark";
};

/* ── build state (resumable pipeline) ── */

export type StageId = "plan" | "images" | "generate" | "verify" | "fix" | "visual" | "save" | "done" | "failed";

export type CheckResult = { id: string; label: string; ok: boolean; detail: string; route?: string };

export type FeatureVerdict = { id: string; title: string; status: "built" | "partial" | "missing"; evidence: string };

export type AppBuild = {
  id: string;
  prompt: string;
  design: DesignChoice;
  /** No look was picked (e.g. a build started from the chat): Keplar art-directs one for this idea before planning. */
  designAuto?: boolean;
  stage: StageId;
  spec: AppSpec | null;
  files: Record<string, string>;
  images: Record<string, string>;
  attempts: number;
  checks: CheckResult[];
  verdicts: FeatureVerdict[];
  visual: { score: number; summary: string; issues: string[] } | null;
  shots: { route: string; viewport: string; url: string }[];
  usd: number;
  model: string | null;
  log: { at: string; text: string }[];
  startedAt: string;
  updatedAt: string;
  error: string | null;
  /** Version saved at the end. */
  version: number | null;
  /** Generation wave reached (0-based) and groups finished in it. */
  wave?: number;
  /** Problems found by the last verification, waiting for the fix step. */
  problems?: { file?: string; message: string; source: "static" | "browser" | "rubric" | "review" | "visual"; severity?: "high" | "medium" | "low" }[];
  /** Edit of an existing app: the version it started from and the files the plan said to change. */
  base?: { version: number; changes: { path: string; what: string }[]; written?: string[] } | null;
  /** Fast edit (patch.ts): "try" before the first attempt, "on" when small SEARCH/REPLACE edits applied (light verify, no replan),
   *  "off" when the change needed the full plan -> generate path. */
  quick?: "try" | "on" | "off";
  /** Blocking problems still open when the build saved (carried into the report so the studio can offer to fix them). */
  open?: string[];
  /** USD already charged to the workspace (charged incrementally, so an abandoned build still pays for what it used). */
  charged?: number;
  /** Units charged so far. */
  units?: number;
  /** Invocations used (each is one request of at most ~5 minutes). */
  runs?: number;
};

/** Stored on the site record for app projects. */
export type AppMeta = {
  spec: AppSpec;
  design: DesignChoice;
  /** Draft data has been seeded for this version. */
  seededVersion?: number;
  /** Emails that get the admin role once proven by a magic-link sign-in (the creator's email by default). Password sign-up alone never grants admin. */
  admins: string[];
  /** Runtime switches the owner controls. */
  settings: { signups: boolean; ai: boolean; uploads: boolean };
  /** Generated images by slot (public /i/<id> URLs). */
  images?: Record<string, string>;
  /** What the published version runs with (snapshot taken at publish, so draft edits and theme changes never leak to live). */
  live?: { spec: AppSpec; design: DesignChoice; images?: Record<string, string> } | null;
  /** Latest build report (requested vs built, checks, visual review). */
  report?: { checks: CheckResult[]; verdicts: FeatureVerdict[]; visual: AppBuild["visual"]; shots: AppBuild["shots"]; attempts: number; version: number; at: string; model: string | null; usd: number;
    /** Problems the last build still had when it saved (fix rounds or budget ran out), shown with a "Fix these" action. */
    open?: string[] };
};
