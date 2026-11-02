import { AccountSettings } from "@/components/account/AccountSettings";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ checkout?: string; status?: string }> };

/**
 * Intercepts soft navigations from the home chat (/) to /account and shows Settings as a dialog over the chat, the same one
 * /app/* shows (src/app/app/@modal/(..)account). Direct visits and reloads of /account still get the full page.
 */
export default async function SettingsModal({ searchParams }: Props) {
  const { checkout, status } = await searchParams;
  return <AccountSettings mode="modal" checkout={checkout} payStatus={status} />;
}
