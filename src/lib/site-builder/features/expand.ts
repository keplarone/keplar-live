/**
 * Turns feature placeholders into real markup at serve time. The output is built here from validated attributes only (never from
 * model-written HTML), uses the site's own design classes, and needs no script: forms are plain posts to /_f/<feature>.
 */
import type { Site } from "../types";
import { featureInfo, type FeatureId } from "./catalog";
import { listRows, MAX_ROWS, toCollection } from "./data";
import { freeSlots, parseAvailability } from "./booking";
import { listRecords } from "./records";
import { findPlaceholders, type Placeholder } from "./placeholders";
import { issueToken } from "./spam";
import { dateLabel, listPosts } from "./blog";
import { parseEmbed } from "./embeds";
import { currencyOf, MAX_QTY, money, parseProducts, payState } from "./checkout";

export type ExpandCtx = { site: Site; base: string; preview: boolean; file: string; /** The signed-in visitor (members feature), when the request carried a valid session. */ member?: { id: string; email: string } | null };

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const FIELD_LABEL: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", company: "Company", subject: "Subject", message: "Message" };
const REQUIRED = new Set(["name", "email", "message"]);
export const labelOf = (f: string) => FIELD_LABEL[f] ?? f.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function control(f: string): string {
  const label = esc(labelOf(f));
  const req = REQUIRED.has(f) ? " required" : "";
  if (f === "message") return `<label class="k-field"><span>${label}</span><textarea name="message" rows="5" maxlength="2000"${req}></textarea></label>`;
  const type = f === "email" ? "email" : f === "phone" ? "tel" : "text";
  const ac = f === "email" ? "email" : f === "name" ? "name" : f === "phone" ? "tel" : f === "company" ? "organization" : "off";
  return `<label class="k-field"><span>${label}</span><input type="${type}" name="${esc(f)}" maxlength="${f === "email" ? 190 : 200}" autocomplete="${ac}"${req}></label>`;
}

/** Hidden inputs every feature form carries: which placeholder it is, the signed token, and the honeypot humans never see. */
export function formGuards(ctx: ExpandCtx, p: Placeholder): string {
  return `<input type="hidden" name="_id" value="${esc(p.key)}"><input type="hidden" name="_page" value="${esc(ctx.file)}"><input type="hidden" name="_t" value="${esc(issueToken(ctx.site.id))}">` +
    `<div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true"><label>Leave this empty<input type="text" name="_hp" tabindex="-1" autocomplete="off"></label></div>`;
}

export const postUrl = (ctx: ExpandCtx, feature: FeatureId) => `${ctx.base}/_f/${feature}${ctx.preview ? "?preview=1" : ""}`;
export const titleHtml = (p: Placeholder, fallback: string) => `<p class="k-feat__title"><strong>${esc(p.attrs.title || fallback)}</strong></p>`;

function renderForm(p: Placeholder, ctx: ExpandCtx): string {
  const fields = (p.attrs.fields || "name,email,message").split(",");
  return `<form class="k-form k-feat k-feat--form" method="post" action="${esc(postUrl(ctx, "form"))}" style="position:relative">${titleHtml(p, "Get in touch")}${fields.map(control).join("")}${formGuards(ctx, p)}<button class="k-btn k-btn--accent" type="submit">${esc(p.attrs.button || "Send")}</button></form>`;
}

function renderNewsletter(p: Placeholder, ctx: ExpandCtx): string {
  const wait = p.attrs.kind === "waitlist";
  const withName = (p.attrs.fields || "").split(",").includes("name");
  return `<form class="k-form k-feat k-feat--newsletter" method="post" action="${esc(postUrl(ctx, "newsletter"))}" style="position:relative">${titleHtml(p, wait ? "Join the waitlist" : "Stay in the loop")}${withName ? control("name").replace(" required", "") : ""}${control("email")}${formGuards(ctx, p)}<button class="k-btn k-btn--accent" type="submit">${esc(p.attrs.button || (wait ? "Join" : "Subscribe"))}</button>${p.attrs.note ? `<small>${esc(p.attrs.note)}</small>` : ""}</form>`;
}

