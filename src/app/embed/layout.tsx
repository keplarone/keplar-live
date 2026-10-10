import type { Metadata } from "next";
import { THEME_COLORS } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Keplar Ask",
  robots: { index: false, follow: false },
};

/** Minimal chrome-free shell so other sites can iframe Ask. */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
    <style>{"html,body{overflow:hidden!important;background:transparent!important}"}</style>
    <div data-embed-shell="" style={{ position: "fixed", inset: 0, zIndex: 2147483000, overflow: "hidden", background: THEME_COLORS.dark, color: "#e8e8ea", margin: 0 }}>
      {children}
    </div>
    </>
  );
}
