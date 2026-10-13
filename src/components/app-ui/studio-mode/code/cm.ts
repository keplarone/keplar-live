/**
 * CodeMirror 6 for the live code panel and diff view. Loaded on demand (`import("./cm")` from the components), so only pages that
 * show code pay for it. No web workers, no eval, styles injected as <style> (allowed by the app CSP's style-src 'unsafe-inline').
 *
 * Read-only everywhere: the panel shows what Keplar read, proposed and applied; it is not an editor of the place.
 * Colours come from CSS variables (code.module.css sets them from the site tokens), so the integrator themes them in one place.
 */
import { Compartment, EditorState, RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, drawSelection, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import { HighlightStyle, StreamLanguage, codeFolding, foldGutter, foldKeymap, foldService, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { json } from "@codemirror/legacy-modes/mode/javascript";
import { python } from "@codemirror/lang-python";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { tags as t } from "@lezer/highlight";
import type { DocLanguage } from "./documents";
import type { LineRange } from "./line-diff";

const v = (name: string, fallback: string) => `var(${name}, ${fallback})`;

/** Monochrome-first: weight and tone carry most of the structure; strings and numbers get one quiet tint each. */
const style = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier, t.definitionKeyword], color: v("--code-syn-kw", "var(--c-ink, #111)"), fontWeight: "600" },
  { tag: [t.string, t.special(t.string)], color: v("--code-syn-str", "var(--c-creation, #8a4f24)") },
  { tag: [t.number, t.bool, t.null, t.atom], color: v("--code-syn-num", "var(--c-attention, #8a5a00)") },
  { tag: [t.comment, t.lineComment, t.blockComment], color: v("--code-syn-comment", "var(--c-ink-3, #696b71)"), fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: v("--code-syn-fn", "var(--c-ink, #111)") },
  { tag: [t.propertyName], color: v("--code-syn-prop", "var(--c-ink-2, #62646a)") },
  { tag: [t.className, t.typeName, t.standard(t.variableName)], color: v("--code-syn-type", "var(--c-ink-2, #62646a)") },
  { tag: t.invalid, color: v("--code-err", "var(--c-err, #b42318)") },
]);

const theme = EditorView.theme({
  "&": { color: v("--code-fg", "var(--c-ink, #111)"), backgroundColor: v("--code-bg", "transparent"), fontSize: v("--code-size", "12.5px"), height: "100%" },
  ".cm-scroller": { fontFamily: v("--code-font", "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"), lineHeight: "1.6" },
  ".cm-content": { caretColor: v("--code-fg", "currentColor"), padding: "8px 0" },
  ".cm-gutters": { backgroundColor: v("--code-gutter-bg", "transparent"), color: v("--code-gutter-fg", "var(--c-ink-3, #888)"), border: "none", borderRight: `1px solid ${v("--code-line", "var(--c-border, rgba(0,0,0,.08))")}` },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px", minWidth: "32px", fontVariantNumeric: "tabular-nums" },
  ".cm-foldGutter .cm-gutterElement": { padding: "0 4px", color: v("--code-gutter-fg", "#888") },
  ".cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: v("--code-selection", "rgba(127,127,127,.22)") },
  ".cm-searchMatch": { backgroundColor: v("--code-match", "rgba(127,127,127,.25)"), outline: "none" },
  ".cm-searchMatch-selected": { backgroundColor: v("--code-match-active", "rgba(127,127,127,.45)") },
  ".cm-selectionMatch": { backgroundColor: v("--code-match", "rgba(127,127,127,.18)") },
  ".cm-panels": { backgroundColor: v("--code-panel-bg", "var(--c-surface-1, #f7f8fa)"), color: "inherit", borderColor: v("--code-line", "rgba(0,0,0,.08)") },
  ".cm-panels input, .cm-panels button": { font: "inherit", fontSize: "12px" },
  ".cm-foldPlaceholder": { backgroundColor: "transparent", border: `1px solid ${v("--code-line", "rgba(0,0,0,.12)")}`, color: v("--code-gutter-fg", "#888"), padding: "0 4px", borderRadius: "3px" },
  // The lines actively changing (the proposal's changed lines, or a command while it runs): a neutral band plus a left rule.
  ".cm-live-line": { backgroundColor: v("--code-live-bg", "rgba(127,127,127,.10)"), boxShadow: `inset 2px 0 0 ${v("--code-live-rule", "var(--c-ink, #111)")}`, transition: "background-color 240ms ease" },
  // Diff colours (merge views): green additions, red deletions, unchanged neutral.
  ".cm-changedLine, .cm-insertedLine": { backgroundColor: v("--code-add-bg", "rgba(31,122,74,.12)") },
  ".cm-changedText": { backgroundColor: v("--code-add-text-bg", "rgba(31,122,74,.24)"), backgroundImage: "none" },
  ".cm-deletedChunk, .cm-deletedLine": { backgroundColor: v("--code-del-bg", "rgba(180,35,24,.10)") },
  ".cm-deletedChunk .cm-deletedText, .cm-deletedText": { backgroundColor: v("--code-del-text-bg", "rgba(180,35,24,.22)"), textDecoration: "none" },
  ".cm-changeGutter": { width: "3px", paddingLeft: "0" },
  ".cm-changedLineGutter": { backgroundColor: v("--code-add-rule", "var(--c-ok, #1f7a4a)") },
  ".cm-deletedLineGutter": { backgroundColor: v("--code-del-rule", "var(--c-err, #b42318)") },
  ".cm-collapsedLines": { color: v("--code-gutter-fg", "#888"), backgroundColor: v("--code-panel-bg", "rgba(127,127,127,.06)"), backgroundImage: "none", fontSize: "11.5px", padding: "4px 12px", cursor: "pointer" },
});