async function renderBooking(p: Placeholder, ctx: ExpandCtx): Promise<string> {
  const a = parseAvailability(p.attrs);
  const booked = await listRecords(ctx.site.workspaceId, ctx.site.id, "booking", p.key);
  const slots = freeSlots(a, Date.now(), new Set(booked.filter((r) => r.status === "confirmed").map((r) => r.data.start)));
  if (!slots.length) return `<div class="k-feat k-feat--booking">${titleHtml(p, "Book a time")}<p>No times are open right now. Please check back soon.</p></div>`;
  const groups = new Map<string, string[]>();
  for (const s of slots) groups.set(s.day, [...(groups.get(s.day) ?? []), `<option value="${esc(s.iso)}">${esc(s.label)}</option>`]);
  const select = [...groups].map(([day, opts]) => `<optgroup label="${esc(day)}">${opts.join("")}</optgroup>`).join("");
  return `<form class="k-form k-feat k-feat--booking" method="post" action="${esc(postUrl(ctx, "booking"))}" style="position:relative">${titleHtml(p, "Book a time")}<p><small>Times are in ${esc(a.tz)}. ${a.slot} minutes each.</small></p>` +
    `<label class="k-field"><span>Pick a time</span><select name="slot" required><option value="">Choose a time</option>${select}</select></label>${control("name")}${control("email")}` +
    `<label class="k-field"><span>Anything we should know? (optional)</span><textarea name="message" rows="3" maxlength="1000"></textarea></label>${formGuards(ctx, p)}<button class="k-btn k-btn--accent" type="submit">${esc(p.attrs.button || "Book")}</button></form>`;
}

