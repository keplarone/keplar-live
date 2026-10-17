import type { Viewport } from "next";
import type { ReactNode } from "react";
import { DocsSkin } from "@/components/kb/DocsSkin";
import "@/styles/docs-theme.css";

/**
 * Docs segment (keplar.one/docs and docs.keplar.one): the same theme as the rest of the site (dark unless chosen otherwise;
 * src/styles/docs-theme.css) and its own favicon (icon.svg / icon.png / apple-icon.png in this folder: the Keplar mark in white
 * on a blue tile; docs.keplar.one/favicon.ico is public/icons/docs-favicon.ico via src/proxy.ts).
 */
export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark light",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DocsSkin />
      {children}
    </>
  );
}
