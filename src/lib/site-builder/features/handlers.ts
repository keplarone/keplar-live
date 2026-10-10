/** Public POST handlers for site features. Each one checks the submission against the placeholder the published version really contains. */
import { sendEmail } from "@/lib/accounts/outbox";
import { getWorkspace } from "@/lib/accounts/workspaces";
import { recordFormSubmission, upsertContact } from "@/lib/business/crm";
import { contacts } from "@/lib/business/repo";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { id as newId, now } from "@/lib/create/platform/ids";
import { orders } from "@/lib/business/repo";
import { applicationFee, createCheckoutSession, getAccount, stripeMode } from "@/lib/business/stripe";
import { HttpError } from "@/lib/create/platform/http";
import { saveLead } from "../store";
import type { Site } from "../types";
import { createHash } from "node:crypto";
import { featureInfo, type FeatureId } from "./catalog";
import { freeSlots, parseAvailability, whenLabel } from "./booking";
import { addRecord, listRecords } from "./records";
import { liveHref } from "../render";
import { currencyOf, MAX_QTY, parseProducts, payState, withinLimits } from "./checkout";
import { checkLogin, createMember, MAX_MEMBERS, memberKey, MIN_PASSWORD, issueSession, setCookie } from "./members";
import { findIn } from "./placeholders";
import { checkToken, linkSpam } from "./spam";

export type FeatureResult =
  | { kind: "ok"; thanks: FeatureId; ref?: string }
  /** The submission looked like a bot: answer like success, save nothing. */
  /** Members: set or clear the session cookie, then go to `to` (a path on this site). */
  | { kind: "session"; cookie: string; to: string }
  /** Checkout: send the visitor to the Stripe-hosted page. */
  | { kind: "redirect"; url: string }
  | { kind: "pretend"; thanks: FeatureId; ref?: undefined }
  | { kind: "fail"; status: number; message: string };

type In = { feature: FeatureId; form: Record<string, string>; site: Site; files: Record<string, string>; origin?: string; base?: string };
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const fail = (status: number, message: string): FeatureResult => ({ kind: "fail", status, message });

/** Checks shared by every feature form: placeholder exists, honeypot, signed token. Returns a result to stop, or the placeholder to go on. */
export function gate(i: In) {
  const info = featureInfo(i.feature);
  if (!info || info.status === "soon") return { stop: fail(404, "This feature isn't available.") };
  const hit = findIn(i.files, i.feature, i.form._id ?? "");
  if (!hit) return { stop: fail(404, "That form isn't on this site any more. Reload the page.") };
  if ((i.form._hp ?? "").trim()) return { stop: { kind: "pretend", thanks: i.feature } as FeatureResult };
  const t = checkToken(i.form._t, i.site.id);
  if (t === "too-fast") return { stop: { kind: "pretend", thanks: i.feature } as FeatureResult };
  if (t !== "ok") return { stop: fail(400, "This form expired. Reload the page and try again.") };
  return { hit };
}

const clean = (v: string | undefined, n = 2000) => (v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);

async function formSubmit(i: In): Promise<FeatureResult> {
  const g = gate(i);
  if ("stop" in g && g.stop) return g.stop;
  const { placeholder, file } = g.hit!;
  const declared = (placeholder.attrs.fields || "name,email,message").split(",");
  const fields: Record<string, string> = {};
  for (const f of declared) {
    const v = clean(i.form[f]);
    if (v) fields[f] = v;
  }
  if (declared.includes("email") && !EMAIL.test(fields.email ?? "")) return fail(400, "Please enter a valid email address.");
  if (!Object.keys(fields).length) return fail(400, "Please fill in the form.");
  if (linkSpam(Object.values(fields))) return { kind: "pretend", thanks: "form" };
  const ws = await getWorkspace(i.site.workspaceId);
  const saved = await saveLead(i.site, ws?.plan ?? "free", { page: file, fields });
  if (!saved) return fail(429, "This form can't take more messages right now. Please contact the site owner another way.");
  if (fields.email) await recordFormSubmission(i.site.workspaceId, i.site.id, i.site.name, { name: fields.name, email: fields.email, message: fields.message }).catch((e) => console.error("[features] crm", e instanceof Error ? e.message : e));
  await notifyOwner(i.site, ws?.ownerEmail ?? null, `New message on ${i.site.name}`, fields);
  return { kind: "ok", thanks: "form" };
}

