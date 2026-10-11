"use client";

import { useState } from "react";
import { SIGN_OUT_FAILED, signOutOfBusiness } from "./sign-out";
import s from "./business-site.module.css";

/** Quiet "Sign out" next to the account in the Business top bar (storefront and account setup). */
export function SignOutButton({ email }: { email: string | null }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={s.signOut}
      disabled={busy}
      aria-label={busy ? "Signing out" : `Sign out${email ? ` of ${email}` : ""}`}
      title={failed ? SIGN_OUT_FAILED : undefined}
      onClick={async () => {
        setBusy(true);
        setFailed(false);
        if (!(await signOutOfBusiness())) { setBusy(false); setFailed(true); }
      }}
    >
      {busy ? "Signing out…" : failed ? "Sign out failed, retry" : "Sign out"}
    </button>
  );
}
