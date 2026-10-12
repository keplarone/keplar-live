import { businessLlms } from "@/lib/business/seo";

export const dynamic = "force-static";

/** business.keplar.one/llms.txt: a plain-text guide to Keplar Business for language-model tools, built from the plan table. */
export function GET() {
  return new Response(businessLlms(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600", "x-content-type-options": "nosniff" } });
}
