import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { BrowserTask } from "@/components/browser/BrowserTask";

export const metadata: Metadata = pageMeta("/app/browser", "Keplar Browser", "Keplar works in its own private browser while you watch, and stops before buying, sending or signing in.", { noindex: true });

export default function Page() {
  return <BrowserTask />;
}
