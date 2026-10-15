// Synced from keplarone/space-studio src/core — edit there, then copy.
/**
 * A failure the UI can show as a troubleshooting card: what went wrong (the real error, never a fake success), and concrete steps.
 * Produced by the desktop layer's safety gates (src/main/safe.ts) and the Local engine bridge; rendered by chat/TroubleshootCard.
 */
export type Troubleshoot = {
  kind: "troubleshoot";
  /** Stable code for the UI to branch on, e.g. "local_unreachable", "timeout". */
  code: string;
  title: string;
  /** The real error text, trimmed. */
  error: string;
  steps: string[];
  /** Optional actions the card offers. */
  actions?: ("retry" | "open_settings" | "use_cloud" | "copy_error")[];
  /** A link the card may offer (https only, allow-listed by the main process when opened). */
  helpUrl?: string;
};

export type Gated<T> = { ok: true; value: T } | { ok: false; troubleshoot: Troubleshoot };

export const isTroubleshoot = (v: unknown): v is Troubleshoot =>
  !!v && typeof v === "object" && (v as { kind?: unknown }).kind === "troubleshoot" && typeof (v as { title?: unknown }).title === "string";
