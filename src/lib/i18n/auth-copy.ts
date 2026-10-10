import type { AuthShellCopy } from "@/components/auth/AuthShell";
import type { MarketingMessages } from "./types";
import { localizedPath } from "./routing";

/** AuthShell chrome for a localized sign-in / sign-up page. */
export function authShellCopy(a: MarketingMessages["auth"], variant: "signin" | "signup", locale: string): AuthShellCopy {
  return { panel: a.panel[variant], points: a.points, signUp: a.signUp, logIn: a.logIn, toggle: a.toggle, about: a.about, prefix: localizedPath("/", locale).replace(/\/$/, "") };
}
