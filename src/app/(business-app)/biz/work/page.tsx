import type { Metadata } from "next";
import { BusinessWorkspace } from "@/components/business-app/BusinessWorkspace";

export const metadata: Metadata = { title: "Workspace" };

/** business.keplar.one/work: the Keplar Business workspace (it shows its own sign-in and plan gate). */
export default function WorkPage() {
  return <BusinessWorkspace />;
}