/** Indentation-based folding (Luau and the legacy Lua mode have no syntax tree to fold on). */
const indentFold = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  if (!line.text.trim()) return null;
  const ind = indentOf(line.text);
  let end = line.number;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const l = state.doc.line(n);
    if (!l.text.trim()) continue;
    if (indentOf(l.text) <= ind) break;
    end = n;
  }
  return end > line.number ? { from: line.to, to: state.doc.line(end).to } : null;
});

function indentOf(s: string): number {
  let n = 0;
  for (const ch of s) { if (ch === " ") n++; else if (ch === "\t") n += 4; else break; }
  return n;
}

export function languageFor(lang: DocLanguage): Extension {
  if (lang === "luau") return StreamLanguage.define(lua);
  if (lang === "python") return python();
  if (lang === "json") return StreamLanguage.define(json);
  return [];
}

const setLive = StateEffect.define<LineRange[]>();
const liveLines = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setLive)) next = liveDecorations(tr.state, e.value);
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});
const liveMark = Decoration.line({ class: "cm-live-line" });
function liveDecorations(state: EditorState, ranges: LineRange[]): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const lines = state.doc.lines;
  for (const r of [...ranges].sort((x, y) => x.from - y.from)) {
    for (let n = Math.max(1, r.from); n <= Math.min(lines, r.to); n++) b.add(state.doc.line(n).from, state.doc.line(n).from, liveMark);
  }
  return b.finish();
}

function base(lang: Compartment, language: DocLanguage): Extension[] {
  return [
    lineNumbers(),
    codeFolding(),
    foldGutter({ markerDOM: (open) => { const s = document.createElement("span"); s.textContent = open ? "▾" : "▸"; s.setAttribute("aria-hidden", "true"); return s; } }),
    indentFold,
    drawSelection(),
    EditorState.readOnly.of(true),
    EditorView.contentAttributes.of({ "aria-readonly": "true" }),
    search({ top: true }),
    highlightSelectionMatches(),
    keymap.of([...searchKeymap, ...foldKeymap]),
    syntaxHighlighting(style),
    lang.of(languageFor(language)),
    theme,
  ];
}

export type ViewerOptions = { content: string; language: DocLanguage; activeLines: LineRange[]; wrap?: boolean; label?: string };
export type ViewerHandle = { update(o: ViewerOptions): void; destroy(): void };

/** A read-only code viewer with line numbers, folding, search (Ctrl/Cmd+F) and the live-lines band. */
export function createViewer(parent: HTMLElement, o: ViewerOptions): ViewerHandle {
  const lang = new Compartment();
  const wrap = new Compartment();
  let language = o.language;
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: o.content, extensions: [...base(lang, o.language), liveLines, wrap.of(o.wrap ? EditorView.lineWrapping : []), EditorView.contentAttributes.of({ "aria-label": o.label ?? "Code" })] }),
  });
  const reveal = (ranges: LineRange[]) => {
    const first = ranges[0];
    if (!first) return [];
    const line = view.state.doc.line(Math.min(Math.max(1, first.from), view.state.doc.lines));
    return [EditorView.scrollIntoView(line.from, { y: "center" })];
  };
  view.dispatch({ effects: [setLive.of(o.activeLines), ...reveal(o.activeLines)] });
  return {
    update(n) {
      const effects: StateEffect<unknown>[] = [];
      if (n.language !== language) { effects.push(lang.reconfigure(languageFor(n.language))); language = n.language; }
      effects.push(wrap.reconfigure(n.wrap ? EditorView.lineWrapping : []));
      const same = view.state.doc.toString() === n.content;
      view.dispatch({ ...(same ? {} : { changes: { from: 0, to: view.state.doc.length, insert: n.content } }), effects });
      view.dispatch({ effects: [setLive.of(n.activeLines), ...reveal(n.activeLines)] });
    },
    destroy() { view.destroy(); },
  };
}

export type DiffOptions = { before: string; after: string; language: DocLanguage; mode: "inline" | "split"; collapseUnchanged?: boolean };
export type DiffHandle = { destroy(): void };

/** The diff: side by side (MergeView) or inline (unified). No accept/reject chunk buttons: Approve and Revert are real actions outside. */
export function createDiff(parent: HTMLElement, o: DiffOptions): DiffHandle {
  const collapse = o.collapseUnchanged === false ? undefined : { margin: 3, minSize: 6 };
  if (o.mode === "split") {
    const ext = (label: string) => [...base(new Compartment(), o.language), EditorView.contentAttributes.of({ "aria-label": label })];
    const mv = new MergeView({
      parent,
      a: { doc: o.before, extensions: ext("Before") },
      b: { doc: o.after, extensions: ext("After") },
      highlightChanges: true,
      gutter: true,
      ...(collapse ? { collapseUnchanged: collapse } : {}),
    });
    return { destroy: () => mv.destroy() };
  }
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: o.after,
      extensions: [
        ...base(new Compartment(), o.language),
        EditorView.contentAttributes.of({ "aria-label": "Changes" }),
        unifiedMergeView({ original: o.before, mergeControls: false, highlightChanges: true, gutter: true, syntaxHighlightDeletions: true, ...(collapse ? { collapseUnchanged: collapse } : {}) }),
      ],
    }),
  });
  return { destroy: () => view.destroy() };
}
