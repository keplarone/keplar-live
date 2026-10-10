/**
 * {name} slots and <tag>text</tag> links in catalog strings. Translators move the tags with the words, so word order stays natural.
 */
import { Fragment, type ReactNode } from "react";

export function fmt(s: string, vars: Record<string, string | number> = {}): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** `rich("Read the <a>docs</a>.", { a: (t) => <Link href="/docs">{t}</Link> })`. Unknown tags render their text only. */
export function rich(s: string, tags: Record<string, (text: string) => ReactNode>, vars: Record<string, string | number> = {}): ReactNode {
  const src = fmt(s, vars);
  const out: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const render = tags[m[1]];
    out.push(<Fragment key={i++}>{render ? render(m[2]) : m[2]}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(src.slice(last));
  return <>{out}</>;
}

/** The same string with the tags removed (for titles, aria-labels and metadata). */
export const plain = (s: string, vars: Record<string, string | number> = {}) => fmt(s, vars).replace(/<\/?\w+>/g, "");
