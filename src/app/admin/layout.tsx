import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

/** Admin is monitoring + controls only: no marketing chrome, no spatial effects, no indexing. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <main id="main">{children}</main>;
}
