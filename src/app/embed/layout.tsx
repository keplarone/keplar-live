import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Keplar Ask",
};

/** Minimal chrome-free shell so other sites can iframe Ask. */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
    <style>{"html,body{overflow:hidden!important;background:transparent!important}"}</style>
    <div data-embed-shell="" style={{ position: "fixed", inset: 0, zIndex: 2147483000, overflow: "hidden", background: "var(--o-canvas)", color: "var(--o-ink)", fontFamily: "var(--o-font-sans)", margin: 0 }}>
      {children}
    </div>
    </>
  );
}
