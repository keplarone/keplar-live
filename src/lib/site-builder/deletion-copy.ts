/**
 * What deleting a Create site removes and what it keeps, in words. One source for the confirm dialog (client) and the API
 * (server) so the screen never promises something the code does not do. No server imports: safe in client components.
 */
export const UNDO_SECONDS = 6;
export const SLUG_HOLD_DAYS = 30;

export type RemovalBlocker = { code: "taken_down" | "open_orders" | "building"; message: string };

export type RemovalImpact = {
  siteId: string;
  name: string;
  slug: string;
  published: boolean;
  versions: number;
  leads: number;
  /** Uploaded / imported product images stored for this site. */
  assets: number;
  /** Custom domains connected to this site. */
  domains: string[];
  /** Pictures made in chat that this site uses (they stay in the library). */
  libraryImages: number;
  blockers: RemovalBlocker[];
};

const n = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

export function removalSummary(i: RemovalImpact): { removed: string[]; kept: string[] } {
  const removed: string[] = [];
  removed.push(i.versions > 0 ? `The draft and its ${n(i.versions, "saved version")}, including every page and style.` : "The draft (nothing has been built yet).");
  removed.push(i.published ? `The published page at /s/${i.slug}. It goes offline right away and shows “removed” (410) to visitors.` : `Its address /s/${i.slug}, which was never published.`);
  if (i.assets > 0) removed.push(`${n(i.assets, "uploaded product image")} stored for this site.`);
  if (i.domains.length > 0) removed.push(`The custom domain connection (${i.domains.join(", ")}). It is detached from hosting; you keep the domain itself.`);
  removed.push(i.leads > 0 ? `${n(i.leads, "form message")} received through the site. Download the CSV first if you want a copy.` : "Form messages received through the site (none so far).");
  const kept: string[] = [];
  if (i.libraryImages > 0) kept.push(`${n(i.libraryImages, "image")} you made stay in your library; this site just stops using them.`);
  else kept.push("Images you made stay in your library.");
  kept.push("Orders and payments: Create sites don't take payments, so none are removed here. Any Business orders and customer records stay in Business.");
  kept.push("Abuse-report records, if there are any, are kept for safety review.");
  kept.push(`The address /s/${i.slug} is reserved for you for ${SLUG_HOLD_DAYS} days, then anyone can use it.`);
  return { removed, kept };
}
