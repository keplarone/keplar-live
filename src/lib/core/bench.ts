/**
 * Keplar Core benchmark: small, fixed, automatically scored. Six categories (reasoning, math, coding, factual, long-context, multi-step).
 * Each item has a deterministic scorer, so the same set serves the offline eval in tests, the scheduled eval in the self-development
 * pipeline, and the before/after run in scripts/core-eval.mts. Answers are graded on the final answer only, never on style.
 */
import { runJs } from "./sandbox";
import { codeBlocks } from "./tools";

export type BenchCategory = "reasoning" | "math" | "coding" | "factual" | "long-context" | "multi-step";
export type BenchCheck =
  | { kind: "number"; value: number; tol?: number }
  | { kind: "numbers"; values: number[]; tol?: number }
  | { kind: "includes"; any?: string[]; all?: string[]; none?: string[] }
  | { kind: "code"; fn: string; tests: [unknown[], unknown][] };
export type BenchItem = { id: string; category: BenchCategory; prompt: string; check: BenchCheck; docs?: { name: string; text: string; source: "link" }[] };

/** Integers must match exactly; other values within 0.1% unless the item sets its own tolerance. */
const near = (a: number, b: number, tol?: number) => { const t = tol ?? (Number.isInteger(b) ? 0 : 0.001); return b === 0 ? Math.abs(a) < 1e-9 : Math.abs(a - b) / Math.abs(b) <= t + 1e-12; };
/** Numbers written in the text (commas, currency, percentages and simple fractions handled). */
export function numbersOf(text: string): number[] {
  const out: number[] = [];
  const t = text.replace(/(\d),(?=\d{3}\b)/g, "$1");
  for (const m of t.matchAll(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)|-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)) {
    if (m[1] && m[2]) { const d = Number(m[2]); if (d) out.push(Number(m[1]) / d); out.push(Number(m[1]), d); }
    else out.push(Number(m[0]));
  }
  return out.filter(Number.isFinite);
}
/** The answer's lead: the "final answer" line when there is one, else the first 400 characters (Keplar answers lead with the result). */
function lead(text: string): string {
  const m = text.match(/(?:final answer|answer|result)\s*[:\-–]\s*([^\n]{1,300})/i);
  return m ? m[1]! : text.slice(0, 400);
}

export async function scoreItem(item: BenchItem, answer: string): Promise<{ score: number; note: string }> {
  const c = item.check;
  const text = answer || "";
  if (c.kind === "number") {
    const inLead = numbersOf(lead(text)).some((n) => near(n, c.value, c.tol));
    if (inLead) return { score: 1, note: "correct" };
    // A correct number that only appears later counts half: the answer should lead with it.
    return numbersOf(text).some((n) => near(n, c.value, c.tol)) ? { score: 0.5, note: "correct but not leading" } : { score: 0, note: "wrong number" };
  }
  if (c.kind === "numbers") {
    const ns = numbersOf(text);
    const hit = c.values.filter((v) => ns.some((n) => near(n, v, c.tol))).length;
    return { score: hit / c.values.length, note: `${hit}/${c.values.length} values` };
  }
  if (c.kind === "includes") {
    const low = text.toLowerCase();
    if (c.none?.some((w) => low.includes(w.toLowerCase()))) return { score: 0, note: "contains a wrong answer" };
    if (c.all && !c.all.every((w) => low.includes(w.toLowerCase()))) return { score: 0, note: "missing required term" };
    if (c.any && !c.any.some((w) => low.includes(w.toLowerCase()))) return { score: 0, note: "missing answer" };
    return { score: 1, note: "correct" };
  }
  // Code: take the longest JavaScript block (or the whole answer), run the hidden tests in the sandbox.
  const blocks = codeBlocks(text).filter((b) => /^(js|javascript|ts|typescript|)$/i.test(b.lang));
  const code = (blocks.sort((a, b) => b.code.length - a.code.length)[0]?.code ?? "").replace(/:\s*(number|string|boolean|unknown|any)(\[\])?(?=[,)=;])/g, "");
  if (!code.includes(c.fn)) return { score: 0, note: "no function" };
  const harness = `${code}\nconst __t = ${JSON.stringify(c.tests)}; let __p = 0; for (const [a, e] of __t) { try { if (JSON.stringify(${c.fn}(...a)) === JSON.stringify(e)) __p++; } catch {} } console.log("PASSED " + __p + "/" + __t.length);`;
  const r = await runJs(harness, 2000);
  const m = r.logs.match(/PASSED (\d+)\/(\d+)/);
  if (!m) return { score: 0, note: r.error ? `error: ${r.error.slice(0, 80)}` : "did not run" };
  return { score: Number(m[1]) / Number(m[2]), note: `${m[1]}/${m[2]} tests` };
}

