/**
 * Side drafts: an editable document or code file beside the chat. Pure helpers (versions, the revise request, apply-back marker)
 * so the UI stays thin and the rules are tested. Drafts live in this browser (localStorage, per account scope); they are never sent
 * anywhere until the person presses "Revise with Keplar", and then only as the text of that one message.
 */
export type DraftVersion = { at: number; text: string; label: string };
export type Draft = { id: string; title: string; text: string; kind: "doc" | "code"; lang?: string; versions: DraftVersion[]; createdAt: number; updatedAt: number };

export const DRAFT_LIMITS = { versions: 30, drafts: 50, title: 120, text: 60_000 } as const;
const PLAN_PROMPT: Record<string, number> = { free: 6_000, lite: 10_000, plus: 12_000, pro: 16_000, business: 16_000 };

export const newDraftId = () => `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A fenced code answer becomes a code draft; anything else a document draft. */
export function draftFromAnswer(markdown: string, title: string, at = Date.now()): Draft {
  const fence = /^```([\w+#.-]*)\n([\s\S]*?)\n```\s*$/.exec(markdown.trim());
  const text = (fence ? fence[2] : markdown).slice(0, DRAFT_LIMITS.text);
  return { id: newDraftId(), title: title.slice(0, DRAFT_LIMITS.title) || "Untitled draft", text, kind: fence ? "code" : "doc", ...(fence?.[1] ? { lang: fence[1] } : {}), versions: [{ at, text, label: "From the answer" }], createdAt: at, updatedAt: at };
}

/** Records a version (skips one identical to the latest) and keeps the newest DRAFT_LIMITS.versions. */
export function addVersion(d: Draft, text: string, label: string, at = Date.now()): Draft {
  const t = text.slice(0, DRAFT_LIMITS.text);
  const last = d.versions[d.versions.length - 1];
  const versions = last && last.text === t ? d.versions : [...d.versions, { at, text: t, label: label.slice(0, 60) }].slice(-DRAFT_LIMITS.versions);
  return { ...d, text: t, versions, updatedAt: at };
}

/** The marker a revise request carries, so the answer can be applied back to the same draft. */
export const reviseMarker = (id: string) => `(draft ${id})`;
export function draftIdIn(text: string): string | null {
  const m = /\(draft (d_[a-z0-9]{6,20})\)/.exec(text);
  return m ? m[1] : null;
}

/**
 * The chat message for "Revise with Keplar". With a selection, only that part is to change and the rest is context.
 * Returns an error sentence when it would exceed the plan's message size.
 */
export function revisePrompt(d: Draft, instruction: string, opts: { plan: string; selection?: { start: number; end: number } }): string | { error: string } {
  const ask = instruction.trim() || "Improve it: clearer, tighter, correct.";
  const sel = opts.selection && opts.selection.end > opts.selection.start ? d.text.slice(opts.selection.start, opts.selection.end) : "";
  const kind = d.kind === "code" ? `code${d.lang ? ` (${d.lang})` : ""}` : "document";
  const body = sel
    ? `Change only this part of my ${kind} and reply with the full revised ${kind}:\n<<<PART\n${sel}\nPART>>>\n\nThe whole ${kind} for context:\n<<<DRAFT\n${d.text}\nDRAFT>>>`
    : `Reply with the full revised ${kind}${d.kind === "code" ? " in one fenced code block" : ""}, nothing else.\n<<<DRAFT\n${d.text}\nDRAFT>>>`;
  const msg = `Revise my draft "${d.title}" ${reviseMarker(d.id)}: ${ask}\n\n${body}`;
  const cap = PLAN_PROMPT[opts.plan] ?? PLAN_PROMPT.free;
  if (msg.length > cap) return { error: `This draft is too long to revise in one message on your plan (${cap.toLocaleString("en-US")} characters). Select the part to change and try again.` };
  return msg;
}

/** The text to put back into a draft from an answer: the code inside a single fenced block, else the whole answer. */
export function applyText(markdown: string, kind: Draft["kind"]): string {
  if (kind === "code") {
    const blocks = [...markdown.matchAll(/```[\w+#.-]*\n([\s\S]*?)\n```/g)];
    if (blocks.length) return blocks.sort((a, b) => b[1].length - a[1].length)[0][1];
  }
  return markdown.trim();
}

/* storage (browser only) */
const key = (scope: string) => `keplar:drafts:v1:${scope}`;
export function loadDrafts(scope: string): Draft[] {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(key(scope));
    const v = raw ? (JSON.parse(raw) as Draft[]) : [];
    return Array.isArray(v) ? v.filter((d) => d && typeof d.id === "string" && typeof d.text === "string") : [];
  } catch {
    return [];
  }
}
export function saveDrafts(scope: string, drafts: Draft[]) {
  try { localStorage.setItem(key(scope), JSON.stringify(drafts.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, DRAFT_LIMITS.drafts))); } catch { /* storage full or blocked */ }
}
