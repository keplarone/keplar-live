import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { LegalPage } from "@/components/legal/LegalPage";
import { terms } from "@/components/legal/content/terms";

export const metadata: Metadata = pageMeta("/terms", "Terms of Service", "The terms that govern your use of Keplar: accounts, plans and billing, acceptable use, your content, and the limits of AI-generated answers.");

export default function TermsPage() {
  return <LegalPage doc={terms} sibling={{ href: "/privacy", label: "Privacy at Keplar" }} />;
}
