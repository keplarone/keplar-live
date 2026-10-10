/**
 * The Roblox Studio bridge the Keplar desktop app exposes on keplar.one app pages (keplar-desktop: src/preload/preload.ts and
 * src/main/studio/bridge.ts). The desktop app runs Roblox Studio's own MCP server on the person's computer; the page asks it for
 * status, connects, and calls Studio tools through it. In a normal browser there is no bridge, so Studio mode is desktop-only.
 */
export type StudioState = "idle" | "connecting" | "connected" | "missing" | "unsupported" | "error";
export type StudioStatus = { state: StudioState; message?: string; server?: string; tools: string[] };
export type StudioContent = { type: string; text?: string; data?: string; mimeType?: string };
export type StudioCall = { ok: true; result: { content: StudioContent[]; isError?: boolean } } | { ok: false; error: string };

export type StudioBridge = {
  version: number;
  status(): Promise<StudioStatus>;
  connect(): Promise<StudioStatus>;
  disconnect(): Promise<StudioStatus>;
  /** Studio's tool definitions (name, description, input schema), for the planner. Empty when not connected. */
  tools(): Promise<{ name: string; description?: string; inputSchema?: unknown }[]>;
  call(name: string, args?: Record<string, unknown>): Promise<StudioCall>;
  onStatus(listener: (status: StudioStatus) => void): () => void;
};

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
