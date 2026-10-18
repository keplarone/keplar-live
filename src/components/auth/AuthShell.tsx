import Link from "next/link";
import type { ReactNode } from "react";
import { ScreenCollage } from "./ScreenCollage";
import s from "./auth.module.css";

type Variant = "signin" | "signup" | "recover";

/**
 * Sign-in and sign-up. The form sits on the left, on the solid canvas. A slow collage of the real product
 * sits on the right on a wide screen, and is hidden on a phone. The Sign up / Sign in links stay a simple pair.
 */
/** Translated chrome for a localized auth page (/es/signin); English pages pass nothing. */
export type AuthShellCopy = { panel: { eyebrow: string; title: string; lead: string }; points: string[]; signUp: string; logIn: string; toggle: string; about: string; prefix: string };

export function AuthShell({ variant, nextQs = "", title, lead, notice, children, copy }: { variant: Variant; nextQs?: string; title: string; lead?: ReactNode; notice?: string | null; children: ReactNode; copy?: AuthShellCopy }) {
  const prefix = copy?.prefix ?? "";
  return (
    <div className={s.shell} data-variant={variant}>
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
      <ScreenCollage />
    </div>
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
