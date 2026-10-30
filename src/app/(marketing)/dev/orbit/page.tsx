import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { devToolsEnabled } from "@/lib/accounts/outbox";
import { OrbitShowcase } from "@/components/orbit/Showcase";

export const metadata = pageMeta("/dev/orbit", "Keplar Orbit", "Development showcase of the Keplar Orbit interface system.");
export const dynamic = "force-dynamic";

/** Dev-only living reference for docs/design/keplar-orbit.md: tokens, controls in every state, shell pieces. 404 unless KEPLAR_DEV_TOOLS=1. */
export default function OrbitPage() {
  if (!devToolsEnabled()) notFound();
  return <OrbitShowcase />;
}
