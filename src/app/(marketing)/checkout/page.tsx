import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { getSession } from "@/lib/accounts/auth";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { embedPlanId, isPaidPlan, PAID_PLANS } from "@/lib/billing/plans";
import { embedMetadata } from "@/lib/billing/embed";
import { baseUrl, whopCheckoutConfigured } from "@/lib/billing/whop";
import { CheckoutStart } from "@/components/billing/CheckoutStart";
import s from "@/components/account/account.module.css";

export const metadata = pageMeta("/checkout", "Checkout", "Upgrade your Keplar plan.", { noindex: true });
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ plan?: string }> };
const RANK = { free: 0, lite: 1, plus: 2, pro: 3, business: 4 } as const;

/**
 * /checkout?plan=lite|plus|pro. Signed-out visitors go to sign in (with this page as the
 * destination), then straight into Whop checkout for the plan they chose.
 */
export default async function CheckoutPage({ searchParams }: Props) {
  const { plan } = await searchParams;
  if (!isPaidPlan(plan)) redirect("/pricing");
  // Keplar Lite is sold only once its Whop plan id is configured (WHOP_PLAN_LITE); until then there is no checkout.
  if (plan === "lite" && !embedPlanId("lite")) redirect("/pricing");
  const h = await headers();
  if (!(await getSession(h))) redirect(`/signin?next=${encodeURIComponent(`/checkout?plan=${plan}`)}`);
  const ws = await currentWorkspace(new Request("http://internal/checkout", { headers: h }));
  const p = PAID_PLANS[plan];
  // Embedded checkout: the plan id decides what is sold; the signed email tells the webhook whose account to upgrade.
  const planId = embedPlanId(plan);
  const embed = planId && ws.email ? { planId, metadata: embedMetadata({ email: ws.email, plan, workspaceId: ws.id }), returnUrl: `${baseUrl(new URL(h.get("origin") ?? `https://${h.get("host") ?? "keplar.one"}`).origin)}/account?checkout=success` } : null;
  const already = !ws.admin && RANK[ws.plan] >= RANK[plan];
  return (
    <section className={s.page}>
      <div className={s.card}>
        <p className={s.eyebrow}>Upgrade</p>
        <h1 className={s.title}>{p.name}</h1>
        {ws.admin ? (
          <p className={s.lead}>Admin accounts don&rsquo;t need a plan. <Link className={s.link} href="/account">Back to account</Link></p>
        ) : already ? (
          <p className={s.lead}>You&rsquo;re already on {ws.entitlements.label}. <Link className={s.link} href="/account">Manage plan</Link></p>
        ) : (
          <CheckoutStart plan={plan} name={p.name} price={p.usdMonthly} ready={whopCheckoutConfigured()} embed={embed} />
        )}
      </div>
    </section>
  );
}
