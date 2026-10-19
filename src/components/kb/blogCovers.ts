/**
 * Blog cover illustrations in the Page 1 style (pastel auras, fine dot ribbons, frosted cards, near-black accents), drawn as SVG so
 * they stay sharp, theme-neutral and weightless. One per topic; a post picks its cover from keywords in its slug, else by hash.
 * Static markup we author here (no user input), rendered with dangerouslySetInnerHTML by BlogCover.
 */
const svg = (id: string, bg: [string, string], body: (k: string) => string) => `<svg viewBox="0 0 600 380" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" style="display: block; width: 100%; height: 100%;"><defs><filter id="b${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="38"></feGaussianBlur></filter><filter id="s${id}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#0e0f12" flood-opacity=".14"></feDropShadow></filter><pattern id="d${id}" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="1" fill="#5b74c9"></circle></pattern><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"></stop><stop offset="1" stop-color="${bg[1]}"></stop></linearGradient></defs><rect width="600" height="380" fill="url(#g${id})"></rect>${body(id)}</svg>`;
const auras = (id: string, a: [number, number, number, string, number][]) => a.map(([x, y, r, c, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="${o}" filter="url(#b${id})"></circle>`).join("");
const ribbon = (id: string, d: string, o = 0.35) => `<path d="${d}" stroke="url(#d${id})" stroke-width="70" fill="none" stroke-linecap="round" opacity="${o}"></path>`;
const glass = (id: string, x: number, y: number, w: number, h: number, r = 22) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#ffffff" fill-opacity=".82" filter="url(#s${id})"></rect>`;
const MODELS = ["#d97757", "#10a37f", "#4285f4", "#4d6bfe", "#fa520f"];

const ARTS: ((id: string) => string)[] = [
  // 0 Featured: AI consensus. Five model dots draw lines to one black answer node.
  (id: string) => svg(id, ["#eaf4fb", "#f6eef9"], (k) => `${auras(k, [[110, 90, 150, "#a9d8f5", 0.9], [500, 70, 140, "#d6cdf5", 0.9], [460, 330, 150, "#f9d6c4", 0.85]])}${ribbon(k, "M-20 300 C 140 230, 260 340, 420 260 S 640 200, 660 230")}
${MODELS.map((c, i) => { const y = 70 + i * 60; return `<path d="M120 ${y} C 260 ${y}, 300 190, 420 190" stroke="#0e0f12" stroke-opacity="${i === 3 ? 0.12 : 0.35}" stroke-width="2" fill="none"${i === 3 ? ' stroke-dasharray="4 6"' : ""}></path>`; }).join("")}
${MODELS.map((c, i) => `${glass(k, 72, 46 + i * 60, 96, 48, 24)}<circle cx="102" cy="${70 + i * 60}" r="11" fill="${c}"></circle><rect x="120" y="${66 + i * 60}" width="34" height="8" rx="4" fill="#0e0f12" fill-opacity=".18"></rect>`).join("")}
<circle cx="440" cy="190" r="54" fill="#0e0f12" filter="url(#s${k})"></circle><path d="M418 191 l15 15 l28 -32" stroke="#ffffff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><text x="440" y="282" text-anchor="middle" font-family="Nunito Sans, sans-serif" font-size="20" fill="#0e0f12">4 of 5 agree</text>`),
  // 1 Memory and context windows: a long strip of message blocks, a frosted window frame over the recent part, older blocks fading.
  (id: string) => svg(id, ["#eef3fb", "#f3f0fb"], (k) => `${auras(k, [[480, 80, 140, "#a9d8f5", 0.9], [120, 320, 140, "#d6cdf5", 0.8]])}${ribbon(k, "M-20 90 C 160 40, 300 150, 640 60", 0.28)}
${Array.from({ length: 9 }, (_, i) => `<rect x="${20 + i * 66}" y="${150 + (i % 2) * 34}" width="${44 + (i % 3) * 8}" height="26" rx="13" fill="${i % 2 ? "#0e0f12" : "#ffffff"}" fill-opacity="${Math.min(1, 0.12 + i * 0.11) * (i % 2 ? 0.8 : 1)}"></rect>`).join("")}
<rect x="318" y="120" width="262" height="120" rx="28" fill="#ffffff" fill-opacity=".25" stroke="#0e0f12" stroke-width="2.5"></rect><text x="330" y="108" font-family="Nunito Sans, sans-serif" font-size="16" fill="#0e0f12">What the model can see</text><text x="20" y="282" font-family="Nunito Sans, sans-serif" font-size="16" fill="#686d78">Older messages fall out</text><path d="M200 278 h70" stroke="#686d78" stroke-width="2" marker-end=""></path><path d="M24 300 h560" stroke="#0e0f12" stroke-opacity=".08" stroke-width="2"></path>`),
  // 2 Study and essays: a notebook card with lines, a check list and a pencil.
  (id: string) => svg(id, ["#f1f8f3", "#eef3fb"], (k) => `${auras(k, [[110, 100, 150, "#cdeedd", 1], [520, 300, 150, "#a9d8f5", 0.85]])}${ribbon(k, "M-20 330 C 200 260, 360 360, 640 280", 0.3)}
<g transform="rotate(-6 300 190)">${glass(k, 170, 60, 260, 250, 24)}${Array.from({ length: 6 }, (_, i) => `<rect x="200" y="${108 + i * 30}" width="${i % 3 === 2 ? 120 : 190}" height="8" rx="4" fill="#0e0f12" fill-opacity=".14"></rect>`).join("")}<circle cx="198" cy="84" r="6" fill="#0e0f12"></circle><rect x="212" y="80" width="90" height="9" rx="4.5" fill="#0e0f12"></rect></g>
<g transform="rotate(38 460 140)"><rect x="440" y="40" width="26" height="190" rx="6" fill="#0e0f12"></rect><path d="M440 230 l13 34 l13 -34 z" fill="#f2c9a8"></path><rect x="440" y="40" width="26" height="24" rx="6" fill="#d97757"></rect></g>
${[0, 1, 2].map((i) => `<g transform="translate(60 ${120 + i * 50})"><circle r="15" fill="${i < 2 ? "#0e0f12" : "#ffffff"}" stroke="#0e0f12" stroke-opacity=".2"></circle>${i < 2 ? '<path d="M-6 0 l4 4 l8 -9" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"></path>' : ""}</g>`).join("")}`),
  // 3 Health questions: a heart-rate line through a frosted card, with a "check with a doctor" chip.
  (id: string) => svg(id, ["#fbf1ee", "#f3f0fb"], (k) => `${auras(k, [[480, 90, 150, "#f9d6c4", 1], [120, 300, 150, "#d6cdf5", 0.85]])}${ribbon(k, "M-20 80 C 200 140, 380 40, 640 110", 0.25)}
${glass(k, 70, 90, 460, 200, 28)}<path d="M100 200 h110 l22 -60 l30 120 l26 -90 l18 30 h194" stroke="#e07a5a" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round"></path><path d="M466 132 c-14 -22 -50 -14 -50 14 c0 26 50 48 50 48 s50 -22 50 -48 c0 -28 -36 -36 -50 -14 z" fill="#0e0f12" transform="translate(0 -10) scale(.9) translate(52 10)"></path>
<rect x="190" y="306" width="220" height="40" rx="20" fill="#0e0f12"></rect><text x="300" y="332" text-anchor="middle" font-family="Nunito Sans, sans-serif" font-size="16" fill="#ffffff">Check with a doctor</text>`),
  // 4 Why models disagree: two branches splitting from one question, each ending in a different answer card.
  (id: string) => svg(id, ["#eef3fb", "#fbf1ee"], (k) => `${auras(k, [[90, 190, 150, "#a9d8f5", 0.9], [520, 80, 130, "#cdeedd", 0.9], [520, 320, 130, "#f9d6c4", 0.9]])}${ribbon(k, "M-20 330 C 160 300, 300 360, 640 300", 0.25)}
${glass(k, 40, 160, 150, 60, 30)}<text x="115" y="196" text-anchor="middle" font-family="Nunito Sans, sans-serif" font-size="22" fill="#0e0f12">?</text>
<path d="M190 190 C 280 190, 300 96, 380 96" stroke="#10a37f" stroke-width="3" fill="none"></path><path d="M190 190 C 280 190, 300 284, 380 284" stroke="#e07a5a" stroke-width="3" fill="none"></path>
${glass(k, 380, 66, 180, 60, 30)}<circle cx="410" cy="96" r="10" fill="#10a37f"></circle><rect x="430" y="91" width="104" height="10" rx="5" fill="#0e0f12" fill-opacity=".22"></rect>
${glass(k, 380, 254, 180, 60, 30)}<circle cx="410" cy="284" r="10" fill="#e07a5a"></circle><rect x="430" y="279" width="80" height="10" rx="5" fill="#0e0f12" fill-opacity=".22"></rect>`),
  // 5 What is multi-model AI: the Keplar mark in the middle, model dots on an orbit.
  (id: string) => svg(id, ["#f0f2fb", "#eef7fb"], (k) => `${auras(k, [[300, 190, 170, "#d6cdf5", 0.9], [80, 60, 120, "#a9d8f5", 0.9], [540, 330, 120, "#f9d6c4", 0.8]])}${ribbon(k, "M-20 120 C 180 40, 400 220, 640 100", 0.22)}
<ellipse cx="300" cy="190" rx="200" ry="110" fill="none" stroke="#0e0f12" stroke-opacity=".15" stroke-width="2"></ellipse><ellipse cx="300" cy="190" rx="130" ry="70" fill="none" stroke="#0e0f12" stroke-opacity=".1" stroke-width="2"></ellipse>
${MODELS.map((c, i) => { const a = (i / 5) * Math.PI * 2 - 0.6; const x = 300 + Math.cos(a) * 200, y = 190 + Math.sin(a) * 110; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="22" fill="#ffffff" filter="url(#s${k})"></circle><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="${c}"></circle>`; }).join("")}
<circle cx="300" cy="190" r="50" fill="#ffffff" filter="url(#s${k})"></circle><g transform="translate(276 166) scale(.12)"><rect width="229" height="229" rx="70" fill="#000"></rect><path d="M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z" fill="#000"></path><circle cx="281" cy="281" r="117" fill="#000"></circle></g>`),
  // 6 Better prompts: a composer pill with a typed prompt and a blinking-cursor bar, plus three quality ticks.
  (id: string) => svg(id, ["#f6eef9", "#eaf4fb"], (k) => `${auras(k, [[110, 80, 140, "#d6cdf5", 0.95], [500, 300, 150, "#a9d8f5", 0.9]])}${ribbon(k, "M-20 320 C 180 250, 380 350, 640 270", 0.3)}
${glass(k, 50, 130, 500, 110, 34)}<text x="84" y="178" font-family="Nunito Sans, sans-serif" font-size="20" fill="#0e0f12">Compare two laptops for 4K video</text><text x="84" y="208" font-family="Nunito Sans, sans-serif" font-size="20" fill="#686d78">editing under $1,500. Use a table.</text><rect x="404" y="191" width="2.5" height="22" fill="#0e0f12"></rect><circle cx="508" cy="200" r="20" fill="#0e0f12"></circle><path d="M508 210 v-20 M500 198 l8 -8 l8 8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
${["Goal", "Limits", "Format"].map((t, i) => `<g transform="translate(${70 + i * 150} 290)"><rect width="128" height="40" rx="20" fill="#ffffff" fill-opacity=".85"></rect><circle cx="22" cy="20" r="9" fill="#0e0f12"></circle><path d="M18 20 l3 3 l5 -6" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"></path><text x="40" y="26" font-family="Nunito Sans, sans-serif" font-size="16" fill="#0e0f12">${t}</text></g>`).join("")}`),
];

const TOPICS: [RegExp, number][] = [
  [/consensus|trust|agree/, 0],
  [/memory|context|forget/, 1],
  [/study|essay|student|learn|homework/, 2],
  [/health|medical|doctor/, 3],
  [/disagree|differ|wrong|hallucinat|check|fact/, 4],
  [/multi-model|models|compare|vs-|alternative|which/, 5],
  [/prompt|write|ask/, 6],
];

export function coverIndex(slug: string): number {
  for (const [re, i] of TOPICS) if (re.test(slug)) return i;
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % ARTS.length;
}

/** Unique ids per rendered cover so several on one page do not share filters. */
export function coverSvg(slug: string, uid: string): string {
  return ARTS[coverIndex(slug)](uid);
}
