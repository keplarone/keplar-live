import { Journey } from "@/components/simulation/Journey";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta("/simulation", "How Keplar Works: Interactive Walkthrough", "A guided, pre-written walkthrough of one question becoming one answer: routing, independent answers, disagreement, verification and synthesis.", { noindex: true });

// The marketing layout already provides the page main landmark (id "main"); a second one here nested two of them with the same id.
export default function Page() {
  return <Journey />;
}
