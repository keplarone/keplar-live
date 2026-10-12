/**
 * Code documents: per-file views of the real code a run reads, proposes and changes, derived only from the event log (events.ts).
 *
 * - script_read results (the model's own reads, and the page's reads around an edit) give a script's real source.
 * - multi_edit args give proposed edits. Shape (as the page already relies on it: describeAction uses `file_path`, the server's
 *   riskOf checks `edits[].new_string`, matching Roblox Studio MCP's multi_edit): { file_path, edits: [{ old_string, new_string,
 *   replace_all? }] }, plus studio_id. Anything else is shown as the raw arguments, never guessed into a diff.
 * - The page reads the script right before an approved edit runs (true before-content), computes the proposed after-content by
 *   applying the edits, and reads it again after it ran to confirm (applied / differs / unconfirmed).
 * - execute_luau (Luau) and Blender's python (Python) become numbered command documents ("Command 3 · execute_luau").
 *
 * Pure and client-safe: no React, no DOM, no CodeMirror. Unit-tested in tests/studio-code-documents.test.ts.
 */
import type { Risk } from "../useStudioAgent";
import { actionPhases, MAX_SOURCE_CHARS, type ActionOrigin, type ActionPhase, type EditOutcome, type ReadFormat, type StudioEvent } from "./events";
import { diffLines, type LineRange } from "./line-diff";

export type EditSpec = { old_string: string; new_string: string; replace_all?: boolean };
export type ParsedEdit = { path: string; edits: EditSpec[]; studioId: string | null };

/** The multi_edit arguments in the known shape, or null (then the UI shows the raw arguments). */
export function parseMultiEdit(args: Record<string, unknown>): ParsedEdit | null {
  const path = args.file_path;
  const edits = args.edits;
  if (typeof path !== "string" || !path.trim() || !Array.isArray(edits) || edits.length === 0) return null;
  const out: EditSpec[] = [];
  for (const e of edits) {
    if (!e || typeof e !== "object") return null;
    const o = e as Record<string, unknown>;
    if (typeof o.old_string !== "string" || typeof o.new_string !== "string") return null;
    if (o.replace_all !== undefined && typeof o.replace_all !== "boolean") return null;
    out.push({ old_string: o.old_string, new_string: o.new_string, ...(o.replace_all === true ? { replace_all: true } : {}) });
  }
  return { path, edits: out, studioId: typeof args.studio_id === "string" ? args.studio_id : null };
}

/**
 * Whether Studio's multi_edit tool definition (from bridge.tools()) has the shape parseMultiEdit understands. "absent" when the
 * definition (or its schema) was not available; the args are then still checked one by one by parseMultiEdit.
 */
export function multiEditSchema(defs: readonly { name: string; inputSchema?: unknown }[]): "matches" | "differs" | "absent" {
  const d = defs.find((x) => x.name === "multi_edit");
  const props = (d?.inputSchema as { properties?: Record<string, unknown> } | undefined)?.properties;
  if (!props) return "absent";
  const items = (props.edits as { items?: { properties?: Record<string, unknown> } } | undefined)?.items?.properties;
  return "file_path" in props && items && "old_string" in items && "new_string" in items ? "matches" : "differs";
}

export type ApplyResult = { ok: true; content: string } | { ok: false; error: string; edit: number };

/** Applies edits in order, the way an exact-match editor does: each old_string must match once unless replace_all. */
export function applyEdits(source: string, edits: readonly EditSpec[]): ApplyResult {
  let s = source;
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i]!;
    if (e.old_string === "") {
      if (s === "") { s = e.new_string; continue; }
      return { ok: false, error: `Edit ${i + 1}: old_string is empty but the script is not.`, edit: i };
    }
    if (e.old_string === e.new_string) return { ok: false, error: `Edit ${i + 1}: old_string and new_string are the same.`, edit: i };
    const count = s.split(e.old_string).length - 1;
    if (count === 0) return { ok: false, error: `Edit ${i + 1}: old_string was not found in the script as read.`, edit: i };
    if (count > 1 && !e.replace_all) return { ok: false, error: `Edit ${i + 1}: old_string matches ${count} times (replace_all is not set).`, edit: i };
    s = e.replace_all ? s.split(e.old_string).join(e.new_string) : s.replace(e.old_string, () => e.new_string);
  }
  return { ok: true, content: s };
}

