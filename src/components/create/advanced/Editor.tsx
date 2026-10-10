"use client";
/**
 * The shared code editor: CodeMirror 6 bound to one Y.Text with y-codemirror.next, so every keystroke is a CRDT op and every
 * collaborator's caret and selection is drawn in their color with their name. Critic findings for the open file sit in their
 * own gutter (live, as you type). Viewers get the same view, read-only.
 */
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { EditorState, RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView, GutterMarker, gutter, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, drawSelection, dropCursor, rectangularSelection } from "@codemirror/view";
import { defaultKeymap, indentWithTab, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { tags as t } from "@lezer/highlight";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { filesOf } from "@/lib/collab/doc";
import type { Finding } from "@/lib/critic/types";
import s from "./advanced.module.css";

// Flat, warm syntax colors. Each is a CSS variable (advanced.module.css) so it reads on graphite in dark and on paper in light. No blue-purple.
const look = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: "var(--syn-kw)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--syn-str)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--syn-num)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--c-ink-3)", fontStyle: "italic" },
  { tag: [t.tagName, t.angleBracket], color: "var(--syn-tag)" },
  { tag: [t.attributeName, t.propertyName], color: "var(--syn-attr)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--syn-fn)" },
  { tag: [t.className, t.typeName], color: "var(--syn-type)" },
  { tag: [t.definition(t.variableName)], color: "var(--c-ink)" },
  { tag: [t.unit, t.color], color: "var(--syn-num)" },
  { tag: t.invalid, color: "var(--c-err)" },
]);

function langFor(path: string): Extension {
  if (/\.html?$/i.test(path)) return html();
  if (/\.css$/i.test(path)) return css();
  if (/\.(m?jsx?|tsx?)$/i.test(path)) return javascript({ jsx: true, typescript: /\.tsx?$/i.test(path) });
  return [];
}

class Mark extends GutterMarker {
  constructor(readonly sev: string, readonly title: string) { super(); }
  eq(o: Mark) { return o.sev === this.sev && o.title === this.title; }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-critic-mark";
    el.dataset.sev = this.sev;
    el.title = this.title;
    return el;
  }
}
const setMarks = StateEffect.define<{ line: number; sev: string; title: string }[]>();
const marks = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(v, tr) {
    v = v.map(tr.changes);
    for (const e of tr.effects) if (e.is(setMarks)) {
      const doc = tr.state.doc;
      const byLine = new Map<number, { sev: string; title: string }>();
      for (const m of e.value) if (m.line >= 1 && m.line <= doc.lines && !byLine.has(m.line)) byLine.set(m.line, m);
      v = RangeSet.of([...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([ln, m]) => new Mark(m.sev, m.title).range(doc.line(ln).from)));
    }
    return v;
  },
});
const criticGutter = [marks, gutter({ class: "cm-critic-gutter", markers: (v) => v.state.field(marks) })];

export function Editor({ doc, awareness, path, readOnly, findings, jump, onCursor, onViewport }: {
  doc: Y.Doc;
  awareness: Awareness;
  path: string;
  readOnly: boolean;
  findings: Finding[];
  /** Scroll to (and, when `select`, place the caret on) a line; `at` makes repeated jumps to the same line fire. */
  jump: { line: number; at: number; select?: boolean } | null;
  onCursor: (line: number) => void;
  onViewport: (top: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const cb = useRef({ onCursor, onViewport });
  useEffect(() => { cb.current = { onCursor, onViewport }; }, [onCursor, onViewport]);
  // The file may arrive after mount (first sync) or be replaced (pull, split): bind to whichever Y.Text holds it now.
  const [ytext, setYtext] = useState<Y.Text | null>(() => { const t = filesOf(doc).get(path); return t instanceof Y.Text ? t : null; });
  const [viewTick, setViewTick] = useState(0);
  useEffect(() => {
    const m = filesOf(doc);
    const h = () => { const t = m.get(path); setYtext(t instanceof Y.Text ? t : null); };
    h();
    m.observe(h);
    return () => m.unobserve(h);
  }, [doc, path]);

  useEffect(() => {
    if (!host.current || !ytext) return;
    const undo = new Y.UndoManager(ytext);
    let lastLine = -1, lastTop = -1;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          lineNumbers(), foldGutter(), criticGutter, highlightActiveLineGutter(), highlightActiveLine(), drawSelection(), dropCursor(), rectangularSelection(),
          history(), indentOnInput(), bracketMatching(), closeBrackets(), highlightSelectionMatches(),
          syntaxHighlighting(look), langFor(path),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...yUndoManagerKeymap, indentWithTab]),
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ "aria-label": `${path}${readOnly ? " (read-only)" : ""}` }),
          yCollab(ytext, awareness, { undoManager: undo }),
          EditorView.updateListener.of((u) => {
            if (u.selectionSet || u.docChanged) {
              const ln = u.state.doc.lineAt(u.state.selection.main.head).number;
              if (ln !== lastLine) { lastLine = ln; cb.current.onCursor(ln); }
            }
            if (u.viewportChanged) {
              const top = u.state.doc.lineAt(u.view.viewport.from).number;
              if (top !== lastTop) { lastTop = top; cb.current.onViewport(top); }
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    setViewTick((n) => n + 1);
    return () => { view.destroy(); undo.destroy(); viewRef.current = null; };
  }, [ytext, awareness, path, readOnly]);

  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    v.dispatch({ effects: setMarks.of(findings.filter((f) => f.file === path).map((f) => ({ line: f.line, sev: f.severity, title: `${f.title}\n${f.fix}` }))) });
  }, [findings, path, viewTick]);

  useEffect(() => {
    const v = viewRef.current;
    if (!v || !jump) return;
    const ln = Math.min(Math.max(1, jump.line), v.state.doc.lines);
    const pos = v.state.doc.line(ln).from;
    v.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 48 }), ...(jump.select ? { selection: { anchor: pos } } : {}) });
    if (jump.select) v.focus();
  }, [jump]);

  return (
    <div ref={host} className={s.editor}>
      {ytext ? null : <p className={s.editorEmpty}>{filesOf(doc).size ? `${path} is not in this session.` : "Loading the session…"}</p>}
    </div>
  );
}
