import type { Metadata } from "next";
import { LiveStudio } from "@/components/create/advanced/LiveStudio";

export const metadata: Metadata = { title: "Live session · Keplar Create" };

/** A live session of one creation: shared editor, terminal and preview, plus its Critic and Deploy. Access is checked by the API. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveStudio siteId={id} />;
}
