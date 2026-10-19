import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";

export const metadata: Metadata = { title: "Admin" };

/**
 * Admin is monitoring + controls only: no marketing chrome, no spatial effects, no indexing. Every page also checks the admin
 * itself; this layout check means a new page that forgets to cannot render for anyone else.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await adminFromHeaders(await headers()))) notFound();
  return <main id="main">{children}</main>;
}
