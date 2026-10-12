/**
 * The Roblox Studio bridge the Keplar desktop app exposes on keplar.one app pages (keplar-desktop: src/preload/preload.ts and
 * src/main/studio/bridge.ts). The desktop app runs Roblox Studio's own MCP server on the person's computer; the page asks it for
 * status, connects, and calls Studio tools through it. In a normal browser there is no bridge, so Studio mode is desktop-only.
 */
export type StudioState = "idle" | "connecting" | "connected" | "missing" | "unsupported" | "error";
export type StudioStatus = { state: StudioState; message?: string; server?: string; tools: string[] };
export type StudioContent = { type: string; text?: string; data?: string; mimeType?: string };
export type StudioCall = { ok: true; result: { content: StudioContent[]; isError?: boolean } } | { ok: false; error: string };

export type OverlayState = { open: boolean; collapsed: boolean; seeThrough: boolean };

/** The always-on-top Studio overlay window (desktop app 0.1.7+, bridge version 2). */
export type StudioOverlayApi = {
  state(): Promise<OverlayState>;
  open(): Promise<OverlayState>;
  close(): Promise<OverlayState>;
  collapse(on: boolean): Promise<OverlayState>;
  seeThrough(on: boolean): Promise<OverlayState>;
  onState(listener: (state: OverlayState) => void): () => void;
};

export type StudioBridge = {
  version: number;
  status(): Promise<StudioStatus>;
  connect(): Promise<StudioStatus>;
  disconnect(): Promise<StudioStatus>;
  /** Studio's tool definitions (name, description, input schema), for the planner. Empty when not connected. */
  tools(): Promise<{ name: string; description?: string; inputSchema?: unknown }[]>;
  call(name: string, args?: Record<string, unknown>): Promise<StudioCall>;
  onStatus(listener: (status: StudioStatus) => void): () => void;
  /** Present on desktop builds that can float Keplar over Studio. */
  overlay?: StudioOverlayApi;
  /** Blender, through the Keplar add-on (desktop app with bridge version 3+). */
  blender?: BlenderBridge;
};

/** Blender bridge (keplar-desktop: src/main/blender): the same shape as Studio's, plus setup, which installs the add-on. */
export type BlenderState = "idle" | "connecting" | "connected" | "missing" | "error";
export type BlenderStatus = { state: BlenderState; message?: string; blender?: string; file?: string; tools: string[] };
export type BlenderBridge = {
  status(): Promise<BlenderStatus>;
  connect(): Promise<BlenderStatus>;
  setup(): Promise<{ ok: boolean; message: string }>;
  disconnect(): Promise<BlenderStatus>;
  tools(): Promise<{ name: string; description?: string; inputSchema?: unknown }[]>;
  call(name: string, args?: Record<string, unknown>): Promise<StudioCall>;
  onStatus(listener: (status: BlenderStatus) => void): () => void;
  /** Blender Cloud transfers (desktop app 0.1.10+, bridge version 4; keplar-desktop src/main/blender/cloud.ts). */
  cloud?: BlenderCloudApi;
};

type Result<T> = { ok: true; result: T } | { ok: false; error: string };
export type CloudProgress = { kind: "upload" | "download"; done: number; total: number; file?: string };
export type CloudPack = { packId: string; bytes: number; sha256: string; report: Record<string, unknown> };
export type BlenderCloudApi = {
  /** A packed, compressed copy of the open scene (textures inside) on this computer, and what the add-on found in it. */
  pack(): Promise<Result<CloudPack>>;
  /** Sends a packed scene to the job's render machine (resumes if interrupted). */
  upload(packId: string, url: string, token: string): Promise<Result<{ ok: true }>>;
  /** Downloads the renders to ~/Documents/Keplar renders/<label>. */
  download(url: string, token: string, label: string): Promise<Result<{ folder: string; files: number; bytes: number }>>;
  open(folder: string): Promise<Result<{ ok: true }>>;
  cancel(): Promise<{ ok: true }>;
  onProgress(listener: (p: CloudProgress) => void): () => void;
};

/** Blender Cloud transfers in the desktop app (0.1.10+), else null. */
export function blenderCloud(): BlenderCloudApi | null {
  const c = blenderBridge()?.cloud;
  return c && typeof c.pack === "function" && typeof c.upload === "function" ? c : null;
}

/** The Blender bridge inside the Keplar desktop app (0.1.8+), else null. */
export function blenderBridge(): BlenderBridge | null {
  const b = studioBridge()?.blender;
  return b && typeof b.connect === "function" && typeof b.setup === "function" ? b : null;
}

/** The bridge when running inside the Keplar desktop app on a keplar.one app page, else null. */
export function studioBridge(): StudioBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { keplarStudio?: StudioBridge }).keplarStudio;
  return b && typeof b.connect === "function" ? b : null;
}

/** Plans that include Roblox Studio mode (every paid plan; Free does not). */
export const STUDIO_PLANS = new Set(["lite", "plus", "pro", "business"]);

/** The text of a tool result, joined. Studio's tools answer with text blocks (often JSON). */
export function resultText(call: StudioCall): string {
  if (!call.ok) return "";
  return call.result.content.filter((c) => c.type === "text" && c.text).map((c) => c.text).join("\n");
}