async function newsletterSubmit(i: In): Promise<FeatureResult> {
  const g = gate(i);
  if ("stop" in g && g.stop) return g.stop;
  const { placeholder } = g.hit!;
  const email = clean(i.form.email, 190).toLowerCase();
  if (!EMAIL.test(email)) return fail(400, "Please enter a valid email address.");
  const name = (placeholder.attrs.fields || "").split(",").includes("name") ? clean(i.form.name, 120) : "";
  // one row per address per signup box: signing up twice is not an error and not a second row
  const rowId = `rec_${i.site.id}_nl_${placeholder.key}_${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
  const { inserted } = await addRecord({ id: rowId, workspaceId: i.site.workspaceId, siteId: i.site.id, feature: "newsletter", key: placeholder.key, data: { email, ...(name ? { name } : {}), kind: placeholder.attrs.kind || "newsletter" }, status: "subscribed" });
  if (inserted) {
    const c = await upsertContact(i.site.workspaceId, { name, email, source: "form", projectId: i.site.id }).catch(() => null);
    if (c && !c.tags.includes(placeholder.attrs.kind || "newsletter")) await contacts().update(i.site.workspaceId, c.id, { tags: [...c.tags, placeholder.attrs.kind || "newsletter"].slice(0, 20) });
    const ws = await getWorkspace(i.site.workspaceId);
    await notifyOwner(i.site, ws?.ownerEmail ?? null, `New ${placeholder.attrs.kind === "waitlist" ? "waitlist" : "newsletter"} signup on ${i.site.name}`, { email, ...(name ? { name } : {}) });
  }
  return { kind: "ok", thanks: "newsletter" };
}

async function bookingSubmit(i: In): Promise<FeatureResult> {
  const g = gate(i);
  if ("stop" in g && g.stop) return g.stop;
  const { placeholder } = g.hit!;
  const name = clean(i.form.name, 120);
  const email = clean(i.form.email, 190).toLowerCase();
  const note = clean(i.form.message, 1000);
  if (!name) return fail(400, "Please enter your name.");
  if (!EMAIL.test(email)) return fail(400, "Please enter a valid email address.");
  if (linkSpam([name, note])) return { kind: "pretend", thanks: "booking" };
  const a = parseAvailability(placeholder.attrs);
  const mine = await listRecords(i.site.workspaceId, i.site.id, "booking", placeholder.key);
  const confirmed = mine.filter((r) => r.status === "confirmed");
  const start = clean(i.form.slot, 40);
  const open = freeSlots(a, Date.now(), new Set(confirmed.map((r) => r.data.start)));
  const taken = "That time isn't available (any more). Go back, reload the page and pick another time.";
  if (!open.some((s) => s.iso === start)) return fail(409, taken);
  const upcoming = confirmed.filter((r) => r.data.email === email && r.data.start > new Date().toISOString());
  if (upcoming.length >= 3) return fail(429, "You already have three upcoming bookings here. Please contact the site owner to change them.");
  const rowId = `rec_${i.site.id}_bk_${placeholder.key}_${start.replace(/\D/g, "")}`;
  const { inserted } = await addRecord({ id: rowId, workspaceId: i.site.workspaceId, siteId: i.site.id, feature: "booking", key: placeholder.key, data: { name, email, note, start, tz: a.tz }, status: "confirmed" });
  if (!inserted) return fail(409, taken); // somebody booked the same slot at the same moment
  const when = whenLabel(start, a.tz);
  await recordFormSubmission(i.site.workspaceId, i.site.id, i.site.name, { name, email, message: `Booking: ${when}${note ? `\n${note}` : ""}` }).catch((e) => console.error("[features] crm", e instanceof Error ? e.message : e));
  const ws = await getWorkspace(i.site.workspaceId);
  await notifyOwner(i.site, ws?.ownerEmail ?? null, `New booking on ${i.site.name}: ${when}`, { name, email, when, ...(note ? { note } : {}) });
  if (i.site.featureSettings?.confirmVisitors) {
    try {
      await rateLimit(`feat:vmail:${i.site.id}`, 30, 86_400, { shared: true });
      await sendEmail({ to: email, subject: `Your booking with ${i.site.name}`, text: `Hi ${name},\n\nYour booking is confirmed for ${when}.\n\nIf you need to change it, please contact ${i.site.name} directly.`, kind: "site-booking-confirm" });
    } catch { /* over the daily cap: the on-page confirmation still shows */ }
  }
  return { kind: "ok", thanks: "booking", ref: rowId };
}

/** Where to land after sign-in: the page the form was on, only if it is really a page of this site. */
function landing(i: In): string {
  const f = (i.form._page ?? "").replace(/^\//, "");
  return liveHref(i.site.slug, Object.hasOwn(i.files, f) && f.endsWith(".html") ? f : "index.html", i.base ?? `/s/${i.site.slug}`);
}

async function membersSubmit(i: In): Promise<FeatureResult> {
  const secure = (i.origin ?? "").startsWith("https:");
  const action = i.form._a;
  if (action === "logout") {
    if (!findIn(i.files, "members", i.form._id ?? "")) return fail(404, "That form isn't on this site any more. Reload the page.");
    return { kind: "session", cookie: setCookie(i.site, i.base ?? "", null, secure), to: landing(i) };
  }
  if (action !== "login" && action !== "signup") return fail(400, "Unknown request.");
  const g = gate(i);
  if ("stop" in g && g.stop) return g.stop;
  const email = clean(i.form.email, 190).toLowerCase();
  const password = (i.form.password ?? "").slice(0, 200);
  if (!EMAIL.test(email)) return fail(400, "Please enter a valid email address.");
  if (action === "login") {
    await rateLimit(`feat:login:${i.site.id}:${email}`, 8, 900, { shared: true });
    const rid = await checkLogin(i.site, email, password);
    if (!rid) return fail(401, "That email and password don't match an account here.");
    return { kind: "session", cookie: setCookie(i.site, i.base ?? "", issueSession(i.site, rid), secure), to: landing(i) };
  }
  if (password.length < MIN_PASSWORD) return fail(400, `Choose a password of at least ${MIN_PASSWORD} characters.`);
  await rateLimit(`feat:signup:${i.site.id}`, 100, 86_400, { shared: true });
  if ((await listRecords(i.site.workspaceId, i.site.id, "members", memberKey)).length >= MAX_MEMBERS) return fail(429, "This site can't take more sign-ups right now.");
  const { id, inserted } = await createMember(i.site, email, password, clean(i.form.name, 120));
  if (!inserted) return fail(409, "Couldn't create that account. If you already have one, log in instead.");
  await upsertContact(i.site.workspaceId, { name: "", email, source: "form", projectId: i.site.id }).catch(() => null);
  return { kind: "session", cookie: setCookie(i.site, i.base ?? "", issueSession(i.site, id), secure), to: landing(i) };
}

async function checkoutSubmit(i: In): Promise<FeatureResult> {
  const g = gate(i);
  if ("stop" in g && g.stop) return g.stop;
  const { placeholder } = g.hit!;
  const product = parseProducts(placeholder.attrs.products).find((p) => p.id === i.form.product);
  if (!product) return fail(404, "That product isn't sold here any more. Reload the page.");
  const qty = Number(i.form.qty || 1);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return fail(400, `Choose a quantity from 1 to ${MAX_QTY}.`);
  const state = await payState(i.site.workspaceId);
  if (!state.open) return fail(409, state.why);
  const total = product.price * qty; // the price comes from the published page, never from the form
  if (!withinLimits(total)) return fail(400, "That total is outside what can be charged online. Try a smaller quantity.");
  await rateLimit(`feat:checkout:${i.site.id}`, 200, 86_400, { shared: true });
  const acct = await getAccount(i.site.workspaceId);
  if (!acct) return fail(409, "Online ordering isn't switched on yet.");
  const orderId = newId("ord");
  const currency = currencyOf(placeholder.attrs);
  const label = `${product.name}${qty > 1 ? ` × ${qty}` : ""} · ${i.site.name}`.slice(0, 160);
  const returnPath = `${i.base ?? ""}/_thanks?f=checkout&o=${orderId}`;
  let session;
  try {
    session = await createCheckoutSession(acct, { orderId, projectId: i.site.id, productId: product.id, productName: label, amount: total, currency, origin: i.origin ?? "", returnPath });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status >= 500 ? 503 : e.status, e.message);
    throw e;
  }
  await orders().insert({ id: orderId, workspaceId: i.site.workspaceId, projectId: i.site.id, productId: product.id, productName: label, amount: total, currency, applicationFeeAmount: applicationFee(total), status: "pending", checkoutSessionId: session.id, customerEmail: null, contactId: null, returnPath, createdAt: now(), paidAt: null, source: "keplar", stripeAccountId: acct.stripeAccountId, livemode: stripeMode() === "live" });
  return { kind: "redirect", url: session.url };
}

/** Email to the owner about a new submission. Off until the owner turns it on in the Features panel; capped per site per day. */
export async function notifyOwner(site: Site, ownerEmail: string | null, subject: string, fields: Record<string, string>) {
  if (!site.featureSettings?.notifyOwner || !ownerEmail) return;
  try {
    await rateLimit(`feat:mail:${site.id}`, 30, 86_400, { shared: true });
  } catch {
    return;
  }
  const body = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n");
  await sendEmail({ to: ownerEmail, subject, text: `${body}\n\nAll submissions are in your Keplar Create > More > Leads. You turned these emails on; turn them off in More > Features.`, kind: "site-notify" }).catch(() => false);
}

const HANDLERS: Partial<Record<FeatureId, (i: In) => Promise<FeatureResult>>> = { form: formSubmit, newsletter: newsletterSubmit, booking: bookingSubmit, checkout: checkoutSubmit, members: membersSubmit };

export async function handleFeature(i: In): Promise<FeatureResult> {
  const h = HANDLERS[i.feature];
  if (!h) return fail(404, "This feature isn't available.");
  return h(i);
}
