"use client";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { usePlan } from "./usePlan";

type Props = { plan: "free" | "lite" | "plus" | "pro"; label: string; href: string; primary?: boolean };

/**
 * Plan button for the pricing grid. Plus/Pro go to /checkout (which sends signed-out
 * visitors to sign in and then straight to Whop). Your own plan reads "Your plan".
 */
export function PlanCta({ plan, label, href, primary }: Props) {
  const me = usePlan();
  if (me.ready && me.signedIn && me.plan === plan && !me.admin) { // signed-out visitors keep "Try Keplar" on the Free card
    return plan === "free" ? (
      <ButtonLink href="/app" variant="secondary" magnetic={false}>Open Keplar</ButtonLink>
    ) : (
      <ButtonLink href="/account" variant="secondary" magnetic={false}>Your plan · Manage</ButtonLink>
    );
  }
  if (plan !== "free" && me.ready && (!me.checkout || (plan === "lite" && !me.liteCheckout))) {
    return (
      <span role="status" style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 var(--s-5)", borderRadius: "var(--r-pill)", boxShadow: "inset 0 0 0 var(--b-hairline) var(--c-border-strong)", color: "var(--c-ink-2)", fontSize: "var(--t-small)" }}>
        Checkout opens soon
      </span>
    );
  }
  const higher = { free: 0, lite: 1, plus: 2, pro: 3, business: 4 };
  if (plan !== "free" && me.ready && !me.admin && higher[me.plan] > higher[plan]) {
    return <Link href="/account" style={{ color: "var(--c-ink-2)", fontSize: "var(--t-small)", textDecoration: "underline", textUnderlineOffset: 3 }}>Included in your {me.plan === "pro" ? "Pro" : me.plan === "plus" ? "Plus" : "Business"} plan</Link>;
  }
  return (
    <ButtonLink href={href} variant={primary ? "primary" : "secondary"} arrow={primary} magnetic={false} onClick={() => track("plan_click", { plan })}>
      {label}
    </ButtonLink>
  );
}
