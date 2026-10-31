import Link from "next/link";
import { brand } from "@/lib/site";
import s from "@/components/feedback/Feedback.module.css";
import { TwoTone } from "@/components/page/TwoTone";

/**
 * The security page's content: disclosure policy and a plain summary of protections. Keep every sentence true: nothing here claims a
 * certification or audit. Shown at keplar.one/security and, in the Business look, at business.keplar.one/security.
 * `accountOrigin`: where "Account" links go. Keplar accounts are managed on keplar.one, so the Business copy passes its origin.
 */
export function SecurityContent({ accountOrigin = "" }: { accountOrigin?: string }) {
  return (
    <div className={s.page}>
      <p className={s.eyebrow} data-o="Feedback eyebrow">Security</p>
      <h1 className={s.title} data-o="Feedback title"><TwoTone text={"Report a security problem"} /></h1>
      <p className={s.lede}>
        If you think you found a vulnerability in Keplar, email <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>. A machine-readable copy of this policy is at <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
      </p>

      <section className={s.section} aria-labelledby="report-h">
        <h2 id="report-h" className={s.h2}>What to send</h2>
        <ul className={s.list}>
          <li>What you found, where (URL or API route), and the steps to reproduce it.</li>
          <li>The impact as you understand it. A short proof of concept is plenty.</li>
          <li>How to reach you if you want a reply. We read every report by hand. We aim to acknowledge within 3 business days, assess within 7, and fix critical problems within 7 days of confirming them and high ones within 30. These are the commitments of a small team, not a contract.</li>
        </ul>
      </section>

      <section className={s.section} aria-labelledby="rules-h">
        <h2 id="rules-h" className={s.h2}>Ground rules</h2>
        <ul className={s.list}>
          <li>Test only against accounts you own. Do not read, change or delete other people&apos;s data. If you reach someone else&apos;s data by accident, stop and tell us.</li>
          <li>No denial-of-service, spam, social engineering of our team or users, or physical attacks.</li>
          <li>Give us a reasonable chance to fix the problem before you publish details.</li>
          <li>Do not include real personal data in your report.</li>
        </ul>
        <p className={s.note}>If you follow these rules in good faith, we will not pursue action against you for the research. This is a statement of intent by a small team, not a legal safe-harbor agreement.</p>
      </section>

      <section className={s.section} aria-labelledby="bounty-h">
        <h2 id="bounty-h" className={s.h2}>Rewards</h2>
        <p className={s.text}>We do not run a bug bounty and do not pay for reports. We are glad to thank you by name in release notes if you want that.</p>
      </section>

      <section className={s.section} aria-labelledby="have-h">
        <h2 id="have-h" className={s.h2}>What protects your account today</h2>
        <ul className={s.list}>
          <li>Connections use HTTPS, with HSTS and standard browser security headers.</li>
          <li>Passwords are stored as salted scrypt hashes, never in plain text. Sign-in, sign-up and reset requests are rate limited.</li>
          <li>Optional two-factor sign-in with any authenticator app (TOTP), with one-time recovery codes. Turn it on in <Link href={`${accountOrigin}/account#two-factor`}>Account</Link>.</li>
          <li>You can see every device signed in to your account and sign out of one or all of them on your <Link href={`${accountOrigin}/account#devices`}>Account page</Link>. A password reset signs out your other devices.</li>
          <li>When your account signs in from a browser or operating system it has not used before, we email the address on the account with a link that signs out every device.</li>
          <li>Tokens for apps you connect are encrypted before they are stored.</li>
          <li>You can download your data and delete your account from the Account page.</li>
        </ul>
      </section>

      <section className={s.section} aria-labelledby="not-h">
        <h2 id="not-h" className={s.h2}>What we do not have</h2>
        <ul className={s.list}>
          <li>We hold no security certifications (no SOC 2, ISO 27001 or similar) and have not had an independent audit or penetration test.</li>
          <li>Optional passkeys (fingerprint, face or device PIN) as an extra way to sign in; a passkey sign-in counts as two factors. Add one in <Link href={`${accountOrigin}/account#passkeys`}>Account</Link>. Two-factor sign-in and passkeys are both optional, so accounts that have turned on neither are protected only by their password, email link or Google/Microsoft sign-in.</li>
        </ul>
        <p className={s.note}>We will update this page when that changes, and not before.</p>
      </section>

      <section className={s.section} aria-labelledby="register-h">
        <h2 id="register-h" className={s.h2}>The full list</h2>
        <p className={s.note}>
          Every control we hold ourselves to, with its status and the code or document that proves it, is public: the <a href="https://github.com/keplarone/keplar-live/blob/main/docs/security-checklist.md">security checklist</a> (444 items across authentication, authorization, sessions, APIs, the browser, data, uploads, infrastructure, secrets, payments, AI and agents, delivery, logging, privacy, abuse and governance), the <a href="https://github.com/keplarone/keplar-live/blob/main/docs/threat-model.md">threat model</a>, and the <a href="https://github.com/keplarone/keplar-live/blob/main/docs/security-policy.md">policy</a> with its accepted-risk register. Items that are written procedures or accepted risks are marked as such; nothing on that list is dressed up.
        </p>
      </section>
    </div>
  );
}