export type ScriptSource = { source: string; complete: boolean; format: ReadFormat };

const NUMBERED = /^\s*(\d+)(?:\t|→|\s?\|\s?|:\s?)(.*)$/;
const TRUNCATED = /^\s*(?:\.\.\.|…)?\s*[([]?\s*(?:truncated|output truncated|\d+ more lines?|showing (?:first|lines))/i;

/**
 * Turns a script_read result into source text. Handles plain source, line-numbered output ("  12\tcode", "12→code", "12: code",
 * all lines numbered consecutively) and JSON with a source/content field. `complete` is false when the read was a part of the
 * script (numbering not starting at 1, a truncation marker, a JSON `truncated` flag, or over MAX_SOURCE_CHARS); such a read is
 * shown but never used for revert.
 */
export function parseScriptRead(text: string): ScriptSource {
  const t = text.trim();
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const src = ["source", "Source", "content", "code"].map((k) => j[k]).find((v): v is string => typeof v === "string");
      if (src !== undefined) return cap({ source: src, complete: j.truncated !== true && j.partial !== true, format: "json" });
    } catch { /* not JSON: plain text */ }
  }
  let lines = text.replace(/\r\n?/g, "\n").split("\n");
  let complete = true;
  while (lines.length && lines[lines.length - 1] === "") lines = lines.slice(0, -1);
  if (lines.length && TRUNCATED.test(lines[lines.length - 1]!)) { lines = lines.slice(0, -1); complete = false; }
  const m = lines.map((l) => NUMBERED.exec(l));
  if (lines.length > 0 && m.every(Boolean)) {
    const nums = m.map((x) => Number(x![1]));
    const sequential = nums.every((v, i) => i === 0 || v === nums[i - 1]! + 1);
    // One numbered line is only trusted with an unambiguous separator (a tab or an arrow).
    const single = lines.length === 1 && !/^\s*\d+(\t|→)/.test(lines[0]!);
    if (sequential && !single) return cap({ source: m.map((x) => x![2]!).join("\n"), complete: complete && nums[0] === 1, format: "numbered" });
  }
  return cap({ source: complete ? text.replace(/\r\n?/g, "\n") : lines.join("\n"), complete, format: "plain" });
}

function cap(s: ScriptSource): ScriptSource {
  return s.source.length > MAX_SOURCE_CHARS ? { ...s, source: s.source.slice(0, MAX_SOURCE_CHARS), complete: false } : s;
}

/** Compares a re-read script with the proposed content (line endings and a final newline do not count as a difference). */
export function editOutcome(proposed: string | null, reread: ScriptSource | null): EditOutcome {
  if (!reread || proposed == null) return "unconfirmed";
  const norm = (s: string) => s.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  return norm(proposed) === norm(reread.source) ? "applied" : "differs";
}

export type DocStatus = "read" | "proposed" | "applying" | "applied" | "differs" | "unconfirmed" | "failed" | "declined";
export type DocLanguage = "luau" | "python" | "json" | "text";
export type Diagnostic = { severity: "error" | "warning" | "info"; message: string; action: string | null; source: "tool" | "preview" | "read" };

/** One recorded content of a document, and which event/action produced it. */
export type DocVersion = {
  id: string;
  label: "read" | "before" | "proposed" | "applied" | "command" | "raw";
  content: string;
  at: number;
  eventId: number;
  turn: number;
  action: string | null;
  actionName: string | null;
};

