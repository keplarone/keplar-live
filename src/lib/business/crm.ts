/** Leads → CRM: contacts, deals, activity, inbox. */
import { id, now } from "@/lib/create/platform/ids";
import { HttpError } from "@/lib/create/platform/http";
import { activities, audit, contacts, deals, inbox, logActivity } from "./repo";
import type { Contact, Deal, DealStage } from "./types";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export async function upsertContact(workspaceId: string, input: { name?: string; email: string; source: Contact["source"]; projectId?: string | null }) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, "Enter a valid email address.");
  const existing = (await contacts().list(workspaceId, (c) => c.email === email))[0];
  if (existing) return existing;
  const c: Contact = {
    id: id("con"),
    workspaceId,
    name: (input.name ?? "").trim().slice(0, 120) || email.split("@")[0],
    email,
    source: input.source,
    projectId: input.projectId ?? null,
    tags: [],
    createdAt: now(),
    lastActivityAt: now(),
  };
  await contacts().insert(c);
  return c;
}

/** A site's contact form submission: contact + activity + inbox message + a "new" deal. */
export async function recordFormSubmission(workspaceId: string, projectId: string, siteName: string, fields: { name?: string; email: string; message?: string }) {
  const contact = await upsertContact(workspaceId, { name: fields.name, email: fields.email, source: "form", projectId });
  const message = (fields.message ?? "").trim().slice(0, 5000);
  await logActivity(workspaceId, contact.id, "form_submitted", `Contact form on ${siteName}`, projectId);
  await inbox().insert({
    id: id("msg"),
    workspaceId,
    channel: "form",
    direction: "in",
    from: `${contact.name} <${contact.email}>`,
    to: siteName,
    subject: `New message from ${siteName}`,
    body: message || "(no message)",
    contactId: contact.id,
    read: false,
    mock: false,
    at: now(),
  });
  const openDeal = (await deals().list(workspaceId, (d) => d.contactId === contact.id && d.stage !== "won" && d.stage !== "lost"))[0];
  if (!openDeal) {
    await deals().insert({ id: id("deal"), workspaceId, contactId: contact.id, title: `${contact.name} — inquiry`, value: 0, currency: "usd", stage: "new", createdAt: now(), updatedAt: now() });
  }
  await audit(workspaceId, "public", "form.submitted", projectId, contact.email);
  return contact;
}

export async function listCrm(workspaceId: string) {
  const [cs, ds, acts] = await Promise.all([contacts().list(workspaceId), deals().list(workspaceId), activities().list(workspaceId)]);
  return {
    contacts: cs.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)),
    deals: ds.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    activities: acts.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100),
  };
}

const STAGES: DealStage[] = ["new", "qualified", "proposal", "won", "lost"];
export async function updateDeal(workspaceId: string, dealId: string, patch: { stage?: DealStage; value?: number; title?: string }) {
  const deal = await deals().get(workspaceId, dealId);
  if (!deal) throw new HttpError(404, "Deal not found.");
  const next: Partial<Deal> = { updatedAt: now() };
  if (patch.stage) {
    if (!STAGES.includes(patch.stage)) throw new HttpError(400, "Unknown stage.");
    next.stage = patch.stage;
  }
  if (typeof patch.value === "number" && patch.value >= 0) next.value = Math.round(patch.value);
  if (patch.title) next.title = patch.title.slice(0, 160);
  const updated = await deals().update(workspaceId, dealId, next);
  if (patch.stage && patch.stage !== deal.stage) await logActivity(workspaceId, deal.contactId, "deal_stage", `${deal.title}: ${deal.stage} → ${patch.stage}`, deal.id);
  return updated;
}

export async function listInbox(workspaceId: string) {
  return (await inbox().list(workspaceId)).sort((a, b) => b.at.localeCompare(a.at));
}
