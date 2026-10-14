import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { AppLoader } from "@/components/app-ui/AppLoader";
import { pathForView } from "@/components/app-ui/app-paths";
import type { View } from "@/components/app-ui/state/types";

const META: Record<View, { title: string; description: string }> = {
  thread: { title: "Ask Keplar", description: "Ask one question. Keplar consults multiple AI models, investigates where they disagree, and gives you one answer." },
  create: { title: "Create", description: "Build an app, image, video or document with Keplar Create. Preview, edit and publish from your account." },
  projects: { title: "Projects", description: "Keep related Keplar threads together in a project." },
  agents: { title: "Agents", description: "Hand off a task to a Keplar agent." },
  business: { title: "Business", description: "Orders, inbox and approvals for your Keplar business workspace." },
  deployments: { title: "Deployments", description: "Sites you have published with Keplar Create." },
  approvals: { title: "Approvals", description: "Review outbound actions your Keplar agents want to take." },
  slides: { title: "Slides", description: "Make a slideshow with Keplar." },
  study: { title: "Study", description: "Study with Keplar: flashcards, quizzes and notes." },
  history: { title: "All chats", description: "Every Keplar chat you have saved." },
  studio: { title: "Keplar Studio", description: "Build in Roblox Studio or Blender with Keplar from the desktop app." },
};

export function tabMeta(view: View): Metadata {
  const m = META[view];
  return pageMeta(pathForView(view), m.title, m.description, { absoluteTitle: view === "thread" });
}

export function TabPage({ view }: { view: View }) {
  return <AppLoader initialView={view} />;
}
