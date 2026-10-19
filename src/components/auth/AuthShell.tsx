import Link from "next/link";
import type { ReactNode } from "react";
import { ScreenCollage } from "./ScreenCollage";
import { BusinessMark } from "@/components/business-site/BusinessMark";
import { BusinessFont, businessFontClass } from "@/components/business-site/font";
import "@/components/business-site/tokens.css";
import s from "./auth.module.css";

type Variant = "signin" | "signup" | "recover";

/**
 * Sign-in and sign-up. The form sits on the left, on the solid canvas. A slow collage of the real product
 * sits on the right on a wide screen, and is hidden on a phone. The Sign up / Sign in links stay a simple pair.
 */
/** Translated chrome for a localized auth page (/es/signin); English pages pass nothing. */
export type AuthShellCopy = { panel: { eyebrow: string; title: string; lead: string }; points: string[]; signUp: string; logIn: string; toggle: string; about: string; prefix: string };

export function AuthShell({ variant, nextQs = "", title, lead, notice, children, copy, brand = "one" }: { variant: Variant; nextQs?: string; title: string; lead?: ReactNode; notice?: string | null; children: ReactNode; copy?: AuthShellCopy; brand?: "one" | "business" }) {
  const prefix = copy?.prefix ?? "";
  // Signing in for Keplar Business (the next step is the Business handoff): the same account and form, in the Business look
  // (tokens.css via data-kb-auth, the Business face for the whole page) with a Business panel instead of Keplar One's screens.
  const business = brand === "business";
  return (
    <div className={business ? `${s.shell} ${businessFontClass}` : s.shell} data-variant={variant} data-brand={brand} data-kb-auth={business || undefined}>
      {business ? <BusinessFont scope="[data-kb-auth]" /> : null}
      <div className={s.formSide}>
        <div className={s.card}>
          {variant !== "recover" ? (
            <nav className={s.toggle} aria-label={copy?.toggle ?? "Sign up or sign in"}>
              <Link href={`${prefix}/signup${nextQs}`} aria-current={variant === "signup" ? "page" : undefined} className={s.toggleItem}>
                {copy?.signUp ?? "Sign up"}
              </Link>
              <Link href={`${prefix}/signin${nextQs}`} aria-current={variant === "signin" ? "page" : undefined} className={s.toggleItem}>
                {copy?.logIn ?? "Sign in"}
              </Link>
            </nav>
          ) : null}
          <header className={s.head}>
            <h1 className={s.title}>{title}</h1>
            {lead ? <p className={s.lead}>{lead}</p> : null}
          </header>
          {notice ? (
            <div className={`${s.alert} ${s.alertErr}`} role="alert">
              {notice}
            </div>
          ) : null}
          {children}
        </div>
      </div>
      {business ? <BusinessPanel /> : <ScreenCollage />}
    </div>
  );
}

/** The wide-screen panel beside the form when signing in for Keplar Business: the mark, what the account opens, and the promise. */
function BusinessPanel() {
  return (
    <aside className={s.bizPanel} aria-label="Keplar Business">
      <div className={s.bizPanelInner}>
        <BusinessMark size={56} />
        <p className={s.bizEyebrow}>Keplar Business</p>
        <p className={s.bizTitle}>Agents do the work. You decide what ships.</p>
        <ul className={s.bizPoints}>
          <li>Your workspace, projects and agents, right where you left them</li>
          <li>Every payment, message and deploy waits for your approval</li>
          <li>One Keplar account for Keplar One and Keplar Business</li>
        </ul>
      </div>
    </aside>
  );
}

/** Message page for a link that can't be used (expired, used, malformed). */
export function LinkProblem({ message, actions }: { message: string; actions: ReactNode }) {
  return (
    <div className={s.form}>
      <div className={`${s.alert} ${s.alertErr}`} role="alert">
        {message}
      </div>
      <div className={s.row}>{actions}</div>
    </div>
  );
}
