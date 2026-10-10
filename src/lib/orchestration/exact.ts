/**
 * Exact checks for the questions single language models get wrong most often: counting letters and doing arithmetic.
 * These are computed here, deterministically (no model), and handed to the models as a verified fact; the answer page says
 * so. A question that is not clearly one of these returns null and nothing changes.
 */

export type ExactCheck = {
  kind: "letter-count" | "letters" | "vowels" | "arithmetic";
  /** One plain sentence, safe to show to the user and to give to the models. */
  statement: string;
};

const Q = `["'“”‘’\`]`;

function clean(s: string) {
  return s.trim().replace(/^(?:the )?(?:word|phrase|sentence|text|string|name)\s+/i, "").replace(new RegExp(`^${Q}+|${Q}+$`, "g"), "").trim();
}

const MAX_TEXT = 400;

function countLetter(letter: string, text: string) {
  const l = letter.toLowerCase();
  let n = 0;
  for (const ch of text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")) if (ch === l) n++;
  return n;
}

const times = (n: number) => (n === 1 ? "1 time" : `${n} times`);

/** "How many r's are in strawberry?", "Count the letter e in 'excellence'", "how many letters / vowels in …". */
function letters(p: string): ExactCheck | null {
  const one = new RegExp(`^(?:how many|count|number of)\\b(?:\\s+times)?\\s*(?:does|do|is|are|the)?\\s*(?:the\\s+)?(?:letter\\s+|character\\s+)?${Q}?([a-z])${Q}?(?:'s|’s|s)?\\s*(?:appear(?:s)?|occur(?:s)?|show(?:s)? up|are there|is there|do you find|are)?\\s*(?:in|within|inside|of)\\s+(.+?)\\s*[?.!]*$`, "i").exec(p);
  if (one) {
    const text = clean(one[2]);
    if (text && text.length <= MAX_TEXT && /[a-z]/i.test(text)) {
      const n = countLetter(one[1], text);
      return { kind: "letter-count", statement: `The letter "${one[1].toLowerCase()}" appears ${times(n)} in "${text}" (counted exactly, ignoring case and accents).` };
    }
  }
  const total = new RegExp(`^how many (letters|vowels|consonants)\\s+(?:are there\\s+|are\\s+|does\\s+|do\\s+|is\\s+there\\s+)?(?:in|within|inside)\\s+(.+?)\\s*[?.!]*$`, "i").exec(p);
  if (total) {
    const text = clean(total[2]);
    if (text && text.length <= MAX_TEXT && /[a-z]/i.test(text)) {
      const only = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
      const v = [...only].filter((c) => "aeiou".includes(c)).length;
      const kind = total[1].toLowerCase();
      if (kind === "letters") return { kind: "letters", statement: `"${text}" has ${only.length} letters (counted exactly, letters only).` };
      if (kind === "vowels") return { kind: "vowels", statement: `"${text}" has ${v} vowels (a, e, i, o, u; counted exactly).` };
      return { kind: "vowels", statement: `"${text}" has ${only.length - v} consonants (letters other than a, e, i, o, u; counted exactly).` };
    }
  }
  return null;
}

// ---- arithmetic: a tiny, safe expression evaluator (numbers, + - * / ^, parentheses, %); never eval ----

type Tok = { t: "n"; v: number } | { t: "o"; v: string };

function tokenize(src: string): Tok[] | null {
  const toks: Tok[] = [];
  const s = src.replace(/(\d),(?=\d{3}(?!\d))/g, "$1").replace(/[×x✕]/gi, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const v = Number(s.slice(i, j));
      if (!Number.isFinite(v) || (s.slice(i, j).match(/\./g) ?? []).length > 1) return null;
      toks.push({ t: "n", v });
      i = j;
    } else if ("+-*/^()%".includes(c)) {
      toks.push({ t: "o", v: c });
      i++;
    } else return null;
  }
  return toks;
}

function evaluate(toks: Tok[]): number | null {
  let pos = 0;
  const peek = () => toks[pos];
  const op = (v: string) => { const t = peek(); if (t && t.t === "o" && t.v === v) { pos++; return true; } return false; };
  function primary(): number {
    if (op("(")) { const v = expr(); if (!op(")")) throw new Error("paren"); return v; }
    const t = peek();
    if (t && t.t === "n") { pos++; return t.v; }
    throw new Error("number");
  }
  function unary(): number {
    if (op("-")) return -unary();
    if (op("+")) return unary();
    return power();
  }
  function power(): number {
    let b = primary();
    while (op("%")) b /= 100;
    if (op("^")) return Math.pow(b, unary());
    return b;
  }
  function term(): number {
    let v = unary();
    for (;;) {
      if (op("*")) v *= unary();
      else if (op("/")) { const d = unary(); if (d === 0) throw new Error("zero"); v /= d; }
      else return v;
    }
  }
  function expr(): number {
    let v = term();
    for (;;) {
      if (op("+")) v += term();
      else if (op("-")) v -= term();
      else return v;
    }
  }
  try {
    const v = expr();
    if (pos !== toks.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

function show(v: number) {
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toLocaleString("en-US");
  const r = Number(v.toPrecision(12));
  return Math.abs(r) >= 1e15 || (Math.abs(r) < 1e-6 && r !== 0) ? r.toExponential(8) : String(r);
}

function arithmetic(p: string): ExactCheck | null {
  const pct = /^(?:what(?:'s|’s| is)\s+)?(\d+(?:\.\d+)?)\s*%\s*of\s*(\d[\d,]*(?:\.\d+)?)\s*[?.!]*$/i.exec(p.trim());
  if (pct) {
    const v = (Number(pct[1]) / 100) * Number(pct[2].replace(/,/g, ""));
    if (Number.isFinite(v)) return { kind: "arithmetic", statement: `${pct[1]}% of ${pct[2]} = ${show(v)} (calculated exactly).` };
  }
  const m = /^(?:what(?:'s|’s| is)|calculate|compute|evaluate|solve|work out|how much is|find)?\s*([0-9(][0-9.,+\-*/x×÷^()%\s✕]*[0-9)%])\s*(?:=\s*)?[?.!]*$/i.exec(p.trim());
  if (!m) return null;
  const expr = m[1].trim();
  if (!/[+\-*/x×÷^✕]/i.test(expr.replace(/^-/, "")) && !/%/.test(expr)) return null;
  if (expr.length > 120 || !/\d/.test(expr)) return null;
  const toks = tokenize(expr);
  const v = toks ? evaluate(toks) : null;
  if (v == null) return null;
  return { kind: "arithmetic", statement: `${expr.replace(/\s+/g, " ")} = ${show(v)} (calculated exactly).` };
}

/** The exact check for this question, or null when it is not clearly a counting or arithmetic question. */
export function exactCheck(prompt: string): ExactCheck | null {
  const p = prompt.trim();
  if (!p || p.length > 600 || p.includes("\n")) return null;
  return letters(p) ?? arithmetic(p);
}

/** Added to the models' prompt: a verified fact they must not contradict. */
export function exactNote(c: ExactCheck): string {
  return `\n\n[Verified by Keplar's exact checker, computed by code and not by a model: ${c.statement} Use this result; do not recount or recompute it.]`;
}
