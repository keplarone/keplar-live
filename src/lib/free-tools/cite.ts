/**
 * Citation formatter: APA 7, MLA 9, Chicago 18 author-date and Harvard (Cite Them Right), for books, journal articles,
 * web pages and reports. Pure functions that run in the browser; nothing is sent anywhere. Rules are applied as written
 * in each manual for the common case; unusual sources still need the style guide.
 */
export type SourceType = "book" | "article" | "web" | "report";
export type Style = "apa" | "mla" | "chicago" | "harvard";
export type Source = {
  type: SourceType;
  /** One author per line: "Last, First Middle" or an organization name without a comma. */
  authors: string;
  title: string;
  year: string;
  /** Journal, website or series name. */
  container?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  /** ISO dates. */
  published?: string;
  accessed?: string;
  /** Page for the in-text citation. */
  page?: string;
};
export type Citation = { reference: string; inText: string; missing: string[] };

type Author = { org: string } | { last: string; first: string };

export function parseAuthors(text: string): Author[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(",");
      if (i < 0) return { org: l };
      return { last: l.slice(0, i).trim(), first: l.slice(i + 1).trim() };
    });
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MLA_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const parseDate = (iso?: string) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { y: m[1], mo: Number(m[2]) - 1, d: Number(m[3]) } : null;
};
const longDate = (iso?: string) => { const d = parseDate(iso); return d ? `${MONTHS[d.mo]} ${d.d}, ${d.y}` : ""; };
const dayMonthYear = (iso?: string, short = false) => { const d = parseDate(iso); return d ? `${d.d} ${(short ? MLA_MONTHS : MONTHS)[d.mo]} ${d.y}` : ""; };
const initials = (first: string, spaced: boolean) => first.split(/[\s-]+/).filter(Boolean).map((p) => `${p[0].toUpperCase()}.`).join(spaced ? " " : "");
const dash = (pages?: string) => (pages ?? "").replace(/\s*-\s*/g, "–");
const ital = (s: string) => (s ? `*${s}*` : "");
const end = (s: string) => (s && !/[.?!]$/.test(s) ? `${s}.` : s);
const doiUrl = (s: Source) => (s.doi ? `https://doi.org/${s.doi.replace(/^https?:\/\/doi\.org\//, "")}` : s.url ?? "");

function names(authors: Author[], style: Style): string {
  if (!authors.length) return "";
  const one = (a: Author, i: number) => {
    if ("org" in a) return a.org;
    if (style === "apa") return `${a.last}, ${initials(a.first, true)}`;
    if (style === "harvard") return `${a.last}, ${initials(a.first, false)}`;
    // MLA and Chicago invert only the first author.
    return i === 0 ? `${a.last}, ${a.first}` : `${a.first} ${a.last}`;
  };
  const list = authors.map(one);
  if (style === "apa") {
    if (list.length === 1) return list[0];
    if (list.length <= 20) return `${list.slice(0, -1).join(", ")}, & ${list.at(-1)}`;
    return `${list.slice(0, 19).join(", ")}, ... ${list.at(-1)}`;
  }
  if (style === "mla") {
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]}, and ${list[1]}`;
    return `${list[0]}, et al`;
  }
  if (style === "chicago") {
    if (list.length === 1) return list[0];
    if (list.length <= 3) return `${list.slice(0, -1).join(", ")}, and ${list.at(-1)}`;
    return `${list[0]}, et al`;
  }
  if (list.length === 1) return list[0];
  if (list.length <= 3) return `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
  return `${list[0]} et al.`;
}

function inTextNames(authors: Author[], style: Style, fallback: string): string {
  const last = (a: Author) => ("org" in a ? a.org : a.last);
  if (!authors.length) return fallback;
  const l = authors.map(last);
  if (style === "apa") return l.length === 1 ? l[0] : l.length === 2 ? `${l[0]} & ${l[1]}` : `${l[0]} et al.`;
  if (style === "harvard") return l.length === 1 ? l[0] : l.length <= 3 ? `${l.slice(0, -1).join(", ")} and ${l.at(-1)}` : `${l[0]} et al.`;
  // MLA, Chicago
  return l.length === 1 ? l[0] : l.length === 2 ? `${l[0]} and ${l[1]}` : `${l[0]} et al.`;
}

