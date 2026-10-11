/**
 * Exact checks for the questions single language models get wrong most often: counting letters and doing arithmetic.
 * These are computed here, deterministically (no model), and handed to the models as a verified fact; the answer page says
 * so. A question that is not clearly one of these returns null and nothing changes.
 */

export type ExactCheck = {
  kind: "letter-count" | "letters" | "vowels" | "arithmetic" | "number" | "conversion";
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

/** "calculated exactly", or, when the shown value had to be rounded (√2, 100/7), say so instead of claiming exactness. */
function how(v: number): string {
  // Compare at 15 significant digits so float noise (0.1 + 0.2 = 0.30000000000000004) still counts as the exact 0.3.
  const exact = Number.isInteger(v) || Number(v.toPrecision(15)) === Number(show(v).replace(/,/g, ""));
  return exact ? "calculated exactly" : "calculated, shown to 12 significant digits";
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
  return { kind: "arithmetic", statement: `${expr.replace(/\s+/g, " ")} = ${show(v)} (${how(v)}).` };
}

// ---- plain-English number questions: whole-question patterns only, so anything else falls through ----

const WHAT = String.raw`(?:what(?:'s|’s| is)\s+|calculate\s+|compute\s+|work out\s+|find\s+)?(?:the\s+)?`;
const NUM = String.raw`(-?\d[\d,]*(?:\.\d+)?)`;
const END = String.raw`\s*[?.!]*$`;
const num = (s: string) => Number(s.replace(/,/g, ""));

/** n! exactly, with BigInt (no rounding), for n up to 100. */
function factorial(n: number): string {
  let f = BigInt(1);
  for (let i = 2; i <= n; i++) f *= BigInt(i);
  return f.toLocaleString("en-US");
}

/** Smallest factor above 1, or null when n is prime. n must be an integer ≥ 2 and ≤ 1e12 (≤ 1e6 trial divisions). */
function smallestFactor(n: number): number | null {
  if (n % 2 === 0) return n === 2 ? null : 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return d;
  return null;
}

function numberWords(p: string): ExactCheck | null {
  // "100 divided by 7", "12 times 4", "3 plus 5", "10 minus 4": operators in words, then the same safe evaluator.
  const ops = new RegExp(`^${WHAT}${NUM}\\s+(divided by|over|multiplied by|times|plus|minus)\\s+${NUM}${END}`, "i").exec(p);
  if (ops) {
    const sym = { "divided by": "/", over: "/", "multiplied by": "*", times: "*", plus: "+", minus: "-" }[ops[2].toLowerCase()]!;
    const toks = tokenize(`${ops[1]}${sym}${ops[3].startsWith("-") ? `(${ops[3]})` : ops[3]}`);
    const v = toks ? evaluate(toks) : null;
    if (v != null) return { kind: "arithmetic", statement: `${ops[1]} ${ops[2].toLowerCase()} ${ops[3]} = ${show(v)} (${how(v)}).` };
  }
  const root = new RegExp(`^${WHAT}(?:square root|sqrt)\\s*(?:of\\s*)?${NUM}${END}`, "i").exec(p);
  if (root && num(root[1]) >= 0) {
    const v = Math.sqrt(num(root[1]));
    return { kind: "arithmetic", statement: `The square root of ${root[1]} = ${show(v)} (${how(v)}).` };
  }
  const pow = new RegExp(`^${WHAT}${NUM}\\s+(squared|cubed)${END}`, "i").exec(p);
  if (pow) {
    const v = num(pow[1]) ** (pow[2].toLowerCase() === "squared" ? 2 : 3);
    if (Number.isFinite(v)) return { kind: "arithmetic", statement: `${pow[1]} ${pow[2].toLowerCase()} = ${show(v)} (${how(v)}).` };
  }
  const fact = new RegExp(`^${WHAT}(?:factorial of\\s+(\\d{1,3})|(\\d{1,3})\\s*(?:!|factorial))${END}`, "i").exec(p);
  if (fact) {
    const n = Number(fact[1] ?? fact[2]);
    if (n <= 100) return { kind: "arithmetic", statement: `${n}! = ${factorial(n)} (calculated exactly).` };
  }
  const prime = /^is\s+(\d[\d,]*)\s+(?:a\s+)?prime(?:\s+number)?\s*[?.!]*$/i.exec(p);
  if (prime) {
    const n = num(prime[1]);
    if (Number.isSafeInteger(n) && n <= 1e12) {
      if (n < 2) return { kind: "number", statement: `${prime[1]} is not a prime number: primes are whole numbers greater than 1 (checked exactly).` };
      const f = smallestFactor(n);
      return { kind: "number", statement: f === null ? `${prime[1]} is a prime number (checked exactly by trial division).` : `${prime[1]} is not a prime number: it is divisible by ${f} (${f} × ${show(n / f)} = ${show(n)}; checked exactly).` };
    }
  }
  const off = new RegExp(`^${WHAT}(\\d+(?:\\.\\d+)?)\\s*%\\s*off\\s*(?:of\\s*)?(\\$)?${NUM}${END}`, "i").exec(p);
  if (off && num(off[1]) <= 100) {
    const price = num(off[3]);
    const v = Math.round(price * (1 - num(off[1]) / 100) * 100) / 100;
    const $ = off[2] ?? "";
    return { kind: "arithmetic", statement: `${off[1]}% off ${$}${off[3]} = ${$}${$ ? v.toFixed(2) : show(v)} (you save ${$}${$ ? (Math.round((price - v) * 100) / 100).toFixed(2) : show(price - v)}; calculated exactly).` };
  }
  const temp = new RegExp(`^(?:convert\\s+|what(?:'s|’s| is)\\s+)?${NUM}\\s*°?\\s*(f|fahrenheit|c|celsius)\\s+(?:to|in|into)\\s+°?\\s*(c|celsius|f|fahrenheit)${END}`, "i").exec(p);
  if (temp) {
    const from = temp[2][0].toLowerCase(), to = temp[3][0].toLowerCase();
    if (from !== to) {
      const t = num(temp[1]);
      const v = from === "f" ? ((t - 32) * 5) / 9 : (t * 9) / 5 + 32;
      return { kind: "conversion", statement: `${temp[1]}°${from.toUpperCase()} = ${show(Math.round(v * 100) / 100)}°${to.toUpperCase()} (converted exactly: ${from === "f" ? "(°F − 32) × 5/9" : "°C × 9/5 + 32"}).` };
    }
  }
  const days = /^how many days (?:are )?(?:there )?in (?:the year )?(\d{4})\s*[?.!]*$/i.exec(p);
  if (days) {
    const y = Number(days[1]);
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return { kind: "number", statement: `${y} has ${leap ? 366 : 365} days (${leap ? "a leap year" : "not a leap year"}; checked exactly with the Gregorian rule).` };
  }
  return null;
}

/** The exact check for this question, or null when it is not clearly a counting, arithmetic or number question. */
export function exactCheck(prompt: string): ExactCheck | null {
  const p = prompt.trim();
  if (!p || p.length > 600 || p.includes("\n")) return null;
  return letters(p) ?? arithmetic(p) ?? numberWords(p);
}

/** Added to the models' prompt: a verified fact they must not contradict. */
export function exactNote(c: ExactCheck): string {
  return `\n\n[Verified by Keplar's exact checker, computed by code and not by a model: ${c.statement} Use this result; do not recount or recompute it.]`;
}