export type Availability = { ok: boolean; reason: string };

/** One script edit (a multi_edit action, including a revert) and everything known about it. */
export type ScriptChange = {
  id: string;
  action: string;
  name: string;
  path: string;
  origin: ActionOrigin;
  /** For a revert: the change it reverts. */
  of: string | null;
  risk: Risk;
  turn: number;
  at: number;
  studioId: string | null;
  edits: EditSpec[];
  /** True before-content: the read right before it ran ("before"), else the read when it was proposed ("preview"). */
  before: string | null;
  beforeFrom: "before" | "preview" | null;
  beforeComplete: boolean;
  /** The proposed after-content (edits applied to `before`). */
  after: string | null;
  previewError: string | null;
  /** The script as re-read after it ran. */
  applied: string | null;
  appliedComplete: boolean;
  status: DocStatus;
  awaitingApproval: boolean;
  error: string | null;
  result: string | null;
  added: number;
  removed: number;
  changedLines: LineRange[];
  revert: Availability;
  retry: Availability;
};

export type CodeDocument = {
  id: string;
  kind: "script" | "command" | "raw";
  /** Script path ("ServerScriptService.Spawn"), or the command's name ("Command 3 · execute_luau"). */
  path: string;
  /** Short tab label. */
  title: string;
  crumbs: string[];
  language: DocLanguage;
  /** What the editor shows now: the confirmed content, else the proposal, else the latest read. */
  content: string;
  status: DocStatus;
  /** The action that produced the current status is waiting for the person's Approve (`action` is its key). */
  awaitingApproval: boolean;
  versions: DocVersion[];
  changes: ScriptChange[];
  diagnostics: Diagnostic[];
  /** Lines (1-based) actively changing: the proposal's changed lines, or the whole command while it runs. */
  activeLines: LineRange[];
  /** The action that last touched it. */
  action: string | null;
  updatedAt: number;
  /** A short note when the document is not what it would normally be (raw arguments, partial read). */
  note: string | null;
};

/** One row of the changes list: every action that changed something (scripts, commands, objects). */
export type ChangeEntry = {
  id: string;
  kind: "script" | "command" | "object";
  name: string;
  title: string;
  target: string;
  docId: string | null;
  risk: Risk;
  origin: ActionOrigin;
  status: DocStatus;
  added: number;
  removed: number;
  turn: number;
  at: number;
  revert: Availability;
  retry: Availability;
};

export type DeriveOptions = { surface?: "studio" | "blender"; /** A run is in progress: page actions (revert, retry) wait for it. */ busy?: boolean };
export type CodeModel = { documents: CodeDocument[]; changes: ChangeEntry[]; activeId: string | null };

const CODE_TOOLS: Record<string, DocLanguage> = { execute_luau: "luau", python: "python" };

export function scriptDocId(path: string): string { return `script:${path}`; }

function crumbsOf(path: string): string[] {
  return path.split(/[./\\]/).filter(Boolean);
}

const NO = (reason: string): Availability => ({ ok: false, reason });
const YES: Availability = { ok: true, reason: "" };

