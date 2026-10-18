"use client";

/**
 * Small, dependency-free Markdown renderer for Keplar answers. Produces React
 * elements (never raw HTML), tolerates partial input while streaming, and
 * supports the subset answers use: headings, paragraphs, lists, block quotes,
 * rules, tables, fenced code, inline code, emphasis and links.
 */
import { safeHref } from "@/lib/safe-href";
import { splitForEase } from "@/lib/typing/smooth";
import { Fragment, memo, useState, type ReactNode } from "react";
import { MATH_TOKEN, maskMath, type MathItem } from "@/lib/math/extract";
import { joinLines, splitLines } from "@/lib/md-lines";
import { MorphIcon } from "@/components/kit";
import { MathSpan } from "./MathSpan";
import { Button } from "@/components/kit";
import s from "./Markdown.module.css";
import { CodeRunner, runnableLang } from "./parity/CodeRunner";

type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "quote"; text: string }
  | { t: "hr" }
  | { t: "code"; lang: string; code: string; open: boolean }
  | { t: "table"; head: string[]; align: ("left" | "right" | "center" | null)[]; rows: string[][] };

const splitRow = (line: string) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^\s*```\s*([\w+-]*)/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      const open = i >= lines.length;
      i++;
      out.push({ t: "code", lang: fence[1] || "", code: body.join("\n"), open });
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push({ t: "h", level: h[1].length, text: h[2] }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push({ t: "hr" }); i++; continue; }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      out.push({ t: "table", head, align, rows });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      out.push({ t: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      out.push({ t: "ol", items });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push({ t: "quote", text: joinLines(body) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*```|\s*[-*]\s+|\s*\d+[.)]\s+|\s*>|\s*\|)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push({ t: "p", text: joinLines(para) });
  }
  return out;
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/g;
/** With citations on (a Deep Research report): a bare "[3]" that isn't a link is a citation of page 3. */
const INLINE_CITE = new RegExp(`${INLINE.source}|(\\[\\d{1,2}\\](?!\\())`, "g");
export type CiteRenderer = (n: number, key: string) => ReactNode;

/** Plain text with math placeholders swapped for rendered formulas. */
/** Streaming only: the newest words fade in one by one (opacity + blur, no movement, so nothing reflows). Older words are plain text. */
function eased(text: string, key: string): ReactNode[] {
  const { head, words } = splitForEase(text);
  const out: ReactNode[] = head ? [head] : [];
  for (const w of words) out.push(w.word ? <span key={`${key}-w${w.index}`} className={s.w}>{w.text}</span> : w.text);
  return out;
}

/** Lines kept inside a paragraph (see joinLines) become <br>s; everything else passes through. */
function withBreaks(nodes: ReactNode[], key: string): ReactNode[] {
  if (!nodes.some((n) => typeof n === "string" && n.includes("\n"))) return nodes;
  const out: ReactNode[] = [];
  nodes.forEach((n, i) => {
    if (typeof n !== "string" || !n.includes("\n")) return void out.push(n);
    splitLines(n).forEach((part, j) => {
      if (j) out.push(<br key={`${key}-br${i}-${j}`} />);
      if (part) out.push(part);
    });
  });
  return out;
}

function plain(text: string, key: string, items: MathItem[], ease = false): ReactNode[] {
  // a display formula is already a block of its own: a <br> beside it would only add an empty line
  const t = items.length && text.includes("\n") ? text.replace(/\n*(\uE000(\d+)\uE001)\n*/g, (m, tok: string, n: string) => (items[Number(n)]?.display ? ` ${tok} ` : m)) : text;
  return withBreaks(plainRaw(t, key, items, ease), key);
}

function plainRaw(text: string, key: string, items: MathItem[], ease = false): ReactNode[] {
  if (!items.length || !text.includes("\uE000")) return ease ? eased(text, key) : [text];
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH_TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(...(ease ? eased(text.slice(last, idx), `${key}-e${last}`) : [text.slice(last, idx)]));
    const it = items[Number(m[1])];
    if (it) out.push(<MathSpan key={`${key}-m${m[1]}`} tex={it.tex} display={it.display} raw={it.raw} />);
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(...(ease ? eased(text.slice(last), `${key}-e${last}`) : [text.slice(last)]));
  return out;
}

