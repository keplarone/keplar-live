import type { Metadata } from "next";
import { ChatGPTConnection } from "@/components/business-site/ChatGPTConnection";

export const metadata: Metadata = {
  title: "Connect ChatGPT | Keplar Business",
  description: "Connect your Keplar Business projects, tasks and reports to ChatGPT with your Keplar account.",
  alternates: { canonical: "https://business.keplar.one/chatgpt" },
};

export default function ChatGPTPage() {
  return <ChatGPTConnection />;
}
