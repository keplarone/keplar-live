import type { Metadata } from "next";
import { DesktopTitleBar } from "@/components/desktop/DesktopTitleBar";

export const metadata: Metadata = {
  title: { default: "Keplar Business", template: "%s · Keplar Business" },
  applicationName: "Keplar Business",
  robots: { index: false, follow: false },
};

/** The Keplar Business app (business.keplar.one/work): full screen, its own chrome; the desktop title bar when it runs in the desktop app. */
export default function BusinessAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DesktopTitleBar />
      <main id="main" data-business-app="">{children}</main>
    </>
  );
}