/** Builds the documents, the change list and the active document from the event log. */
export function deriveDocuments(events: readonly StudioEvent[], opts: DeriveOptions = {}): CodeModel {
  const docs = new Map<string, CodeDocument>();
  const changes = new Map<string, ScriptChange>();
  const entries = new Map<string, ChangeEntry>();
  const docOfAction = new Map<string, string>();
  const proposals = new Map<string, Extract<StudioEvent, { kind: "action.proposed" }>>();
  const order: string[] = [];
  let commands = 0;

  const touch = (d: CodeDocument, e: StudioEvent) => { d.updatedAt = e.at; if (!order.includes(d.id)) order.push(d.id); };
  const scriptDoc = (path: string): CodeDocument => {
    const id = scriptDocId(path);
    let d = docs.get(id);
    if (!d) {
      const crumbs = crumbsOf(path);
      d = { id, kind: "script", path, title: crumbs[crumbs.length - 1] ?? path, crumbs, language: opts.surface === "blender" ? "python" : "luau", content: "", status: "read", awaitingApproval: false, versions: [], changes: [], diagnostics: [], activeLines: [], action: null, updatedAt: 0, note: null };
      docs.set(id, d);
    }
    return d;
  };
  const version = (d: CodeDocument, e: StudioEvent, label: DocVersion["label"], content: string, action: string | null) => {
    const p = action ? proposals.get(action) : undefined;
    d.versions.push({ id: `${d.id}#${d.versions.length + 1}`, label, content, at: e.at, eventId: e.id, turn: e.turn, action, actionName: p?.name ?? null });
  };
  const recompute = (c: ScriptChange) => {
    if (c.before == null) { c.after = null; c.previewError = null; return; }
    const r = applyEdits(c.before, c.edits);
    c.after = r.ok ? r.content : null;
    c.previewError = r.ok ? null : r.error;
    const target = c.applied ?? c.after;
    if (target != null) {
      const s = diffLines(c.before, target);
      c.added = s.added; c.removed = s.removed; c.changedLines = s.changed.length ? s.changed : s.deletedAt.map((l) => ({ from: l, to: l }));
    }
  };

  for (const e of events) {
    switch (e.kind) {
      case "action.proposed": {
        proposals.set(e.action, e);
        const lang = CODE_TOOLS[e.name];
        if (e.name === "multi_edit") {
          const p = parseMultiEdit(e.args);
          if (p) {
            const d = scriptDoc(p.path);
            const c: ScriptChange = { id: e.action, action: e.action, name: e.name, path: p.path, origin: e.origin, of: e.of, risk: e.risk, turn: e.turn, at: e.at, studioId: p.studioId, edits: p.edits, before: null, beforeFrom: null, beforeComplete: false, after: null, previewError: null, applied: null, appliedComplete: false, status: "proposed", awaitingApproval: false, error: null, result: null, added: 0, removed: 0, changedLines: [], revert: NO(""), retry: NO("") };
            changes.set(e.action, c);
            d.changes.push(c);
            d.status = "proposed";
            d.action = e.action;
            docOfAction.set(e.action, d.id);
            touch(d, e);
          } else {
            const id = `raw:${e.action}`;
            const d: CodeDocument = { id, kind: "raw", path: `${e.title} · multi_edit`, title: "multi_edit", crumbs: [e.title], language: "json", content: JSON.stringify(e.args, null, 2), status: "proposed", awaitingApproval: false, versions: [], changes: [], diagnostics: [], activeLines: [], action: e.action, updatedAt: e.at, note: "These edit arguments are not in the shape Keplar can preview (file_path and edits with old_string/new_string), so they are shown exactly as sent." };
            version(d, e, "raw", d.content, e.action);
            docs.set(id, d); docOfAction.set(e.action, id); touch(d, e);
          }
        } else if (lang) {
          const code = typeof e.args.code === "string" ? e.args.code : null;
          const n = ++commands;
          const id = `cmd:${e.action}`;
          const label = `Command ${n} · ${e.name}${e.origin === "retry" ? " (retry)" : ""}`;
          const d: CodeDocument = { id, kind: code == null ? "raw" : "command", path: label, title: `Command ${n}`, crumbs: [opts.surface === "blender" ? "Blender" : "Studio", label], language: code == null ? "json" : lang, content: code ?? JSON.stringify(e.args, null, 2), status: "proposed", awaitingApproval: false, versions: [], changes: [], diagnostics: [], activeLines: [], action: e.action, updatedAt: e.at, note: code == null ? "No code string in the arguments; shown exactly as sent." : null };
          version(d, e, code == null ? "raw" : "command", d.content, e.action);
          docs.set(id, d); docOfAction.set(e.action, id); touch(d, e);
        }
        if (e.risk !== "read") {
          const docId = docOfAction.get(e.action) ?? null;
          const ch = changes.get(e.action);
          entries.set(e.action, { id: e.action, kind: ch ? "script" : lang ? "command" : "object", name: e.name, title: e.title, target: ch ? ch.path : docId ? (docs.get(docId)?.path ?? e.title) : e.title, docId, risk: e.risk, origin: e.origin, status: "proposed", added: 0, removed: 0, turn: e.turn, at: e.at, revert: NO(""), retry: NO("") });
        }
        break;
      }
      case "approval.requested": {
        const c = changes.get(e.action);
        if (c) c.awaitingApproval = true;
        const d = docs.get(docOfAction.get(e.action) ?? "");
        if (d && d.kind !== "script") d.awaitingApproval = true;
        break;
      }
      case "approval.granted": case "approval.declined": {
        const c = changes.get(e.action);
        if (c) c.awaitingApproval = false;
        const d = docs.get(docOfAction.get(e.action) ?? "");
        if (d && d.kind !== "script") d.awaitingApproval = false;
        if (e.kind === "approval.declined") setStatus(e.action, "declined", e);
        break;
      }
      case "action.running": setStatus(e.action, "applying", e); break;
      case "action.done": {
        const c = changes.get(e.action);
        if (c) { c.result = e.result || null; } // stays "applying" until the confirming read (edit.applied)
        else setStatus(e.action, "applied", e);
        const d = docOfAction.get(e.action);
        if (d && e.result) docs.get(d)!.diagnostics.push({ severity: "info", message: e.result, action: e.action, source: "tool" });
        break;
      }
      case "action.failed": {
        setStatus(e.action, "failed", e);
        const c = changes.get(e.action);
        if (c) c.error = e.error;
        const d = docOfAction.get(e.action);
        if (d) docs.get(d)!.diagnostics.push({ severity: "error", message: e.error, action: e.action, source: "tool" });
        break;
      }
      case "edit.applied": setStatus(e.action, e.outcome, e); break;
      case "script.read": {
        const d = scriptDoc(e.path);
        const c = e.action ? changes.get(e.action) : undefined;
        if (!e.ok) {
          d.diagnostics.push({ severity: "warning", message: `Could not read ${e.path}${e.purpose === "model" ? "" : ` (${e.purpose} the edit)`}: ${e.error}`, action: e.action, source: "read" });
          touch(d, e);
          break;
        }
        if (!e.complete) d.diagnostics.push({ severity: "warning", message: `Only part of ${e.path} was returned by the read; it is shown, but not used to revert.`, action: e.action, source: "read" });
        if (c && (e.purpose === "preview" || e.purpose === "before")) {
          if (e.purpose === "before" || c.beforeFrom !== "before") { c.before = e.source; c.beforeFrom = e.purpose; c.beforeComplete = e.complete; }
          recompute(c);
          version(d, e, "before", e.source, e.action);
          if (c.after != null) version(d, e, "proposed", c.after, e.action);
          if (c.previewError) d.diagnostics.push({ severity: "warning", message: `Preview: ${c.previewError}`, action: e.action, source: "preview" });
        } else if (c && e.purpose === "after") {
          c.applied = e.source; c.appliedComplete = e.complete;
          recompute(c);
          version(d, e, "applied", e.source, e.action);
        } else {
          version(d, e, "read", e.source, e.action);
        }
        touch(d, e);
        break;
      }
      default: break;
    }
  }

  function setStatus(action: string, s: DocStatus, e: StudioEvent) {
    const c = changes.get(action);
    if (c) c.status = s;
    const docId = docOfAction.get(action);
    if (docId) { const d = docs.get(docId)!; touch(d, e); }
    const en = entries.get(action);
    if (en) en.status = s;
  }

  const phases = actionPhases(events);
  // Final per-document view: content, status, active lines.
  for (const d of docs.values()) {
    if (d.kind === "script") {
      const last = d.changes[d.changes.length - 1];
      const lastRead = [...d.versions].reverse().find((v) => v.label === "read" || v.label === "applied" || v.label === "before");
      if (last) {
        const live = last.status === "proposed" || last.status === "applying";
        d.status = last.status;
        d.action = last.action;
        d.awaitingApproval = last.awaitingApproval;
        // While it is proposed or running: the proposal. Afterwards: the newest real read (the confirming read, or a later one).
        d.content = live ? (last.after ?? last.before ?? lastRead?.content ?? "") : (lastRead?.content ?? "");
        d.activeLines = live ? last.changedLines : [];
        if (live && last.before == null) d.note = "The script has not been read yet; its content appears once it is.";
      } else {
        d.content = lastRead?.content ?? "";
        d.status = "read";
      }
    } else {
      const ph = d.action ? entries.get(d.action)?.status : undefined;
      const st = ph ?? statusFromPhase(phases.get(d.action ?? ""));
      d.status = st;
      d.activeLines = st === "proposed" || st === "applying" ? [{ from: 1, to: d.content.split("\n").length }] : [];
    }
  }

  // Revert and retry availability.
  const lastReadOf = new Map<string, { source: string; at: number; id: number }>();
  for (const e of events) if (e.kind === "script.read" && e.ok) lastReadOf.set(e.path, { source: e.source, at: e.at, id: e.id });
  for (const c of changes.values()) {
    c.revert = revertAvailability(c, [...changes.values()], lastReadOf.get(c.path)?.source ?? null, opts.busy === true);
    c.retry = retryAvailabilityFor(events, c.action, opts.busy === true, phases);
  }
  for (const en of entries.values()) {
    const c = changes.get(en.id);
    if (c) { en.added = c.added; en.removed = c.removed; en.revert = c.revert; en.retry = c.retry; }
    else {
      en.revert = NO(en.kind === "command" ? "Commands run code in Studio; Keplar has no record of the earlier state to restore." : "Only script edits can be reverted.");
      en.retry = retryAvailabilityFor(events, en.id, opts.busy === true, phases);
      if (en.kind === "command" && en.docId) { const d = docs.get(en.docId); if (d) en.added = d.content.split("\n").length; }
    }
  }

  // Active: the newest document whose action is waiting or running, else the most recently touched.
  let activeId: string | null = null;
  for (let i = events.length - 1; i >= 0 && !activeId; i--) {
    const e = events[i]!;
    if (e.kind !== "action.proposed") continue;
    const ph = phases.get(e.action);
    const id = docOfAction.get(e.action);
    if (id && (ph === "proposed" || ph === "waiting" || ph === "running" || changes.get(e.action)?.status === "applying")) activeId = id;
  }
  if (!activeId) {
    let best: CodeDocument | null = null;
    for (const d of docs.values()) if (!best || d.updatedAt >= best.updatedAt) best = d;
    activeId = best?.id ?? null;
  }

  return { documents: order.map((id) => docs.get(id)!), changes: [...entries.values()], activeId };
}

