import { Journey } from "@/components/simulation/Journey";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta("/simulation", "How Keplar works: a simulation", "A scripted, clearly labelled walkthrough: one question, several models, a disagreement, a check and one answer, then an idea becoming a site and an agent that waits for approval. Pre-written sample content; no model is called.");

// The marketing layout already provides the page main landmark (id "main"); a second one here nested two of them with the same id.
export default function Page() {
  return <Journey />;
}
