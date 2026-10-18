/**
 * Model call for the site builder: OpenRouter streaming chat completions, file-block output format.
 * Free plan: $0 `:free` models only. Paid plans: the model chain from limits.ts (stepped down by the circuit breaker).
 * The model's cost comes from OpenRouter's `usage.cost`; when it is missing we price the token counts from the table.
 */
import { briefToPrompt, type SiteBrief } from "./brief";
import { getDirection } from "./design";
import { stripDesignSystem } from "./design-css";
import { costUsd, modelChain, tokensOf, type BuilderModel } from "./limits";
import { featureDoc } from "./features/catalog";
import type { BreakerLevel } from "@/lib/create/platform/breaker";
import type { PlanId } from "@/lib/create/platform/plans";

export const OPENROUTER_BASE = () => (process.env.KEPLAR_OPENROUTER_BASE || "https://openrouter.ai/api/v1").replace(/\/$/, "");

/** Free calls must not fall through to a paid host. The meter trusts the requested slug, not the model that answered. */
export const providerRouting = (free: boolean) => (free ? { allow_fallbacks: false } : { allow_fallbacks: true, data_collection: "deny" as const });

const FORMAT = `OUTPUT FORMAT. Reply with exactly this and nothing else (no markdown fences, no commentary):
<summary>One or two plain sentences saying what you built or changed.</summary>
<file path="index.html">
...the whole file...
</file>
<file path="styles.css">
...the whole file...
</file>`;

const DS_REFERENCE = `THE DESIGN SYSTEM IS ALREADY WRITTEN. Keplar prepends it to styles.css (palette, fonts, fluid type, spacing, layout primitives, focus, reduced-motion) and adds the font links to every page. Do NOT define :root colors or fonts, do NOT link fonts, do NOT write resets. Your styles.css contains ONLY the composition that is specific to this site (keep it under ~5 KB), always built from the variables.

Variables: colors --bg --bg-2 --ink --ink-2 --line --accent --accent-text --on-accent --accent-soft; fonts --f-display --f-body --f-mono; --radius; type --step--1 --step-0 --step-1 --step-2 --step-3 --step-4 --step-5 --step-6 (fluid; step-6 is huge display); space --sp-1..--sp-8, --sec (section padding), --gutter, --max. Never hard-code a color or font. Text color is --ink (body), --ink-2 (secondary), --accent-text (accent text). Only put --on-accent text on --accent.

Primitives (use them, combine them, add your own classes beside them):
- Shell: .k-skip (first link in body, href="#main"), header.k-header > .k-wrap.k-header__in > a.k-brand + nav.k-nav (links; the last may be a.k-btn.k-btn--accent), main#main, footer.k-footer > .k-wrap > .k-footer__in. Add .k-header--sticky only if it suits.
- Layout: .k-wrap (.k-wrap--narrow), .k-section (.k-section--tight, .k-section--band), .k-invert (dark/inverse band), .k-accent-band, .k-grid (12 columns) with children .k-s-2..10 (span at 900px+) and .k-at-2..9 (start column) e.g. <div class="k-s-5 k-at-2">, .k-split / .k-split--flip / .k-split--even, .k-stack, .k-cluster, .k-sticky, .k-align-end.
- Type: .k-display (huge), .k-h1 .k-h2 .k-h3 .k-h4 (sizes only; use the right heading element), em inside headings is italic accent, .k-lede, .k-kicker (mono uppercase label), .k-num, .k-muted, .k-prose, .k-todo (marks a placeholder).
- Components: .k-btn (.k-btn--accent .k-btn--ghost .k-btn--plain), .k-link, .k-pill, .k-rule, .k-hero (+ .k-hero__foot, .k-hero__meta), .k-rows (label | content rows; .k-rows--3 for three columns), ol.k-index (numbered typographic list), .k-stat (a real number only if the owner gave it), ul.k-menu > li > .k-menu__name .k-menu__dots .k-menu__price .k-menu__desc, .k-tiers > .k-tier (.k-tier--lead, .k-tier__price; set style="--cols:3"), table.k-table inside .k-scroll, .k-faq (details/summary), .k-figure, .k-ph (clearly marked image placeholder), .k-art.k-art--arcs|bars|grid|dots|half (geometric art, give it a ratio class .k-ratio-4x5|3x2|1x1|16x9|21x9), .k-strip > .k-strip__track (running text; repeat the content twice, mark the second copy aria-hidden), form.k-form > label.k-field.
- Header markup: <a class="k-skip" href="#main">Skip to content</a><header class="k-header"><div class="k-wrap k-header__in"><a class="k-brand" href="index.html">Name</a><nav class="k-nav" aria-label="Main"><a href="about.html">About</a>…</nav></div></header>. Set aria-current="page" on the current page's link.`;

