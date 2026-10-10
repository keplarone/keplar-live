import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { maskMath, unmaskMath } from "../src/lib/math/extract";
import { renderTex } from "../src/lib/math/katex";
import { healMarkdown } from "../src/lib/typing";
import { SYSTEM_PROMPT } from "../src/lib/orchestration/providers/shared";
import { SYNTH_SYSTEM_PROMPT } from "../src/lib/orchestration/live-synthesizer";
import { CSP } from "../src/lib/security/headers";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const tex = (s: string, streaming = false) => maskMath(s, streaming).items.map((i) => `${i.display ? "D" : "I"}:${i.tex}`);

test("math delimiters: \\( \\), \\[ \\], $$ $$ and sensible $…$", () => {
  assert.deepEqual(tex("Solve \\(7x + 2 = 16\\) and \\(\\frac{17}{12}\\)."), ["I:7x + 2 = 16", "I:\\frac{17}{12}"]);
  assert.deepEqual(tex("so\n\\[\nx = \\frac{-b}{2a}\n\\]\ndone"), ["D:x = \\frac{-b}{2a}"]);
  assert.deepEqual(tex("$$a^2 + b^2 = c^2$$"), ["D:a^2 + b^2 = c^2"]);
  assert.deepEqual(tex("Let $x_1$ and $y$ be reals, then $x_1+y$."), ["I:x_1", "I:y", "I:x_1+y"]);
  assert.deepEqual(tex("$$\n\\begin{aligned}\n- a &= 1 \\\\\n1. b &= 2\n\\end{aligned}\n$$"), ["D:\\begin{aligned}\n- a &= 1 \\\\\n1. b &= 2\n\\end{aligned}"]);
});

test("currency, escapes and code are never math", () => {
  for (const s of ["It costs $5.", "between $5 and $10 total", "$5-$10 range", "Pay $20 now or $30 later, $x is fine", "tickets are US$1,000 each", "price: \\$5 and \\$6", "a lone $ sign", "$ 5 $"]) {
    assert.deepEqual(tex(s).filter((t) => !t.startsWith("I:x")), [], s);
  }
  assert.equal(unmaskMath(maskMath("price: \\$5 and \\$6").text, []), "price: $5 and $6");
  const code = "```\n$$x$$ and \\(y\\) and $a$ and $b$\n```\nafter `\\(z\\)` and `$q$ $r$`";
  const m = maskMath(code);
  assert.equal(m.items.length, 0);
  assert.equal(m.text, code);
  // an unclosed fence stays code to the end
  assert.equal(maskMath("```py\nx = $y$ \\(z\\)").items.length, 0);
});

test("math is masked so Markdown never sees its _ * | or line-leading markers, and unmask restores the source", () => {
  const src = "| a | b |\n|---|---|\n| \\(|x|\\) | $a_1 * b_2$ |\n\nthen \\(a_b * c_d\\) end";
  const m = maskMath(src);
  assert.equal(m.items.length, 3);
  assert.doesNotMatch(m.text, /a_1|\\\(/);
  assert.equal(unmaskMath(m.text, m.items), src);
});

test("streaming: an open formula is held back until it closes (no raw LaTeX flash), finished ones stay", () => {
  for (const [partial, shown] of [
    ["The value is \\(\\frac{17", "The value is"],
    ["Then \\[ x = 1 +", "Then"],
    ["so $$a^2 +", "so"],
    ["let $x_1 +", "let"],
  ] as const) {
    const m = maskMath(partial, true);
    assert.equal(m.pending, true, partial);
    assert.equal(m.text, shown);
  }
  // currency mid-stream is plain text, not a held formula
  assert.equal(maskMath("it costs $5 and rising", true).pending, false);
  assert.equal(maskMath("it costs $5 and rising", true).text, "it costs $5 and rising");
  // not streaming: the same unfinished text is simply text
  assert.equal(maskMath("The value is \\(\\frac{17", false).pending, false);
  assert.equal(healMarkdown("Then \\(a_1 * b\\) and \\(x_"), "Then \\(a_1 * b\\) and");
  assert.equal(healMarkdown("A \\[ x = [1, 2"), "A");
  assert.equal(healMarkdown("see \\(a_1 * b\\) and **bol"), "see \\(a_1 * b\\) and **bol**");
});

test("KaTeX renders safely: trust off, escaped output, bounded, errors fall back to source", () => {
  const ok = renderTex("\\frac{17}{12}", false);
  assert.ok(ok && ok.includes("katex") && ok.includes('encoding="application/x-tex"') && ok.includes("\\frac{17}{12}"));
  const disp = renderTex("x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}", true);
  assert.ok(disp?.includes("katex-display"));
  // no HTML injection: markup in the formula is data, links/URLs/HTML escapes are refused
  const inj = renderTex("\\text{<img src=x onerror=alert(1)><script>alert(2)</script>}", false);
  assert.ok(inj && !/<img|<script/i.test(inj));
  for (const bad of ["\\href{javascript:alert(1)}{x}", "\\url{http://evil.test}", "\\includegraphics{http://evil.test/x.png}", "\\htmlClass{a}{x}", "\\frac{1", "\\undefinedcommand{x}"]) {
    assert.equal(renderTex(bad, false), null, bad);
  }
  assert.equal(renderTex("x".repeat(5000), false), null);
  // macro bombs are cut off rather than hanging the page
  assert.equal(renderTex("\\def\\a{\\a\\a}\\a", false), null);
});

test("models are told one delimiter convention, in every model prompt and the synthesizer", () => {
  for (const p of [SYSTEM_PROMPT, SYNTH_SYSTEM_PROMPT]) {
    assert.ok(p.includes("\\( ... \\)") && p.includes("$$ ... $$"), p.slice(0, 40));
    assert.match(p, /never bare \$\.\.\.\$/);
  }
});

test("self-hosted: no CDN, CSP already limits fonts/styles to our origin; copy gives LaTeX; scroll and colours are wired", () => {
  assert.match(CSP, /font-src 'self' data:/);
  assert.doesNotMatch(CSP, /jsdelivr|cdnjs|unpkg/);
  for (const f of ["src/components/app-ui/math-loader.ts", "src/components/app-ui/MathSpan.tsx", "src/components/app-ui/Markdown.tsx", "src/lib/math/katex.ts"]) {
    assert.doesNotMatch(read(f), /https?:\/\/(cdn|unpkg|cdnjs|fonts)\./i, f);
  }
  assert.match(read("src/components/app-ui/math-loader.ts"), /import "katex\/dist\/katex\.min\.css"/);
  assert.match(read("src/components/app-ui/math-copy.ts"), /application\/x-tex/);
  assert.match(read("src/components/app-ui/math-copy.ts"), /setData\("text\/plain"/);
  const css = read("src/components/app-ui/Markdown.module.css");
  assert.match(css, /\.mathDisplay \{[^}]*overflow-x: auto/);
  assert.match(css, /\.md :global\(\.katex\) \{[^}]*color: inherit/);
  const md = read("src/components/app-ui/Markdown.tsx");
  assert.match(md, /maskMath\(source, streaming\)/);
  assert.doesNotMatch(md, /dangerouslySetInnerHTML/); // only MathSpan injects KaTeX's own escaped output
  assert.match(read("src/components/app-ui/MathSpan.tsx"), /__html: html/);
});
