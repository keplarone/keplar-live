import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/accounts/auth";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { getOnboarding } from "@/lib/onboarding/store";
import { afterWelcomePath, needsWelcome, welcomePath } from "@/lib/onboarding/model";
import { payloadFor } from "@/lib/onboarding/service";
import { Onboarding } from "@/components/onboarding/Onboarding";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string }> };

/**
 * Where every sign-in can land (password, magic link, Google, Microsoft). New accounts see the onboarding; everyone else
 * is passed straight on to `next` with a redirect, so existing accounts never see it and it never blocks /app.
 */
export default async function WelcomePage({ searchParams }: Props) {
  const { next: rawNext } = await searchParams;
  const next = afterWelcomePath(rawNext);
  const h = await headers();
  const session = await getSession(h);
  if (!session) redirect(`/signin?next=${encodeURIComponent(welcomePath(next))}`);
  const state = await getOnboarding(session.user.id);
  if (!needsWelcome(state)) redirect(next);
  const ws = await currentWorkspace(new Request("http://internal/welcome", { headers: h }));
  const accountName = (session.user.name ?? "").trim();
  return <Onboarding initial={await payloadFor(ws, state, state.answers.name || accountName)} next={next} accountName={accountName} />;
}