const CRAFT = `DESIGN RULES (these are what make it look made by a studio, not generated)
1. Anti-vibe-code means bespoke art direction for the actual business, not a template with different colors. Honor the owner's style and use the strongest composition the brief supports. Do not default every business to green or purple. Composition over components. Each page uses at least three clearly different section compositions (for example: huge-type hero; asymmetric split with a figure; numbered index list; label|content rows; full-bleed inverse band with one sentence; menu/price list). Never the same block repeated, never a row of three identical cards with icons. At most one equal-tile grid on the entire site, and only for real equal items.
2. Scale contrast. At least one headline per page at --step-5 or --step-6 (the hero), body copy at --step-0, small labels in .k-kicker. Whitespace is a feature: use --sec between sections, and let things sit off-center (.k-at-*).
3. Restraint. One accent, used on one or two things per screen (a button, an italic word, a rule). No gradients except flat two-stop fields from the tokens, no glass, no drop-shadow cards, no rounded-corner tile walls, no floating blobs, no gradient text, no centered-everything layouts. Hairlines (--line) and type do the structure.
4. Copy is specific and plain: say what it is, who it is for, what it costs only if the owner gave prices. Headlines are short and concrete. Never use: "Welcome to", "unlock", "elevate", "seamless", "cutting-edge", "game-changer", "revolutionize", "empower", "leverage", "world-class", "one-stop shop", "take it to the next level", "your journey".
5. Truth. Use ONLY facts in the brief's owner-provided content. Never invent prices, hours, addresses, phone numbers, emails, staff names, customer names, testimonials, reviews, star ratings, logos, awards, certifications, statistics or counters ("10,000+ customers", "99.9%"). Also never invent a history or story: no founding year ("since 2012", "est."), no "family-run", "locally owned", years of experience, team size or origin story unless the owner said so. The footer is the name, the links and the year 2026, nothing more. If a headline sits in a half-width column, keep it short (a long word must fit its column). When a fact is missing, write a marked placeholder: <span class="k-todo">[Add: opening hours]</span>. No lorem ipsum, ever. For a testimonials/proof section: omit it unless the owner supplied the quotes.
6. No emoji anywhere, and no icon fonts. For marks use a typographic glyph (→ ↗ ·), a hairline, or small inline SVG built from simple paths/circles/lines using currentColor or var(--accent).
7. Imagery: no external image URLs. Where a photograph belongs use <figure class="k-figure k-ratio-4x5"><div class="k-ph">Photo: a specific description</div></figure>, or geometric .k-art. Give every real <img> alt text.
8. Accessible and responsive by construction: one h1 per page, headings in order, landmarks, labeled form fields (<label class="k-field">Name<input name="name" required autocomplete="name"></label>), visible focus (already handled), real link text. No fixed pixel widths, no horizontal overflow at 390px, tables inside .k-scroll. Use only token colors so contrast stays AA.
9. Forms: no action or method (Keplar wires them to the owner's inbox). Never ask for passwords, payment cards, government IDs or wallet phrases.
10. Every page: <!doctype html>, <html lang>, unique <title> under 60 characters, <meta name="description"> under 155, viewport meta, <link rel="stylesheet" href="styles.css">, the shared header and footer with relative links to every page, one <main id="main">.
11. No JavaScript at all (scripts, handlers and iframes are stripped). Menus are plain links that wrap; disclosure uses <details>.
12. Never impersonate a real company, bank, government or login page. No medical or financial guarantees.`;

