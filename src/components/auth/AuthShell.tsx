import Link from "next/link";
import type { ReactNode } from "react";
import s from "./auth.module.css";

type Variant = "signin" | "signup" | "recover";

const PANEL: Record<Variant, { eyebrow: string; title: string; lead: string }> = {
  signin: { eyebrow: "Welcome back", title: "Pick up where you left off.", lead: "Your threads, projects and plan are waiting, on every device you sign in on." },
  signup: { eyebrow: "Free account", title: "Stop trusting one AI.", lead: "Free runs on free open models, and you can upgrade any time." },
  recover: { eyebrow: "Keplar", title: "One question. Multiple intelligences. One answer.", lead: "Your account, your chats, kept separate from everyone else's." },
};
const POINTS = ["Asks the models your question needs", "Shows you where they disagree", "One answer, with the disagreements shown"];

/**
 * One calm layout on the plain canvas (docs/ui-v2.md): a short statement on the left and the form card on the right (desktop);
 * one column on phones, where the statement is hidden. The Sign up / Sign in links are drawn as a segmented control.
 */
/** Translated chrome for a localized auth page (/es/signin); English pages pass nothing. */
export type AuthShellCopy = { panel: { eyebrow: string; title: string; lead: string }; points: string[]; signUp: string; logIn: string; toggle: string; about: string; prefix: string };

export function AuthShell({ variant, nextQs = "", title, lead, notice, children, copy }: { variant: Variant; nextQs?: string; title: string; lead?: ReactNode; notice?: string | null; children: ReactNode; copy?: AuthShellCopy }) {
  const p = copy?.panel ?? PANEL[variant];
  const points = copy?.points ?? POINTS;
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
      <aside className={s.panel} aria-label={copy?.about ?? "About Keplar"}>
        <div className={s.panelInner}>
          <p className={s.eyebrow}>{p.eyebrow}</p>
          <p className={s.panelTitle}>{p.title}</p>
          <p className={s.panelLead}>{p.lead}</p>
          <ul className={s.points}>
            {points.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </aside>
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
