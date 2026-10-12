/**
 * Live Research in the chat, the pure parts (unit-tested): how the Keplar One desktop app's progress, run and citation check become the
 * chat's own research events, request field and answer data. The side effects (calling the bridge, streaming /api/keplar) live in
 * live-run.ts. keplar-desktop: src/main/research (desktop app 0.2.0+).
 *
 * Nothing here invents provenance: every source, date and quote comes from the desktop's run or check. The check compares words and
 * numbers (basis "lexical"); statuses are shown as words, never as percentages, and never as a check by Keplar's servers.
 */
import type { KeplarAnswer, LiveClaim, LiveDepth, LiveResearchMeta, ResearchEvent, ResearchSource } from "@/lib/orchestration/types";
import type { ResearchProgress, ResearchRun, ResearchRunSource, ResearchValidation } from "@/lib/desktop/research-bridge";

/**
 * Splits markdown into prose (even indexes) and code (odd): ``` and ~~~ fences, closed or left open at the end (an answer cut off inside
 * a code block is still code), and inline code.
 */
const CODE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/;

/** The step updates one desktop progress report stands for (the desktop only reports stages it is really in). */
export function progressEvents(p: ResearchProgress): ResearchEvent[] {
  const step = (s: "plan" | "search" | "read" | "check", status: "active" | "done" | "skipped"): ResearchEvent => ({ phase: "step", step: s, status });
  const live: ResearchEvent = { phase: "live", label: p.label, read: p.read };
  switch (p.stage) {
    case "planning":
      return [live, step("plan", "active")];
    case "searching":
      return [live, step("plan", "done"), step("search", "active")];
    case "reading":
    case "following":
      return [live, step("plan", "done"), step("search", "done"), step("read", "active")];
    case "checking":
      return [live, step("check", "active")];
    case "ready":
      return [live, step("plan", "done"), step("search", "done"), step("read", "done")];
    case "failed":
    case "cancelled":
      return [live];
  }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** A desktop source as the chat's ResearchSource (provenance kept; signals as plain sentences). */
export function toResearchSource(src: ResearchRunSource, queries: string[]): ResearchSource {
  const q = queries.indexOf(src.foundBy.query);
  return {
    n: src.n,
    title: src.title,
    url: src.url,
    host: hostOf(src.url),
    query: q >= 0 ? q : 0,
    ...(src.description ? { snippet: src.description.slice(0, 280) } : {}),
    ...(src.publisher ? { publisher: src.publisher } : {}),
    ...(src.publishedAt ? { publishedAt: src.publishedAt } : {}),
    ...(src.retrievedAt ? { retrievedAt: src.retrievedAt } : {}),
    ...(src.kind ? { kind: src.kind } : {}),
    ...(src.group ? { group: src.group } : {}),
    ...(src.fromEarlierTurn ? { fromEarlierTurn: true } : {}),
    ...(src.signals?.length ? { signals: src.signals.slice(0, 4).map((x) => x.text.slice(0, 200)) } : {}),
  };
}

/** `source` events for the run's sources not shown yet (the live card lists pages as they are read). */
export function newSourceEvents(run: ResearchRun, shown: ReadonlySet<number>): ResearchEvent[] {
  return run.sources.filter((x) => !shown.has(x.n)).map((x) => ({ phase: "source", source: toResearchSource(x, run.queries) }));
}

/** The `liveResearch` request field: the brief and only the sources the brief contains (the server re-checks both). */
export function liveRequestField(run: ResearchRun, brief: string, webSearch: boolean) {
  const inBrief = new Set([...brief.matchAll(/<source n="(\d{1,2})"/g)].map((m) => Number(m[1])));
  return {
    runId: run.id,
    depth: run.depth.selected,
    brief,
    queries: run.queries.slice(0, 16),
    webSearch,
    sources: run.sources
      .filter((x) => inBrief.has(x.n))
      .map((x) => ({ n: x.n, title: x.title, url: x.url, publisher: x.publisher, publishedAt: x.publishedAt, retrievedAt: x.retrievedAt, kind: x.kind, group: x.group, fromEarlierTurn: x.fromEarlierTurn === true })),
  };
}

/**
 * "[1, 3]" → "[1][3]" and "[2–4]" → "[2][3][4]", outside code, so the chat's renderer turns every number into a chip. The desktop's
 * check keeps grouped markers as the model wrote them; the server already normalized them once.
 */
export function normalizeMarkers(markdown: string): string {
  return markdown
    .split(CODE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\[(\d{1,2}(?:\s*[,;–-]\s*\d{1,2})+)\](?!\()/g, (m: string, list: string) => {
            const out: number[] = [];
            for (const piece of list.split(/\s*[,;]\s*/)) {
              const r = /^(\d{1,2})\s*[–-]\s*(\d{1,2})$/.exec(piece);
              if (r) {
                const a = Number(r[1]), b = Number(r[2]);
                if (b < a || b - a > 20) return m;
                for (let n = a; n <= b; n++) out.push(n);
              } else if (/^\d{1,2}$/.test(piece)) out.push(Number(piece));
              else return m;
            }
            return [...new Set(out)].map((n) => `[${n}]`).join("");
          }),
    )
    .join("");
}

// The desktop's own list (keplar-desktop src/main/research/net-guard.ts TRACKING_PARAMS), so a page it read matches here too.
const TRACKING_PARAMS = /^(utm_[a-z_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|_ga|_gl|ref_src|ref_url|cmpid|cmp|src|smid|sh|si|ocid|taid|guccounter|guce_referrer|guce_referrer_sig|soc_src|soc_trk|__twitter_impression)$/i;

/**
 * A URL as the desktop keys the pages it read (its canonicalKey): host without "www." or "m.", no fragment, no tracking parameters,
 * sorted query, no trailing slash or index page. Null when it isn't http(s).
 */
export function urlKey(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "").replace(/^m\./, "");
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}` : "";
  let path = u.pathname.replace(/\/+$/, "");
  if (/\/(index|default)\.(html?|php|aspx?)$/i.test(path)) path = path.replace(/\/[^/]+$/, "");
  return `${host}${path}${query}`;
}

/**
 * The answer as the page shows it, cleaned outside code (inline code and code blocks are never touched, and indentation is kept):
 * grouped markers become one [n] each, a number that isn't one of the listed pages is removed (ranges included: "[2–4]" with page 3
 * cut from the brief keeps [2][4]), and a link to a page that wasn't read keeps its words but loses the link (a bare one goes).
 * The desktop's check runs on this text. Pure.
 */
export function cleanLiveMarkdown(markdown: string, listed: ReadonlySet<number>, readUrls: ReadonlySet<string>): string {
  const read = (url: string) => {
    const k = urlKey(url.trim());
    return k !== null && readUrls.has(k);
  };
  return normalizeMarkers(markdown)
    .split(CODE)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      const kept: string[] = [];
      const park = (t: string) => `\ue000${kept.push(t) - 1}\ue001`;
      // Reference definitions ("[1]: https://…", "[^1]: https://…") to pages that weren't read go entirely, as on the desktop.
      let out = part.replace(/^ {0,3}\[[^\]\n]{1,200}\]:[ \t]*<?([^\s>]{1,2000})>?(?:[ \t]+(?:"[^"\n]{0,300}"|'[^'\n]{0,300}'|\([^)\n]{0,300}\)))?[ \t]*$/gm, (m: string, url: string) => (read(url.replace(/^\/\//, "https://")) ? park(m) : ""));
      // Inline links and images; a destination may hold one level of parentheses (Wikipedia's "Mercury_(planet)").
      out = out.replace(/(!?)\[([^\]\n]{0,500})\]\(<?((?:[^()\s>]|\([^()\s>]{0,200}\)){1,2000})>?(?:\s+"[^"\n]{0,300}")?\)/g, (m: string, _img: string, label: string, url: string) => (read(url) ? park(m) : label));
      // \ue002 marks where a bare link was taken out, so only those spots are tidied ("see URL." → "see.").
      out = out.replace(/<((?:https?:)?\/\/[^\s<>]{1,2000})>/gi, (m: string, url: string) => (read(url.replace(/^\/\//, "https://")) ? park(m) : "\ue002"));
      // Bare URLs end at whitespace, brackets, or CJK and full-width text (no spaces there: "新闻稿https://…，营收…").
      out = out.replace(/(?<![\w/@.\ue001])(?:https?:\/\/|www\.)(?:[^\s<>()[\]\ue000-\ue002\u3000-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]|\([^\s<>()[\]\ue000-\ue002\u3000-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]{0,200}\)){1,2000}/gi, (url: string) => {
        const trimmed = url.replace(/[.,;:!?'"*_]+$/, "");
        return read(trimmed) ? url : `\ue002${url.slice(trimmed.length)}`;
      });
      out = out.replace(/(?<![ \t])[ \t]*\ue002(?=[.,;:!?)]|$)/gm, "").replace(/\ue002[ \t]*/g, "");
      out = out.replace(/[ \t\u00a0]?\[(\d{1,2})\](?!\()/g, (m: string, n: string) => (listed.has(Number(n)) ? m : ""));
      return out.replace(/\ue000(\d+)\ue001/g, (_m: string, k: string) => kept[Number(k)] ?? "");
    })
    .join("");
}

/** The answer's own text cleaned against the pages the server listed and the pages the desktop read (what the check and the page use). */
export function liveMarkdown(answer: Pick<KeplarAnswer, "markdown" | "research">, run: ResearchRun): string {
  const listed = answer.research?.sources ?? run.sources;
  const urls = new Set<string>();
  for (const x of [...run.sources, ...listed]) {
    const k = urlKey(x.url);
    if (k) urls.add(k);
  }
  return cleanLiveMarkdown(answer.markdown, new Set(listed.map((x) => x.n)), urls);
}

/** The [n] numbers an answer cites (outside code). */
export function citedNumbers(markdown: string): number[] {
  const out = new Set<number>();
  markdown.split(CODE).forEach((part, i) => {
    if (i % 2 === 1) return;
    for (const m of part.matchAll(/\[(\d{1,2})\](?!\()/g)) out.add(Number(m[1]));
  });
  return [...out].sort((a, b) => a - b);
}

/** Shortens to `max` characters on a code-point boundary, backing off to a space only near the end (CJK text has few spaces). */
const clip = (t: string, max: number) => {
  if (t.length <= max) return t;
  const cut = Array.from(t).slice(0, max - 1).join("");
  const sp = cut.lastIndexOf(" ");
  return `${(sp > cut.length * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
};

const SERIOUS: Record<LiveClaim["status"], number> = { conflicting: 0, "not-verified": 1, "partially-supported": 2, supported: 3 };

/**
 * The statements that need a closer look (everything but "supported"), which is all the page shows, most serious first; the summary
 * still counts every statement. Kept small because the check is saved with the chat, and chat sync caps a chat at 400 KB.
 */
export function compactClaims(v: ResearchValidation, listed?: ReadonlySet<number>, max = 20): LiveClaim[] {
  return v.claims
    .filter((c) => c.status !== "supported")
    .sort((a, b) => SERIOUS[a.status] - SERIOUS[b.status]) // stable: answer order within a status; conflicts are never the ones cut
    .slice(0, max)
    .map((c) => {
      // Only a page the person can see is named ("Source 7 says" for a page that isn't listed would point nowhere).
      const conflict = c.conflicts.find((q) => !listed || listed.has(q.n));
      return {
        text: clip(c.text, 300),
        citations: c.citations.slice(0, 6),
        status: c.status,
        ...(conflict ? { conflict: { n: conflict.n, quote: clip(conflict.quote, 280) } } : {}),
        ...(c.note ? { note: clip(c.note, 200) } : {}),
      };
    });
}

/**
 * The finished answer with the desktop's check applied: its text cleaned by the page (liveMarkdown: the desktop's own rewrite isn't
 * used, because it also edits code and indentation), each cited source's evidence quote and signals (what a citation's popover shows),
 * the run's provenance, and the statements that need a closer look. Uncited pages keep only their listing (title, link, publisher,
 * dates). Pure.
 */
export function withLiveCheck(answer: KeplarAnswer, run: ResearchRun, v: ResearchValidation | null, webSearch: boolean, now = new Date()): KeplarAnswer {
  const markdown = liveMarkdown(answer, run);
  const evidence = new Map<number, string>();
  for (const c of v?.citations ?? []) if (c.evidence[0]) evidence.set(c.n, clip(c.evidence[0].quote, 280));
  const base = answer.research;
  const listed = base?.sources ?? run.sources.map((x) => toResearchSource(x, run.queries));
  const valid = new Set(listed.map((x) => x.n));
  const cited = citedNumbers(markdown).filter((n) => valid.has(n));
  const sources = listed.map((x) => {
    const src: ResearchSource = { ...x };
    delete src.evidence;
    delete src.signals;
    delete src.snippet;
    if (!cited.includes(src.n)) return src;
    const quote = evidence.get(src.n);
    const fromRun = run.sources.find((r) => r.n === src.n);
    const signals = fromRun?.signals?.length ? fromRun.signals.slice(0, 2).map((g) => g.text.slice(0, 200)) : x.signals?.slice(0, 2);
    return { ...src, ...(x.snippet ? { snippet: x.snippet } : {}), ...(quote ? { evidence: [quote] } : {}), ...(signals?.length ? { signals } : {}) };
  });
  const live: LiveResearchMeta = {
    runId: run.id,
    depth: (base?.live?.depth ?? run.depth.selected) as LiveDepth,
    webSearch,
    independentGroups: run.independentGroups,
    ...(run.failed.length ? { failed: run.failed.slice(0, 12).map((f) => ({ url: f.url.slice(0, 200), status: f.status.slice(0, 24), reason: clip(f.reason, 160) })) } : {}),
    ...(v ? { checked: { at: now.toISOString(), summary: v.summary, claims: compactClaims(v, valid) } } : {}),
  };
  return { ...answer, markdown, research: { queries: base?.queries ?? run.queries, sources, cited, live } };
}

/** What the page shows when Live Research couldn't run and the question went ahead as a plain web question. */
export function liveFallbackNote(error: string): string {
  return `Live Research didn't run on this computer (${error.replace(/\.$/, "")}), so this was answered without reading web pages.`;
}

const day = (iso?: string) => (iso ? iso.slice(0, 10) : "");

/** The cited sources as a numbered list (title, publisher, dates, link): what Copy and Save add under a Live Research answer. */
export function liveSourcesText(answer: Pick<KeplarAnswer, "research">): string {
  const r = answer.research;
  if (!r?.live) return "";
  const cited = new Set(r.cited);
  const lines = r.sources
    .filter((x) => cited.has(x.n))
    .map((x) => `[${x.n}] ${x.title}. ${[x.publisher ?? x.host, x.publishedAt ? `published ${day(x.publishedAt)}` : "date unknown", x.retrievedAt ? `retrieved ${day(x.retrievedAt)}` : ""].filter(Boolean).join(", ")}. ${x.url}`);
  return lines.length ? `Sources\n${lines.join("\n")}` : "";
}

/** The answer with its sources, for the clipboard (the same shape the desktop app copies). */
export function liveCopyText(answer: Pick<KeplarAnswer, "markdown" | "research">): string {
  const src = liveSourcesText(answer);
  return src ? `${answer.markdown}\n\n${src}` : answer.markdown;
}
