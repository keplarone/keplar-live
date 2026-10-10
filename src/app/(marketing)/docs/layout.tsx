import type { Viewport } from "next";
import type { ReactNode } from "react";
import { DocsSkin } from "@/components/kb/DocsSkin";
import "@/styles/docs-theme.css";

/**
 * Docs segment (keplar.one/docs and docs.keplar.one): light theme over the shared aura backdrop (src/styles/docs-theme.css) and its own favicon
 * (icon.svg / icon.png / apple-icon.png in this folder: the Keplar mark in white on a blue tile; docs.keplar.one/favicon.ico is
 * public/icons/docs-favicon.ico via src/proxy.ts). The main site keeps its graphite dark default and its own icons.
 */
export const viewport: Viewport = {
  themeColor: "#f7f8fa",
  colorScheme: "light",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DocsSkin />
      {children}
    </>
  );
}