const MOTION = `MOTION HOOKS (declarative attributes; Keplar's own runtime animates them, you write no script). Put data-kfx="hero" on the hero container (the element with class k-hero). Add data-reveal on 4 to 8 headings, figures and list blocks below the first screen. Add data-parallax="10" on at most two large figures. Everything must read perfectly with these ignored. Do not put text on top of busy imagery; the scene sits behind the hero and is subtle.`;

const EDITING = `EDITING. When "Current files" are provided, change only what the request asks for. Return ONLY the files you changed or added, each in full. To delete a page output <delete path="old.html"/>. Keep the design, copy and structure of everything else. The styles.css you receive omits the Keplar design-system block: return your styles.css the same way (without it) if you change it. When you add or rename a page, update the navigation in every page that has one (return those files too). Keep following the design rules above.`;

const LEGACY = `You are Keplar's website builder. You write complete, production-quality static websites.

OUTPUT FORMAT. Reply with exactly this and nothing else (no markdown fences, no commentary):
<summary>One or two plain sentences saying what you built or changed.</summary>
<file path="index.html">
...the whole file...
</file>

RULES
- Files are HTML pages in the root plus one shared styles.css. Keep the site's existing structure, class names and CSS approach; change only what the request asks for.
- NO JavaScript at all. Responsive, accessible, semantic HTML, real specific copy (never lorem ipsum, no invented testimonials, statistics, prices or contact details; use clearly marked placeholders like [Add: opening hours] instead). No emoji as icons. No purple gradients.
- Images: no external image URLs; use inline SVG or CSS shapes.
- Forms: leave out action and method. Never ask for passwords, payment cards, government IDs or wallet phrases.
- Return ONLY the files you changed or added, each in full. To delete a page output <delete path="old.html"/>. When you add or rename a page, update the navigation in every page that has one.`;

export function builderSystem(opts: { edit: boolean; motion: boolean; legacy?: boolean }): string {
  if (opts.legacy) return LEGACY;
  return [
    `You are Keplar's lead web designer and front-end engineer. You build small, fast, specific websites that look art-directed by a human studio, never templated. You write complete static HTML pages plus one stylesheet.`,
    FORMAT,
    `FILES. HTML pages in the root (index.html, menu.html, contact.html ...; lowercase letters, numbers, hyphens) plus one shared styles.css. Follow the page list in the brief exactly.`,
    DS_REFERENCE,
    CRAFT,
    opts.motion ? MOTION : "",
    featureDoc(),
    opts.edit ? EDITING : "",
  ].filter(Boolean).join("\n\n");
}

/** Back-compat for tests and callers that want the default new-site prompt. */
export const BUILDER_SYSTEM = builderSystem({ edit: false, motion: true });

export type FileBlocks = { summary: string; files: Record<string, string>; deleted: string[]; truncated: boolean };

/** Parses the model's reply. An unterminated last file (cut off by the token limit) is dropped and reported. */
export function parseBlocks(text: string): FileBlocks {
  const files: Record<string, string> = {};
  const deleted: string[] = [];
  const summary = /<summary>([\s\S]*?)<\/summary>/i.exec(text)?.[1]?.trim().replace(/\s+/g, " ").slice(0, 500) ?? "";
  const re = /<file\s+path="([^"]{1,80})"\s*>\n?([\s\S]*?)<\/file>/gi;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  while ((m = re.exec(text))) {
    files[m[1].trim()] = m[2].replace(/^```[a-z]*\n/i, "").replace(/\n```\s*$/i, "").replace(/\s+$/, "") + "\n";
    lastEnd = re.lastIndex;
  }
  for (const d of text.matchAll(/<delete\s+path="([^"]{1,80})"\s*\/?>/gi)) deleted.push(d[1].trim());
  const tail = text.slice(lastEnd);
  const truncated = /<file\s+path="[^"]+"\s*>/i.test(tail);
  return { summary, files, deleted, truncated };
}