/** A long public page with facts scattered past the first 24,000 characters (the Free attachment window). */
function longDoc(seed: number, facts: string[]): string {
  const words = ["harbour", "ledger", "quarterly", "inventory", "freight", "warehouse", "audit", "schedule", "vendor", "routing", "pallet", "invoice", "customs", "berth", "manifest", "tariff"];
  const para = (i: number) => Array.from({ length: 70 }, (_, k) => words[(i * 7 + k * 3 + seed) % words.length]).join(" ") + ".";
  const parts: string[] = [];
  for (let i = 0; i < 90; i++) {
    parts.push(`Section ${i + 1}. ${para(i)}`);
    const f = facts.find((_, j) => i === 40 + j * 17);
    if (f) parts.push(f);
  }
  return parts.join("\n\n");
}

export const BENCH: BenchItem[] = [
  // Reasoning
  { id: "r1", category: "reasoning", prompt: "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost, in cents?", check: { kind: "number", value: 5 } },
  { id: "r2", category: "reasoning", prompt: "Five machines make five widgets in five minutes. How many minutes do 100 machines take to make 100 widgets?", check: { kind: "number", value: 5 } },
  { id: "r3", category: "reasoning", prompt: "Anna is taller than Ben. Ben is taller than Cara. Dev is shorter than Cara. Who is the second shortest? Answer with the name.", check: { kind: "includes", any: ["Cara"], none: ["is Ben", "is Dev", "Answer: Ben", "Answer: Dev"] } },
  { id: "r4", category: "reasoning", prompt: "A lily pad patch doubles in size every day and covers the whole lake on day 48. On which day did it cover half the lake?", check: { kind: "number", value: 47 } },
  { id: "r5", category: "reasoning", prompt: "If all bloops are razzies and some razzies are lazzies, does it follow that some bloops are definitely lazzies? Answer yes or no first, then explain briefly.", check: { kind: "includes", any: ["no"], none: ["yes, it follows", "yes. ", "**yes**"] } },
  // Math
  { id: "m1", category: "math", prompt: "What is the sum of all positive integers below 1000 that are multiples of 3 or 5?", check: { kind: "number", value: 233168 } },
  { id: "m2", category: "math", prompt: "How many trailing zeros does 125! (125 factorial) have?", check: { kind: "number", value: 31 } },
  { id: "m3", category: "math", prompt: "A loan of $12,000 has 6% annual interest compounded monthly. What is the balance after 3 years with no payments? Round to the cent.", check: { kind: "number", value: 14360.17, tol: 0.0005 } },
  { id: "m4", category: "math", prompt: "What is the 30th Fibonacci number, with F(1) = 1 and F(2) = 1?", check: { kind: "number", value: 832040 } },
  { id: "m5", category: "math", prompt: "How many ways can you choose 4 people from 13 when two specific people refuse to be chosen together?", check: { kind: "number", value: 660 } },
  // Coding
  { id: "c1", category: "coding", prompt: "Write a JavaScript function `romanToInt(s)` that converts a Roman numeral string to an integer. Reply with the code in one ```js block.", check: { kind: "code", fn: "romanToInt", tests: [[["III"], 3], [["LVIII"], 58], [["MCMXCIV"], 1994], [["IV"], 4], [["MMXXVI"], 2026]] } },
  { id: "c2", category: "coding", prompt: "Write a JavaScript function `mergeIntervals(list)` that merges overlapping [start, end] intervals and returns them sorted by start. Touching intervals like [1,2] and [2,3] merge. Reply with code in one ```js block.", check: { kind: "code", fn: "mergeIntervals", tests: [[[[[1, 3], [2, 6], [8, 10], [15, 18]]], [[1, 6], [8, 10], [15, 18]]], [[[[1, 4], [4, 5]]], [[1, 5]]], [[[[5, 7], [1, 2]]], [[1, 2], [5, 7]]], [[[]], []]] } },
  { id: "c3", category: "coding", prompt: "Write a JavaScript function `isValidBrackets(s)` returning true when every (, [ and { is closed in the right order. Other characters are ignored. Reply with code in one ```js block.", check: { kind: "code", fn: "isValidBrackets", tests: [[["()[]{}"], true], [["(]"], false], [["([{}])"], true], [["a(b)c]"], false], [[""], true], [["(("], false]] } },
  { id: "c4", category: "coding", prompt: "Write a JavaScript function `lcsLength(a, b)` returning the length of the longest common subsequence of two strings. Reply with code in one ```js block.", check: { kind: "code", fn: "lcsLength", tests: [[["abcde", "ace"], 3], [["abc", "def"], 0], [["AGGTAB", "GXTXAYB"], 4], [["", "abc"], 0]] } },
  { id: "c5", category: "coding", prompt: "Write a JavaScript function `nthPrime(n)` returning the nth prime (nthPrime(1) = 2). It must handle n up to 10000 quickly. Reply with code in one ```js block.", check: { kind: "code", fn: "nthPrime", tests: [[[1], 2], [[6], 13], [[100], 541], [[10000], 104729]] } },
  // Factual (stable facts)
  { id: "f1", category: "factual", prompt: "Which element has the atomic number 74?", check: { kind: "includes", any: ["tungsten", "wolfram"] } },
  { id: "f2", category: "factual", prompt: "In what year did the Treaty of Westphalia get signed?", check: { kind: "number", value: 1648 } },
  { id: "f3", category: "factual", prompt: "What is the capital of Burkina Faso?", check: { kind: "includes", any: ["ouagadougou"] } },
  { id: "f4", category: "factual", prompt: "Who wrote the novel 'The Master and Margarita'?", check: { kind: "includes", any: ["bulgakov"] } },
  { id: "f5", category: "factual", prompt: "What is the speed of light in vacuum in metres per second, exactly?", check: { kind: "number", value: 299792458, tol: 0 } },
  // Long context: the facts sit past the first 24,000 characters of a public page.
  { id: "l1", category: "long-context", prompt: "According to the attached page, what is the berth number assigned to the vessel Calloway Star?", docs: [{ name: "port-operations-log", source: "link", text: longDoc(1, ["Note: the vessel Calloway Star is assigned to berth 37 for the winter schedule.", "Note: the vessel Merrow Dawn moved to berth 12."]) }], check: { kind: "number", value: 37 } },
  { id: "l2", category: "long-context", prompt: "From the attached page: what was the customs hold fee per pallet, and how many pallets were held? Give the total fee.", docs: [{ name: "customs-ledger", source: "link", text: longDoc(2, ["Audit finding: the customs hold fee was 46 dollars per pallet.", "Audit finding: 28 pallets were held at the eastern gate."]) }], check: { kind: "number", value: 1288 } },
  { id: "l3", category: "long-context", prompt: "Per the attached page, which vendor code was flagged for duplicate invoices?", docs: [{ name: "vendor-audit", source: "link", text: longDoc(3, ["Finding: vendor code VX-4471 was flagged for duplicate invoices in March.", "Finding: vendor code QR-1180 passed review."]) }], check: { kind: "includes", any: ["VX-4471"], none: ["QR-1180 was flagged"] } },
  { id: "l4", category: "long-context", prompt: "Using the attached page, how many days late was the Halden shipment, given its promised and actual arrival days?", docs: [{ name: "freight-schedule", source: "link", text: longDoc(4, ["Schedule: the Halden shipment was promised for day 112 of the year.", "Schedule: the Halden shipment actually arrived on day 131."]) }], check: { kind: "number", value: 19 } },
  // Multi-step
  { id: "s1", category: "multi-step", prompt: "A shop buys 240 units at $3.50 each, sells 85% of them at $6.00 and the rest at $2.00. What is the profit in dollars?", check: { kind: "number", value: 456 } },
  { id: "s2", category: "multi-step", prompt: "A train leaves at 09:40 and travels 315 km at 90 km/h, stops for 25 minutes, then travels 120 km at 80 km/h. At what time does it arrive? Answer as HH:MM.", check: { kind: "includes", any: ["15:05", "3:05 pm", "3:05 p.m."], none: ["14:45"] } },
  { id: "s3", category: "multi-step", prompt: "A recipe for 6 people uses 450 g of flour and 3 eggs. For 14 people, how many grams of flour, and how many eggs if you round eggs up to whole eggs?", check: { kind: "numbers", values: [1050, 7] } },
  { id: "s4", category: "multi-step", prompt: "A tank holds 1,200 litres. Pipe A fills it in 6 hours, pipe B in 4 hours, and a drain empties it in 12 hours. With all three open from empty, how many hours until it is full?", check: { kind: "number", value: 3 } },
  { id: "s5", category: "multi-step", prompt: "Salary is $84,000. Tax is 0% on the first $12,000, 20% on the next $38,000 and 40% above that. What is the take-home pay, and the effective tax rate as a percentage to one decimal?", check: { kind: "numbers", values: [62800, 25.2] } },
];

export const BENCH_CATEGORIES: BenchCategory[] = ["reasoning", "math", "coding", "factual", "long-context", "multi-step"];
export type BenchResult = { id: string; category: BenchCategory; score: number; note: string; ms: number; calls?: number; /** How Core ran it (depth, rounds), and the start of the answer, for auditing a score. */ ran?: string; excerpt?: string };
export function summarize(results: BenchResult[]) {
  const by: Record<string, { n: number; score: number }> = {};
  for (const r of results) { const b = (by[r.category] ??= { n: 0, score: 0 }); b.n++; b.score += r.score; }
  const overall = results.length ? results.reduce((a, r) => a + r.score, 0) / results.length : 0;
  return { overall, byCategory: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.score / v.n])), n: results.length };
}
