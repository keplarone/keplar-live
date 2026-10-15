import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { KeplarWantsTab } from "@/components/wants/KeplarWantsTab";

export const metadata: Metadata = pageMeta(
  "/app/wants",
  "Keplar Wants",
  "Tell Keplar what you want. It asks a question, waits for your PIN, and only then runs a sandboxed dry-run or a connected gateway.",
);

export default function Page() {
  return <KeplarWantsTab />;
}
