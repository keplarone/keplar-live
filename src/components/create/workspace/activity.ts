/** The activity log: every entry is something the build or the test run actually reported. Nothing is scripted. */
export type Entry = {
  id: string;
  kind: "user" | "status" | "file" | "check" | "issue" | "critique" | "repair" | "done" | "error" | "note" | "shot";
  text: string;
  detail?: string;
  tone?: "ok" | "warn" | "bad";
  at: number;
  /** For "shot": id of the screenshot in the Screen Library. */
  shot?: string;
};

let n = 0;
export const entry = (kind: Entry["kind"], text: string, extra: Partial<Entry> = {}): Entry => ({ id: `e${Date.now().toString(36)}${n++}`, kind, text, at: Date.now(), ...extra });

/** Read an NDJSON response and hand each parsed event to `on`. */
export async function readNdjson(res: Response, on: (ev: Record<string, unknown>) => void): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        on(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* a partial or malformed line is skipped */
      }
    }
  }
}

export type Phase = "idle" | "writing" | "checking" | "saving" | "testing" | "repairing";

/** Progress 0..1 from real counters only. `expectedChars` is a rough size for the site (about 9k characters per page). */
export function progressOf(p: { phase: Phase; chars: number; files: number; pages: number; testSteps: number }): number {
  const pages = Math.max(1, p.pages);
  if (p.phase === "idle") return 0;
  const gen = Math.max(Math.min(0.9, p.chars / (9000 * pages)), Math.min(0.9, p.files / pages)) * 0.7;
  if (p.phase === "writing") return Math.max(0.02, gen);
  if (p.phase === "checking") return 0.78;
  if (p.phase === "saving") return 0.88;
  return 0.9 + Math.min(0.09, (p.testSteps / 16) * 0.09);
}

export const phaseLabel = (p: Phase): string =>
  p === "writing" ? "Building preview" : p === "checking" ? "Compiling app" : p === "saving" ? "Compiling app" : p === "testing" ? "Testing in a browser" : p === "repairing" ? "Fixing what the test found" : "";
