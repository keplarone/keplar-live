import type { Viewport } from "next";
import type { ReactNode } from "react";
import { DocsSkin } from "@/components/kb/DocsSkin";

/**
 * Docs segment (keplar.one/docs and docs.keplar.one): the same graphite surface as the rest of the site, and its own favicon
 * (icon.svg / icon.png / apple-icon.png in this folder: the Keplar mark in white on a blue tile; docs.keplar.one/favicon.ico is
 * public/icons/docs-favicon.ico via src/proxy.ts).
 */
export const viewport: Viewport = {
  themeColor: "#212121",
  colorScheme: "dark",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DocsSkin />
      {children}
    </>
  );
}
