import { ChatHome } from "@/components/app-ui/ChatHome";
import { localeAlternates } from "@/lib/i18n/routing";
import { site } from "@/lib/site";
import type { Metadata } from "next";

// Homepage description kept under ~160 characters so it is not cut off in results.
export const metadata: Metadata = {
  description: `${site.name} sends your question to multiple AI models, finds where they disagree, verifies, and gives you one synthesized answer. Free to try, no signup.`,
  alternates: localeAlternates("/", "en"),
};

/** Visiting keplar.one opens the chat. Signed-out visitors can ask on the free tier; signed-in visitors get their account. */
export default function Home() {
  return <ChatHome />;
}
