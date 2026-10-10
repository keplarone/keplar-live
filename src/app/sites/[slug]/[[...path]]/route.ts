import { serveLive } from "@/lib/create/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Local stand-in for https://<slug>.keplar.site and verified custom domains.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path } = await params;
  return serveLive(slug, path);
}
