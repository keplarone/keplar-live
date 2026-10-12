import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin" };

/** Admin is monitoring + controls only: no marketing chrome, no spatial effects, no indexing. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <main id="main">{children}</main>;
}