export type GenInput = {
  plan: PlanId;
  breaker: BreakerLevel;
  prompt: string;
  /** Current files (edits) or null (new site). */
  current: Record<string, string> | null;
  /** Recent chat context, newest last. */
  history: { role: "user" | "assistant"; text: string }[];
  limits: { pages: number; siteBytes: number; maxOutputTokens: number };
  /** A template/start hint for new sites. */
  hint?: string;
  /** The approved brief (new builds) or the site's stored brief (edits, kept short). */
  brief?: SiteBrief | null;
  /** Motion hooks wanted (brief.motion != none, or effects switched on). */
  motion?: boolean;
  /** Quality repair pass: `prompt` carries the findings. */
  repair?: boolean;
  /** Site predates the design system: edit it in its own style. */
  legacy?: boolean;
};

/**
 * `file` = the model started writing that file; `filedone` = its closing tag arrived (for html/css the text is included so the
 * studio can show a live, script-less preview before anything is saved). Nothing here is saved or trusted: the final files still go
 * through normalizeFiles + lint before a version exists.
 */
export type GenEvent = { type: "status"; text: string } | { type: "file"; path: string } | { type: "filedone"; path: string; content?: string } | { type: "progress"; chars: number };
const PARTIAL_MAX = 160_000;

export type GenResult = FileBlocks & { model: BuilderModel; usd: number; inputTokens: number; outputTokens: number; costKnown: boolean };

export class GenError extends Error {
  constructor(message: string, public code = "generation_failed", public usd = 0) {
    super(message);
  }
}

function userMessage(i: GenInput): string {
  const budget = `Budget: at most ${i.limits.pages} HTML pages and ${Math.round(i.limits.siteBytes / 1024)} KB in total (the design system adds about 10 KB to styles.css on top of what you write).`;
  if (i.current) {
    const files = Object.entries(i.current).map(([p, c]) => `<file path="${p}">\n${p.endsWith(".css") && !i.legacy ? stripDesignSystem(c) : c}</file>`).join("\n");
    const dir = i.brief ? `Style direction: ${getDirection(i.brief.direction).name}. Name: ${i.brief.name}. Tone: ${i.brief.tone.join(", ") || "as built"}.\n\n` : "";
    if (i.repair) return `${budget}\n\nThese files failed Keplar's quality check. Fix exactly the listed problems, keep everything else, return each changed file in full.\n\nProblems:\n${i.prompt}\n\n${dir}Current files:\n${files}`;
    return `${budget}\n\n${dir}Current files:\n${files}\n\nRequest: ${i.prompt}`;
  }
  if (i.brief) return `${budget}\n\nBRIEF (approved by the owner)\n${briefToPrompt(i.brief, i.limits.pages)}\n\nBuild this website now.`;
  return `${budget}${i.hint ? `\nStarting point: ${i.hint}` : ""}\n\nBuild this website:\n${i.prompt}`;
}

/** Reads an OpenAI-style SSE stream; yields text deltas; resolves usage at the end. */
async function* readStream(res: Response, idleMs: number): AsyncGenerator<{ delta?: string; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } }> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idle = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new GenError("The model stopped responding.", "idle")), idleMs);
    });
    const next = await Promise.race([reader.read(), idle]).finally(() => clearTimeout(timer));
    if (next.done) break;
    buf += dec.decode(next.value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }; error?: { message?: string } };
        if (j.error) throw new GenError(j.error.message?.slice(0, 120) || "The model returned an error.", "upstream");
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield { delta };
        if (j.usage) yield { usage: j.usage };
      } catch (e) {
        if (e instanceof GenError) throw e;
      }
    }
  }
}

