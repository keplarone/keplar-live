/**
 * GET /api/faq -> { items: [{ text, people?, kind: "pinned" | "frequent" | "starter" }], minPeople }
 * The "Most frequently asked" list on the home screen. Public (it holds no personal data): the pinned question, then questions that
 * at least `minPeople` different opted-in people asked (a daily snapshot, see src/lib/faq/repo.ts), then generic starters only to fill the list.
 */
import { json } from "@/lib/create/platform/http";
import { FAQ_MIN_USERS } from "@/lib/faq/normalize";
import { faqList } from "@/lib/faq/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await faqList();
  return json({ items, minPeople: FAQ_MIN_USERS }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
