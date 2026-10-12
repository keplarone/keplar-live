"use client";
import { useState } from "react";
import { welcomePath } from "@/lib/onboarding/model";
import { authClient } from "@/components/account/auth-client";
import s from "./auth.module.css";
import { useClientText } from "@/lib/i18n/client";

export type OAuthFlags = { google: boolean; microsoft: boolean };

/** "Remember me" for OAuth: the callback runs on a different request, so the choice rides in a short-lived cookie. */
export function setRememberPreference(remember: boolean) {
  document.cookie = remember ? "keplar_remember=; Max-Age=0; Path=/; SameSite=Lax" : `keplar_remember=0; Max-Age=900; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

/** Google's standard multicolor "G" (from Google's sign-in branding assets). */
function GoogleG() {
  return (
    <svg className={s.providerLogo} viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Microsoft's four-square logo (Microsoft identity platform branding guidelines). */
function MicrosoftLogo() {
  return (
    <svg className={s.providerLogo} viewBox="0 0 21 21" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

/**
 * "Continue with Google / Microsoft": only the providers that are set up. A provider whose keys aren't set is not
 * shown at all, so nobody is sent to a broken flow and the form never opens with a choice nobody can make (they used to sit
 * at the top as disabled "Coming soon" buttons, above the email sign-in that does work). Renders nothing when none work.
 * (The wording is deliberately public-facing: no mention of servers or keys to visitors.)
 */
export function ProviderButtons({ providers, next, errorPath, remember = true }: { providers: OAuthFlags; next: string; errorPath: string; remember?: boolean }) {
  const t = useClientText().authForm;
  const [busy, setBusy] = useState<"google" | "microsoft" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(provider: "google" | "microsoft") {
    setBusy(provider);
    setError(null);
    setRememberPreference(remember);
    const { error } = await authClient.signIn.social({ provider, callbackURL: welcomePath(next), newUserCallbackURL: welcomePath(next), errorCallbackURL: errorPath });
    if (error) {
      setBusy(null);
      setError(error.status === 429 ? "Too many attempts. Wait a minute and try again." : "Couldn't start that sign-in. Try again, or use an email and password.");
    }
    // On success the browser is already navigating to the provider.
  }

  const rows: { id: "google" | "microsoft"; name: string; logo: React.ReactNode }[] = [
    { id: "google" as const, name: "Google", logo: <GoogleG /> },
    { id: "microsoft" as const, name: "Microsoft", logo: <MicrosoftLogo /> },
  ].filter((p) => providers[p.id]);
  if (!rows.length) return null;
  return (
    <div className={s.providers}>
      {rows.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`${s.btn} ${s.btnSecondary} ${s.providerBtn}`}
            onClick={() => void go(p.id)}
            disabled={busy !== null}
            aria-busy={busy === p.id || undefined}
            data-provider={p.id}
            data-configured="true"
          >
            {p.logo}
            <span>{busy === p.id ? t.opening.replace("{name}", p.name) : t.continueWith.replace("{name}", p.name)}</span>
          </button>
      ))}
      {error ? (
        <p className={`${s.fieldNote} ${s.err}`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