export async function* generateSite(input: GenInput, opts: { signal?: AbortSignal; budgetMs?: number } = {}): AsyncGenerator<GenEvent, GenResult> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new GenError("Site generation isn't set up yet.", "not_configured");
  const chain = modelChain(input.plan, input.breaker);
  const messages = [
    { role: "system", content: builderSystem({ edit: Boolean(input.current), motion: input.motion ?? true, legacy: input.legacy }) },
    ...input.history.slice(-6).map((h) => ({ role: h.role, content: h.text.slice(0, 600) })),
    { role: "user", content: userMessage(input) },
  ];
  const inputTokens = tokensOf(messages.reduce((a, m) => a + m.content.length, 0));
  const deadline = Date.now() + (opts.budgetMs ?? 255_000);
  let lastError = "The models are busy right now. Try again in a minute.";
  let spent = 0;

  for (const model of chain) {
    const left = deadline - Date.now();
    if (left < 15_000) break;
    yield { type: "status", text: input.current ? `Reading your site (${model.label})` : `Planning the site (${model.label})` };
    const ctl = new AbortController();
    let partialChars = 0;
    const kill = setTimeout(() => ctl.abort(), left);
    opts.signal?.addEventListener("abort", () => ctl.abort(), { once: true });
    try {
      const res = await fetch(`${OPENROUTER_BASE()}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "http-referer": "https://keplar.one", "x-title": "Keplar" },
        body: JSON.stringify({
          model: model.id,
          stream: true,
          temperature: 0.6,
          max_tokens: input.limits.maxOutputTokens,
          messages,
          usage: { include: true },
          provider: providerRouting(model.free),
          reasoning: model.free ? { effort: "none", exclude: true } : { effort: "low", exclude: true },
        }),
        signal: ctl.signal,
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        lastError = res.status === 429 ? "The free models are busy right now. Try again in a minute." : `The model was unavailable (${res.status}).`;
        await res.body?.cancel().catch(() => undefined);
        continue;
      }
      let text = "";
      let usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined;
      const announced = new Set<string>();
      const finished = new Set<string>();
      let lastProgress = 0;
      yield { type: "status", text: "Writing pages" };
      for await (const chunk of readStream(res, model.free ? 60_000 : 45_000)) {
        if (chunk.usage) usage = chunk.usage;
        if (!chunk.delta) continue;
        text += chunk.delta;
        partialChars = text.length;
        for (const m of text.matchAll(/<file\s+path="([^"]{1,80})"\s*>/gi)) {
          if (!announced.has(m[1])) {
            announced.add(m[1]);
            yield { type: "file", path: m[1] };
          }
        }
        if (chunk.delta.includes("<") && text.slice(-(chunk.delta.length + 8)).includes("</file>")) {
          for (const m of text.matchAll(/<file\s+path="([^"]{1,80})"\s*>([\s\S]*?)<\/file>/gi)) {
            if (finished.has(m[1])) continue;
            finished.add(m[1]);
            const body = m[2].replace(/^\r?\n/, "");
            yield /\.(html?|css)$/i.test(m[1]) && body.length <= PARTIAL_MAX ? { type: "filedone", path: m[1], content: body } : { type: "filedone", path: m[1] };
          }
        }
        if (text.length - lastProgress > 2500) {
          lastProgress = text.length;
          yield { type: "progress", chars: text.length };
        }
      }
      const outTok = usage?.completion_tokens ?? tokensOf(text.length);
      const inTok = usage?.prompt_tokens ?? inputTokens;
      const reported = typeof usage?.cost === "number" && usage.cost >= 0;
      const usd = model.free ? 0 : reported ? (usage!.cost as number) : costUsd(model, inTok, outTok);
      const blocks = parseBlocks(text);
      if (!blocks.summary && !Object.keys(blocks.files).length) {
        spent += usd;
        lastError = "The model didn't return a site. Try rephrasing.";
        continue;
      }
      return { ...blocks, model, usd: spent + usd, inputTokens: inTok, outputTokens: outTok, costKnown: reported || model.free };
    } catch (e) {
      if (opts.signal?.aborted) throw new GenError("Canceled.", "cancelled", spent);
      if (!model.free && partialChars > 0) spent += costUsd(model, inputTokens, tokensOf(partialChars));
      lastError = e instanceof GenError ? e.message : ctl.signal.aborted ? "The model took too long." : "The model couldn't be reached.";
    } finally {
      clearTimeout(kill);
    }
  }
  throw new GenError(lastError, "generation_failed", spent);
}