function statusFromPhase(p: ActionPhase | undefined): DocStatus {
  switch (p) {
    case "running": return "applying";
    case "done": return "applied";
    case "failed": return "failed";
    case "declined": return "declined";
    default: return "proposed";
  }
}

/**
 * Whether a script change can be reverted: confirmed applied, the exact full before-content captured right before it ran, the
 * script still exactly as this change left it (nothing later edited it), no revert already done or pending, and no run in progress.
 */
export function revertAvailability(c: ScriptChange, all: readonly ScriptChange[], currentSource: string | null, busy: boolean): Availability {
  if (c.status === "differs") return NO("After the edit the script did not match the proposed content, so the exact earlier state is not certain.");
  if (c.status === "unconfirmed") return NO("The script could not be re-read after the edit.");
  if (c.status !== "applied") return NO(c.status === "failed" ? "The edit failed; nothing to revert." : c.status === "declined" ? "The edit was not run." : "The edit has not finished.");
  if (c.beforeFrom !== "before" || c.before == null || !c.beforeComplete) return NO("The script's full content right before the edit was not captured.");
  if (c.applied == null || !c.appliedComplete) return NO("The script's full content after the edit was not captured.");
  if (c.applied === "") return NO("The edit emptied the script; there is no text left for an exact-match edit to replace.");
  // Later = proposed after this one (the order of `all`, which is proposal order); timestamps can tie within one millisecond.
  const idx = all.findIndex((x) => x.id === c.id);
  const later = (idx >= 0 ? all.slice(idx + 1) : all.filter((x) => x.at >= c.at && x.id !== c.id)).filter((x) => x.path === c.path);
  if (later.some((x) => x.of === c.id && x.status === "applied")) return NO("Already reverted.");
  if (later.some((x) => x.of === c.id && (x.status === "proposed" || x.status === "applying"))) return NO("A revert is already pending.");
  if (later.some((x) => x.status === "applied" || x.status === "differs" || x.status === "unconfirmed" || x.status === "applying")) return NO("A later change edited this script; revert that one first.");
  if (currentSource != null && editOutcome(c.applied, { source: currentSource, complete: true, format: "plain" }) !== "applied") return NO("The script has changed since this edit.");
  if (busy) return NO("Wait for the current run to finish.");
  return YES;
}