async function renderData(p: Placeholder, ctx: ExpandCtx): Promise<string> {
  const c = toCollection(p);
  const rows = (await listRows(ctx.site, c.key)).slice(0, MAX_ROWS);
  const head = titleHtml(p, c.title);
  if (!rows.length) return `<div class="k-feat k-feat--data">${head}<p>Nothing here yet.</p></div>`;
  if (c.view === "cards") {
    return `<div class="k-feat k-feat--data">${head}<ul class="k-feat__cards" style="list-style:none;padding:0;display:grid;gap:var(--sp-4,1rem);grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))">${rows.map((r) => `<li>${c.fields.filter((f) => r.data[f]).map((f, i) => (i === 0 ? `<strong>${esc(r.data[f])}</strong>` : `<div>${esc(r.data[f])}</div>`)).join("")}</li>`).join("")}</ul></div>`;
  }
  return `<div class="k-feat k-feat--data" style="overflow-x:auto">${head}<table class="k-feat__table" style="width:100%;border-collapse:collapse"><thead><tr>${c.fields.map((f) => `<th scope="col" style="text-align:left;padding:.5rem .75rem;border-bottom:1px solid currentColor">${esc(labelOf(f))}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${c.fields.map((f) => `<td style="padding:.5rem .75rem;border-bottom:1px solid color-mix(in srgb,currentColor 20%,transparent)">${esc(r.data[f] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

async function renderCheckout(p: Placeholder, ctx: ExpandCtx): Promise<string> {
  const products = parseProducts(p.attrs.products);
  const head = titleHtml(p, "Shop");
  if (!products.length) return `<div class="k-feat k-feat--checkout">${head}<p>No products yet.</p></div>`;
  const cur = currencyOf(p.attrs);
  const state = ctx.preview ? ({ open: false, why: "" } as const) : await payState(ctx.site.workspaceId);
  const note = ctx.preview
    ? "<p><small>Preview: buying works once the site is published and payments are connected.</small></p>"
    : !state.open
      ? `<p role="note"><small>${esc(state.why)}</small></p>`
      : state.mode === "test"
        ? "<p role=\"note\"><small>Test mode: no real money moves. Use Stripe’s test card 4242 4242 4242 4242.</small></p>"
        : "";
  const qty = Array.from({ length: MAX_QTY }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  const cards = products.map((pr) => {
    const buy = state.open
      ? `<form method="post" action="${esc(postUrl(ctx, "checkout"))}" style="position:relative;display:flex;gap:.5rem;align-items:end;flex-wrap:wrap"><input type="hidden" name="product" value="${esc(pr.id)}">${formGuards(ctx, p)}<label class="k-field"><span>Qty</span><select name="qty">${qty}</select></label><button class="k-btn k-btn--accent" type="submit">${esc(p.attrs.button || "Buy")}</button></form>`
      : `<button class="k-btn" type="button" disabled>${ctx.preview ? "Buy (preview)" : "Not available yet"}</button>`;
    return `<li style="display:grid;gap:.5rem;align-content:start"><strong>${esc(pr.name)}</strong><span>${esc(money(pr.price, cur))}</span>${pr.description ? `<small>${esc(pr.description)}</small>` : ""}${buy}</li>`;
  });
  return `<div class="k-feat k-feat--checkout">${head}${note}<ul class="k-feat__cards" style="list-style:none;padding:0;display:grid;gap:var(--sp-4,1rem);grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))">${cards.join("")}</ul></div>`;
}

function renderMembers(p: Placeholder, ctx: ExpandCtx): string {
  const act = esc(postUrl(ctx, "members"));
  const ids = `<input type="hidden" name="_id" value="${esc(p.key)}"><input type="hidden" name="_page" value="${esc(ctx.file)}">`;
  if (ctx.member) return `<form class="k-form k-feat k-feat--members" method="post" action="${act}" style="position:relative"><p>Signed in as <strong>${esc(ctx.member.email)}</strong></p>${ids}<input type="hidden" name="_a" value="logout"><button class="k-btn" type="submit">Sign out</button></form>`;
  const gated = p.attrs.gate === "page";
  const pw = (auto: string) => `<label class="k-field"><span>Password</span><input type="password" name="password" minlength="8" maxlength="200" autocomplete="${auto}" required></label>`;
  const em = `<label class="k-field"><span>Email</span><input type="email" name="email" maxlength="190" autocomplete="email" required></label>`;
  const preview = ctx.preview ? `<p><small>Preview: signing up and logging in work once the site is published.${gated ? " On the published site everything else on this page is hidden until a visitor signs in." : ""}</small></p>` : "";
  return `<div class="k-feat k-feat--members">${titleHtml(p, gated ? "Members only" : "Member sign in")}${preview}` +
    `<form class="k-form" method="post" action="${act}" style="position:relative"><p><strong>Log in</strong></p><input type="hidden" name="_a" value="login">${em}${pw("current-password")}${formGuards(ctx, p)}<button class="k-btn k-btn--accent" type="submit">Log in</button></form>` +
    `<form class="k-form" method="post" action="${act}" style="position:relative"><p><strong>Create an account</strong></p><input type="hidden" name="_a" value="signup">${em}${pw("new-password")}${formGuards(ctx, p)}<button class="k-btn" type="submit">Sign up</button><small>At least 8 characters. We don’t send emails to members yet, so there is no password reset: keep your password safe.</small></form></div>`;
}

/** Replace everything inside <main> (or the body) with `box`. Used for members-only pages (the protected content is never sent) and for search results. */
export function replaceMain(html: string, box: string): string {
  const main = /(<main\b[^>]*>)[\s\S]*(<\/main>)/i;
  if (main.test(html)) return html.replace(main, (_m, a: string, z: string) => `${a}${box}${z}`);
  return html.replace(/(<body\b[^>]*>)[\s\S]*(<\/body>)/i, (_m, a: string, z: string) => `${a}${box}${z}`);
}

function renderSearch(p: Placeholder, ctx: ExpandCtx): string {
  const off = ctx.preview;
  return `<form class="k-form k-feat k-feat--search" method="get" action="${esc(`${ctx.base}/_search`)}" role="search">${titleHtml(p, "Search")}<label class="k-field"><span>Search this site</span><input type="search" name="q" maxlength="80" autocomplete="off" required${off ? " disabled" : ""}></label><button class="k-btn k-btn--accent" type="submit"${off ? " disabled" : ""}>${esc(p.attrs.button || "Search")}</button>${off ? "<small>Preview: search works on the published site.</small>" : ""}</form>`;
}

async function renderBlog(p: Placeholder, ctx: ExpandCtx): Promise<string> {
  const posts = (await listPosts(ctx.site, p.key, true)).slice(0, 30);
  const head = titleHtml(p, "Latest posts");
  if (!posts.length) return `<div class="k-feat k-feat--blog">${head}<p>No posts yet.</p></div>`;
  const link = (path: string, text: string) => (ctx.preview ? `<strong>${esc(text)}</strong>` : `<a href="${esc(path)}"><strong>${esc(text)}</strong></a>`);
  return `<div class="k-feat k-feat--blog">${head}${ctx.preview ? "<p><small>Preview: post pages open on the published site.</small></p>" : ""}<ul style="list-style:none;padding:0;display:grid;gap:1.5rem">${posts.map((x) => `<li>${link(`${ctx.base}/_blog/${p.key}/${x.slug}`, x.title)}<div><small>${esc(dateLabel(x.publishedAt))}</small></div>${x.excerpt ? `<p>${esc(x.excerpt)}</p>` : ""}</li>`).join("")}</ul></div>`;
}

function renderEmbed(p: Placeholder): string {
  const e = parseEmbed(p.attrs);
  if (!e) return `<p class="k-feat k-feat--off" role="note"><strong>${esc(p.attrs.title || "This card")}</strong> isn't set up: the link or address is missing or isn't one Keplar supports.</p>`;
  const a = (href: string, text: string, cls = "k-btn k-btn--accent") => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
  return `<div class="k-feat k-feat--embed k-feat--${e.kind}" style="display:grid;gap:.75rem">${e.thumb ? `<img src="${esc(e.thumb)}" alt="" loading="lazy" style="width:100%;max-width:32rem;aspect-ratio:16/9;object-fit:cover;border-radius:.5rem">` : ""}<p class="k-feat__title"><strong>${esc(e.label)}</strong></p><div style="display:flex;gap:.5rem;flex-wrap:wrap">${a(e.href, e.cta)}${e.secondary ? a(e.secondary.href, e.secondary.cta, "k-btn") : ""}</div><small>Opens ${esc(e.provider)} in a new tab.</small></div>`;
}

function notAvailable(p: Placeholder): string {
  const info = featureInfo(p.feature);
  return `<p class="k-feat k-feat--off" role="note"><strong>${esc(info?.label ?? "This feature")}</strong> isn't available yet${info?.status === "soon" ? " (coming soon)" : ""}.</p>`;
}

type Renderer = (p: Placeholder, ctx: ExpandCtx) => string | Promise<string>;
const RENDERERS: Partial<Record<FeatureId, Renderer>> = { form: renderForm, newsletter: renderNewsletter, booking: renderBooking, data: renderData, checkout: renderCheckout, members: renderMembers, search: renderSearch, blog: renderBlog, embeds: renderEmbed };

/** Which features have a real renderer right now. */
export const implemented = (id: FeatureId) => id in RENDERERS;

export async function expandFeatures(html: string, ctx: ExpandCtx): Promise<string> {
  const gate = findPlaceholders(html).find((p) => p.feature === "members" && p.attrs.gate === "page");
  if (gate && !ctx.preview && !ctx.member) html = replaceMain(html, gate.raw);
  const found = findPlaceholders(html).slice(0, 12);
  if (!found.length) return html;
  let out = "";
  let at = 0;
  for (const p of found) {
    out += html.slice(at, p.index);
    const info = featureInfo(p.feature);
    const r = info && info.status !== "soon" ? RENDERERS[p.feature] : undefined;
    out += r ? await r(p, ctx) : notAvailable(p);
    at = p.index + p.raw.length;
  }
  return out + html.slice(at);
}