function inline(text: string, key = "i", items: MathItem[] = [], ease = false, cite?: CiteRenderer): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(cite ? INLINE_CITE : INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(...plain(text.slice(last, idx), `${key}-t${n}`, items, ease));
    const tok = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k} className={s.inlineCode}>{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(tok.slice(2, -2), k, items, ease, cite)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(tok.slice(1, -1), k, items, ease, cite)}</em>);
    else if (m[5] && cite) out.push(<Fragment key={k}>{cite(Number(tok.slice(1, -1)), k)}</Fragment>);
    else if (m[4]) {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      const safe = safeHref(href);
      out.push(safe ? <a key={k} href={href} className={s.link} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">{inline(label, k, items, ease)}</a> : <Fragment key={k}>{inline(label, k, items, ease)}</Fragment>);
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(...plain(text.slice(last), `${key}-t${n}`, items, ease));
  return out;
}

export function CodeBlock({ code, lang, streaming }: { code: string; lang: string; streaming?: boolean }) {
  const [copied, setCopied] = useState(false);
  const runLang = runnableLang(lang);
  const [runOpen, setRunOpen] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: leave the button as is */
    }
  };
  return (
    <figure className={s.code}>
      <figcaption className={s.codeBar}>
        <span className={s.codeLang}>{lang || "text"}</span>
        <Button size="sm" variant="ghost" className={s.copy} onClick={copy} disabled={streaming} aria-label={copied ? "Copied" : `Copy ${lang || "code"}`} leadingIcon={<MorphIcon icon="copy" state={copied ? "copied" : "idle"} size={14} />}>
          {copied ? "Copied" : "Copy"}
        </Button>
        {runLang && !streaming && !runOpen ? (
          <Button size="sm" variant="ghost" className={s.copy} onClick={() => setRunOpen(true)} aria-label={`Run this ${runLang === "python" ? "Python" : "JavaScript"} in a sandbox`} data-run-code="">
            Run
          </Button>
        ) : null}
      </figcaption>
      <pre className={s.pre} tabIndex={0}>
        <code>{code}</code>
      </pre>
      {runLang && runOpen ? <CodeRunner code={code} lang={runLang} compact autoRun /> : null}
    </figure>
  );
}

/** The typing caret: a thin bar that blinks (steady, not animated under prefers-reduced-motion). */
export function Caret() {
  return <span className={s.caret} aria-hidden="true" />;
}

/**
 * `caret` draws the typing caret at the end of the last text block (inside the last paragraph,
 * heading, quote or list item, so it sits where the next character will appear), or after a last
 * block that has no inline text (code, table, rule). `streaming` also locks the copy button of an
 * open code block. The renderer is a pure function of `source`, so partial text re-renders cheaply.
 */
function MarkdownImpl({ source, streaming, caret, cite }: { source: string; streaming?: boolean; caret?: boolean; cite?: CiteRenderer }) {
  const { text: masked, items } = maskMath(source, streaming);
  const blocks = parse(masked);
  // streaming: only the newest block eases its newest words in (the finished blocks above it are plain, so a long answer stays cheap)
  const inline_ = (t: string, k: string) => inline(t, k, items, Boolean(streaming) && k.startsWith(`b${blocks.length - 1}`) && (k === `b${blocks.length - 1}` || k.startsWith(`b${blocks.length - 1}-`)), cite);
  const lastIdx = blocks.length - 1;
  const c = (i: number, j?: number, jLast?: number) => (caret && i === lastIdx && (j === undefined || j === jLast) ? <Caret /> : null);
  const textLast = blocks[lastIdx] && ["h", "p", "ul", "ol", "quote"].includes(blocks[lastIdx].t);
  // dir="auto" on every text block: an Arabic / Hebrew / Persian answer reads right to left with its punctuation on the correct side
  // (".عاصمة فرنسا هي باريس" was rendered as LTR), while English and mixed answers that start with a Latin letter stay LTR.
  return (
    <div className={s.md}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.t) {
          case "h": {
            const Tag = (b.level <= 2 ? "h3" : "h4") as "h3" | "h4";
            return <Tag key={k} className={s.h} dir="auto">{inline_(b.text, k)}{c(i)}</Tag>;
          }
          case "p":
            return <p key={k} dir="auto">{inline_(b.text, k)}{c(i)}</p>;
          case "ul":
            return <ul key={k} className={s.ul} dir="auto">{b.items.map((it, j) => <li key={j} dir="auto">{inline_(it, `${k}-${j}`)}{c(i, j, b.items.length - 1)}</li>)}</ul>;
          case "ol":
            return <ol key={k} className={s.ol} dir="auto">{b.items.map((it, j) => <li key={j} dir="auto">{inline_(it, `${k}-${j}`)}{c(i, j, b.items.length - 1)}</li>)}</ol>;
          case "quote":
            return <blockquote key={k} className={s.quote} dir="auto">{inline_(b.text, k)}{c(i)}</blockquote>;
          case "hr":
            return <hr key={k} className={s.hr} />;
          case "code":
            return <CodeBlock key={k} code={b.code} lang={b.lang} streaming={streaming && b.open} />;
          case "table":
            return (
              <div key={k} className={s.tableWrap} tabIndex={0} role="region" aria-label="Table">
                <table className={s.table}>
                  <thead>
                    <tr>{b.head.map((c, j) => <th key={j} scope="col" style={{ textAlign: b.align[j] ?? undefined }}>{inline_(c, `${k}-h${j}`)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri}>
                        {b.head.map((_, j) =>
                          j === 0 && !b.head[0] ? (
                            <th key={j} scope="row">{inline_(r[j] ?? "", `${k}-${ri}-${j}`)}</th>
                          ) : (
                            <td key={j} style={{ textAlign: b.align[j] ?? undefined }}>{inline_(r[j] ?? "", `${k}-${ri}-${j}`)}</td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
      {caret && (!blocks.length || !textLast) ? <p className={s.caretLine}><Caret /></p> : null}
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