/**
 * Retry re-runs a failed tool call, unchanged, through the same approval flow. `retried`: a retry of this action was already
 * started (and not declined); that retry then carries its own availability, so one failure never offers two Retry buttons.
 */
export function retryAvailability(phase: ActionPhase | undefined, busy: boolean, retried = false): Availability {
  if (phase !== "failed") return NO("Only failed actions can be retried.");
  if (retried) return NO("Already retried.");
  if (busy) return NO("Wait for the current run to finish.");
  return YES;
}

/** Whether a failed action can be retried now, from the log alone (the hook's retry() and deriveDocuments use the same rule). */
export function retryAvailabilityFor(events: readonly StudioEvent[], action: string, busy: boolean, phases: Map<string, ActionPhase> = actionPhases(events)): Availability {
  const retried = events.some((e) => e.kind === "action.proposed" && e.origin === "retry" && e.of === action && phases.get(e.action) !== "declined");
  return retryAvailability(phases.get(action), busy, retried);
}

/**
 * True when an action is a revert, or a retry (of a retry ...) of one. Such an action always waits for the person: a revert is
 * never auto-approved, and retrying it must not change that.
 */
export function isRevertLineage(events: readonly StudioEvent[], action: string): boolean {
  const byKey = new Map<string, Extract<StudioEvent, { kind: "action.proposed" }>>();
  for (const e of events) if (e.kind === "action.proposed") byKey.set(e.action, e);
  const seen = new Set<string>();
  for (let k: string | null = action; k && !seen.has(k); ) {
    seen.add(k);
    const p = byKey.get(k);
    if (!p) return false;
    if (p.origin === "revert") return true;
    if (p.origin !== "retry") return false;
    k = p.of;
  }
  return false;
}

/** The revert as a multi_edit: replace the whole script as this change left it with its exact earlier content. */
export function buildRevert(c: ScriptChange): { name: "multi_edit"; args: Record<string, unknown>; risk: Risk } | null {
  if (c.before == null || c.applied == null) return null;
  return {
    name: "multi_edit",
    args: { ...(c.studioId ? { studio_id: c.studioId } : {}), file_path: c.path, edits: [{ old_string: c.applied, new_string: c.before }] },
    // An emptying edit is destructive by the server's own rule (new_string ""); so is reverting a destructive change.
    risk: c.before === "" || c.risk === "destructive" ? "destructive" : "change",
  };
}
