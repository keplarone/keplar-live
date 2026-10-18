import { pageMeta } from "@/lib/seo";
import { AccountSettings } from "@/components/account/AccountSettings";

export const metadata = pageMeta("/account", "Settings", "Your Keplar account and settings.");
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ checkout?: string; status?: string }> };

/** Direct visits, reloads and deep links (/account#memory). From inside the app, the same Settings opens as a dialog instead (src/app/app/@modal). */
export default async function AccountPage({ searchParams }: Props) {
  const { checkout, status } = await searchParams;
  return <AccountSettings mode="page" checkout={checkout} payStatus={status} />;
}
