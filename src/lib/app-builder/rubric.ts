/**
 * The anti-generic rubric: what the generator is told (RUBRIC) and what is checked mechanically after generation
 * (rubricFindings). The vision pass (verify/visual.ts) reviews the screenshots against the same rubric.
 */

export const RUBRIC = `ANTI-GENERIC RUBRIC (a reviewer rejects the build if any of these fail)
1. No template skeletons. Never the default "hero + three feature cards + testimonials + CTA band + footer" page, never a grid of identical icon cards, never centered-everything. Compose each screen from what THIS product needs (a feed, a board, a calendar, a canvas, a ledger, a reader...), with real hierarchy: one thing clearly first.
2. No stock decoration: no blurred gradient blobs or orbs, no purple-to-blue gradients, no glassmorphism unless the style is Glassy, no floating 3D emoji, no "sparkle" icons, no emoji used as icons, no icon font, no random abstract shapes that mean nothing. Marks are small inline SVG drawn for this product, typographic glyphs, or real imagery.
3. Real imagery: use "keplar-image:<slot>" for the generated images listed in the spec, user uploads where the app has them, or SVG/CSS illustration that depicts the subject. Never hotlink stock photos (no unsplash, picsum, placeholder services).
4. Copy is specific to this product and its audience: real UI labels, real empty states ("No rolls developed yet. Post your first frame."), real error messages, real onboarding. Never lorem ipsum, never "Welcome to our platform", never "Unlock / Elevate / Seamless / Revolutionize / Empower / Next-gen / Cutting-edge / Game-changer". Never invent testimonials, reviews, user counts, ratings, press logos, awards or statistics.
5. Typography does the work: the display face at large sizes with tight tracking for the few things that matter, the body face for reading, mono for metadata. Strong scale contrast. Never default system UI look.
6. Color comes from the design tokens only (var(--...)). One accent used with intent; the second accent only where the direction calls for it.
7. Product craft: every interactive thing has hover, focus-visible, pressed and disabled states; every async action shows progress and handles failure; lists have loading skeletons and designed empty states; destructive actions confirm; forms validate inline. Mobile is designed, not squeezed: at every width from 320px to 1920px (390 and 540 are tested) nothing overflows sideways, tap targets are 44px, navigation is reachable with a thumb. Horizontal strips (day pickers, filter chips, tabs) scroll inside themselves: max-width: 100%; min-width: 0; and never shrink-wrapped by align-items: flex-start in a column, inline-block or float. Never hide overflow with overflow-x: hidden on html or body. Text never sits on other text: corner labels, stamps and folio marks go in the normal flow (a flex row with space-between) or get reserved room, and hide when there is no room; no absolute positioning over a row of text.
8. Accessibility: semantic landmarks (header/nav/main), one h1 per screen, labelled inputs, alt text, visible focus, contrast from tokens, keyboard operable (Esc closes dialogs), prefers-reduced-motion respected.
9. Every requested feature is reachable from the UI and actually works end to end against the real backend (not mocked arrays).`;

export type RubricFinding = { file: string; severity: "error" | "warn"; code: string; message: string };

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
const CLICHES = /\b(lorem ipsum|welcome to our|unlock (your|the)|elevate your|seamless(ly)?|revolutioni[sz]e|empower(ing)? |next-gen|cutting-edge|game[- ]changer|world-class|take it to the next level)\b/i;
const STOCK = /(images\.unsplash\.com|source\.unsplash|picsum\.photos|placeholder\.com|placehold\.co|placekitten|dummyimage\.com|via\.placeholder|randomuser\.me|pravatar\.cc)/i;
const CDN = /\bfrom\s+["']https?:\/\/|import\(\s*["']https?:\/\/|<script[^>]+src=["']https?:\/\/(?!fonts\.)/i;
const FAKE_PROOF = /\b(\d{1,3}(,\d{3})+|\d+k)\+?\s+(happy |satisfied )?(customers|users|members|clients|downloads)\b|★★★★|trusted by (thousands|millions|leading)/i;

/** Mechanical rubric checks. Errors are fed to the fix loop; warnings are shown in the report. */
export function rubricFindings(files: Record<string, string>): RubricFinding[] {
  const out: RubricFinding[] = [];
  for (const [file, src] of Object.entries(files)) {
    if (!/\.(html|js|mjs|css)$/.test(file)) continue;
    const isCode = /\.(js|mjs)$/.test(file);
    if (/lorem ipsum/i.test(src)) out.push({ file, severity: "error", code: "lorem", message: "Contains lorem ipsum filler text; write real copy for this product." });
    if (STOCK.test(src)) out.push({ file, severity: "error", code: "stock-image", message: `Hotlinks a stock/placeholder image service (${STOCK.exec(src)![0]}); use keplar-image:<slot> or SVG.` });
    if (CDN.test(src)) out.push({ file, severity: "error", code: "cdn-import", message: "Loads code from a CDN; the app's sandbox blocks third-party scripts. Use window.kui / window.THREE / the app's own files." });
    if (!/\.css$/.test(file) && EMOJI.test(src.replace(/\/\/.*$/gm, ""))) out.push({ file, severity: "warn", code: "emoji", message: "Uses emoji characters; use small inline SVG or typographic marks instead of emoji icons." });
    if (CLICHES.test(src)) out.push({ file, severity: "warn", code: "cliche", message: `Generic marketing phrase: "${CLICHES.exec(src)![0]}".` });
    if (FAKE_PROOF.test(src)) out.push({ file, severity: "error", code: "fake-proof", message: `Invented social proof or statistics ("${FAKE_PROOF.exec(src)![0]}"); remove it.` });
    if (/\.css$/.test(file) || file.endsWith(".html")) {
      if (/linear-gradient\([^)]*(#(7c3aed|8b5cf6|6d28d9|a855f7|9333ea|6366f1)|purple|violet)/i.test(src)) out.push({ file, severity: "warn", code: "purple-gradient", message: "Stock purple gradient; use the design tokens." });
      if (/filter:\s*blur\(\s*([4-9]\d|\d{3,})px/i.test(src)) out.push({ file, severity: "warn", code: "blob", message: "Large blurred shapes (gradient blobs) are decoration without meaning; remove them." });
      if (/(?:^|[}\s,])(?:html|body)\s*(?:,\s*(?:html|body)\s*)?\{[^}]*overflow-x\s*:\s*(?:hidden|clip)/i.test(src)) out.push({ file, severity: "warn", code: "overflow-mask", message: "overflow-x: hidden on html/body hides sideways overflow instead of fixing it (content is still cut off, and phones can still pan); constrain the element that is too wide." });
      const fam = /font-family:\s*([^;}{]+)/gi;
      let m: RegExpExecArray | null;
      while ((m = fam.exec(src))) {
        if (/^\s*["']?(inter|roboto|arial|helvetica|open sans|poppins|montserrat)\b/i.test(m[1]) && !/var\(--f-/.test(m[1])) {
          out.push({ file, severity: "warn", code: "default-font", message: `Overrides the design fonts with ${m[1].trim().slice(0, 30)}; use var(--f-display) / var(--f-body).` });
          break;
        }
      }
    }
    if (isCode && /\beval\s*\(|new\s+Function\s*\(/.test(src)) out.push({ file, severity: "error", code: "eval", message: "Uses eval/new Function, which the sandbox blocks." });
    if (isCode && /\bfetch\(\s*["'`]https?:\/\//.test(src)) out.push({ file, severity: "error", code: "external-fetch", message: "Calls an external URL; apps may only talk to their own API (keplar.db / keplar.ai / keplar.files)." });
  }
  return out;
}
