import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { devToolsEnabled } from "@/lib/accounts/outbox";
import { SpaceUiShowcase } from "@/components/ui/space/Showcase";

export const metadata = pageMeta("/dev/space-ui", "Space UI", "Development showcase of the Space UI components.");
export const dynamic = "force-dynamic";

/** Dev-only living reference for docs/design/space-ui.md: every Space UI component and motion. 404 unless KEPLAR_DEV_TOOLS=1. */
export default function SpaceUiPage() {
  if (!devToolsEnabled()) notFound();
  return <SpaceUiShowcase />;
}