export function formatCitation(src: Source, style: Style): Citation {
  const a = parseAuthors(src.authors);
  const missing: string[] = [];
  const need = (ok: unknown, what: string) => { if (!ok) missing.push(what); };
  const title = src.title.trim();
  const year = src.year.trim() || "n.d.";
  need(src.year.trim(), "year");
  const container = (src.container ?? "").trim();
  const publisher = (src.publisher ?? "").trim();
  const link = doiUrl(src);
  const t = src.type;
  let reference = "";
  let inText = "";
  const nd = year === "n.d.";
  if (style === "apa") {
    const who = names(a, "apa") || (t === "web" ? container : publisher) || title;
    const date = t === "web" && src.published ? `(${parseDate(src.published)!.y}, ${MONTHS[parseDate(src.published)!.mo]} ${parseDate(src.published)!.d})` : `(${year})`;
    if (t === "book") { need(publisher, "publisher"); reference = `${end(who)} ${date}. ${ital(title)}. ${end(publisher)}${link ? ` ${link}` : ""}`; }
    else if (t === "article") { need(container, "journal"); need(src.volume, "volume"); reference = `${end(who)} ${date}. ${end(title)} ${ital(container)}${src.volume ? `, ${ital(src.volume)}` : ""}${src.issue ? `(${src.issue})` : ""}${src.pages ? `, ${dash(src.pages)}` : ""}.${link ? ` ${link}` : ""}`; }
    else if (t === "web") { need(src.url, "URL"); const site = a.length && container ? ` ${end(container)}` : ""; reference = `${end(who)} ${date}. ${ital(title)}.${site}${src.url ? ` ${src.url}` : ""}`; }
    else { reference = `${end(who)} ${date}. ${ital(title)}${src.volume ? ` (Report No. ${src.volume})` : ""}. ${publisher && publisher !== who ? end(publisher) : ""}${link ? ` ${link}` : ""}`.replace(/\s+/g, " ").trim(); }
    inText = `(${inTextNames(a, "apa", t === "web" ? container || title : publisher || title)}, ${nd ? "n.d." : year}${src.page ? `, p. ${src.page}` : ""})`;
  } else if (style === "mla") {
    const who = names(a, "mla");
    const pub = src.published ? dayMonthYear(src.published, true) : year;
    if (t === "book") { need(publisher, "publisher"); reference = `${who ? `${end(who)} ` : ""}${ital(title)}. ${publisher ? `${publisher}, ` : ""}${year}.`; }
    else if (t === "article") { need(container, "journal"); reference = `${who ? `${end(who)} ` : ""}"${end(title)}" ${ital(container)}${src.volume ? `, vol. ${src.volume}` : ""}${src.issue ? `, no. ${src.issue}` : ""}, ${year}${src.pages ? `, pp. ${dash(src.pages)}` : ""}.${link ? ` ${link}.` : ""}`; }
    else if (t === "web") { need(src.url, "URL"); need(container, "website name"); reference = `${who ? `${end(who)} ` : ""}"${end(title)}" ${ital(container)}, ${pub}${src.url ? `, ${src.url.replace(/^https?:\/\//, "")}` : ""}.${src.accessed ? ` Accessed ${dayMonthYear(src.accessed, true)}.` : ""}`; }
    else { reference = `${who ? `${end(who)} ` : ""}${ital(title)}. ${publisher ? `${publisher}, ` : ""}${year}.${link ? ` ${link}.` : ""}`; }
    inText = `(${inTextNames(a, "mla", title.split(":")[0])}${src.page ? ` ${src.page}` : ""})`;
  } else if (style === "chicago") {
    const who = names(a, "chicago") || (t === "web" ? container : publisher) || title;
    if (t === "book") { need(publisher, "publisher"); reference = `${end(who)} ${year}. ${ital(title)}. ${end(publisher)}${link ? ` ${link}.` : ""}`; }
    else if (t === "article") { need(container, "journal"); reference = `${end(who)} ${year}. "${end(title)}" ${ital(container)}${src.volume ? ` ${src.volume}` : ""}${src.issue ? ` (${src.issue})` : ""}${src.pages ? `: ${dash(src.pages)}` : ""}.${link ? ` ${link}.` : ""}`; }
    else if (t === "web") { need(src.url, "URL"); reference = `${end(who)} ${year}. "${end(title)}" ${container && container !== who ? `${end(container)} ` : ""}${src.published ? `${longDate(src.published)}. ` : src.accessed ? `Accessed ${longDate(src.accessed)}. ` : ""}${src.url ?? ""}`.trim() + (src.url ? "." : ""); }
    else { reference = `${end(who)} ${year}. ${ital(title)}. ${publisher && publisher !== who ? `${end(publisher)} ` : ""}${link ? `${link}.` : ""}`.trim(); }
    inText = `(${inTextNames(a, "chicago", t === "web" ? container || title : publisher || title)} ${nd ? "n.d." : year}${src.page ? `, ${src.page}` : ""})`;
  } else {
    const who = names(a, "harvard") || (t === "web" ? container : publisher) || title;
    const accessed = src.accessed ? ` (Accessed: ${dayMonthYear(src.accessed)})` : "";
    if (t === "book") { need(publisher, "publisher"); reference = `${who} (${year}) ${ital(title)}. ${end(publisher)}`; }
    else if (t === "article") { need(container, "journal"); reference = `${who} (${year}) '${title}', ${ital(container)}${src.volume ? `, ${src.volume}` : ""}${src.issue ? `(${src.issue})` : ""}${src.pages ? `, pp. ${dash(src.pages)}` : ""}.${src.doi ? ` doi:${src.doi.replace(/^https?:\/\/doi\.org\//, "")}.` : ""}`; }
    else if (t === "web") { need(src.url, "URL"); need(src.accessed, "date accessed"); reference = `${who} (${year}) ${ital(title)}. Available at: ${src.url ?? ""}${accessed}.`; }
    else { reference = `${who} (${year}) ${ital(title)}. ${publisher && publisher !== who ? end(publisher) : ""}${src.url ? ` Available at: ${src.url}${accessed}.` : ""}`.replace(/\s+/g, " ").trim(); }
    inText = `(${inTextNames(a, "harvard", t === "web" ? container || title : publisher || title)}, ${nd ? "no date" : year}${src.page ? `, p. ${src.page}` : ""})`;
  }
  return { reference: reference.replace(/\s+/g, " ").replace(/\s+\./g, ".").trim(), inText, missing };
}

/** The reference without Markdown italics, for copying into a document. */
export const plainReference = (c: Citation) => c.reference.replace(/\*/g, "");
