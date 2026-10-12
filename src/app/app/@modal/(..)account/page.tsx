import { AccountSettings } from "@/components/account/AccountSettings";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ checkout?: string; status?: string }> };

/** Intercepts soft navigations from the app to /account and shows Settings as a dialog over the current view. */
export default async function SettingsModal({ searchParams }: Props) {
  const { checkout, status } = await searchParams;
  return <AccountSettings mode="modal" checkout={checkout} payStatus={status} />;
}
