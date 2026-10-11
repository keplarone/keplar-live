import { breadcrumbs } from "@/lib/seo-graph";
import { JsonLd } from "@/components/seo/JsonLd";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { brand } from "@/lib/site";
import s from "@/components/feedback/Feedback.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const metadata = pageMeta("/security", "Security and vulnerability disclosure", "How to report a security problem to Keplar, what we ask of researchers, and an honest summary of what protects your account today.");

const box = { display: "grid", gap: "var(--s-3)", marginTop: "var(--s-8)" } as const;
const list = { margin: 0, paddingLeft: "1.2em", display: "grid", gap: "var(--s-2)", color: "var(--c-ink-2)", lineHeight: 1.6 } as const;

/** Disclosure policy and a plain summary of protections. Keep every sentence true: nothing here claims a certification or audit. */
export default function SecurityPage() {
  return (
    <>
    <JsonLd data={breadcrumbs([{ name: "Security", path: "/security" }])} />
    <div className={s.page}>
      <p className={s.eyebrow}>Security</p>
      <h1 className={s.title}><TwoTone text={"Report a security problem"} /></h1>
      <p className={s.lede}>
        If you think you found a vulnerability in Keplar, email <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>. A machine-readable copy of this policy is at <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
      </p>

      <section style={box} aria-labelledby="report-h">
        <h2 id="report-h" className={s.label} style={{ fontSize: "var(--t-title)" }}>What to send</h2>
        <ul style={list}>
          <li>What you found, where (URL or API route), and the steps to reproduce it.</li>
          <li>The impact as you understand it. A short proof of concept is plenty.</li>
          <li>How to reach you if you want a reply. We read every report by hand and will answer as soon as we can, but we cannot promise a response time.</li>
        </ul>
      </section>

      <section style={box} aria-labelledby="rules-h">
        <h2 id="rules-h" className={s.label} style={{ fontSize: "var(--t-title)" }}>Ground rules</h2>
        <ul style={list}>
          <li>Test only against accounts you own. Do not read, change or delete other people&apos;s data. If you reach someone else&apos;s data by accident, stop and tell us.</li>
          <li>No denial-of-service, spam, social engineering of our team or users, or physical attacks.</li>
          <li>Give us a reasonable chance to fix the problem before you publish details.</li>
          <li>Do not include real personal data in your report.</li>
        </ul>
        <p className={s.note}>If you follow these rules in good faith, we will not pursue action against you for the research. This is a statement of intent by a small team, not a legal safe-harbor agreement.</p>
      </section>

      <section style={box} aria-labelledby="bounty-h">
        <h2 id="bounty-h" className={s.label} style={{ fontSize: "var(--t-title)" }}>Rewards</h2>
        <p style={{ margin: 0, color: "var(--c-ink-2)", lineHeight: 1.6 }}>We do not run a bug bounty and do not pay for reports. We are glad to thank you by name in release notes if you want that.</p>
      </section>

      <section style={box} aria-labelledby="have-h">
        <h2 id="have-h" className={s.label} style={{ fontSize: "var(--t-title)" }}>What protects your account today</h2>
        <ul style={list}>
          <li>Connections use HTTPS, with HSTS and standard browser security headers.</li>
          <li>Passwords are stored as salted scrypt hashes, never in plain text. Sign-in, sign-up and reset requests are rate limited.</li>
          <li>Optional two-factor sign-in with any authenticator app (TOTP), with one-time recovery codes. Turn it on in <Link href="/account#two-factor">Account</Link>.</li>
          <li>You can see every device signed in to your account and sign out of one or all of them on your <Link href="/account#devices">Account page</Link>. A password reset signs out your other devices.</li>
          <li>When your account signs in from a browser or operating system it has not used before, we email the address on the account with a link that signs out every device.</li>
          <li>Tokens for apps you connect are encrypted before they are stored.</li>
          <li>You can download your data and delete your account from the Account page.</li>
        </ul>
      </section>

      <section style={box} aria-labelledby="not-h">
        <h2 id="not-h" className={s.label} style={{ fontSize: "var(--t-title)" }}>What we do not have</h2>
        <ul style={list}>
          <li>We hold no security certifications (no SOC 2, ISO 27001 or similar) and have not had an independent audit or penetration test.</li>
          <li>Optional passkeys (fingerprint, face or device PIN) as an extra way to log in; a passkey login counts as two factors. Add one in <Link href="/account#passkeys">Account</Link>. Two-factor sign-in and passkeys are both optional, so accounts that have turned on neither are protected only by their password, email link or Google/Microsoft login.</li>
        </ul>
        <p className={s.note}>We will update this page when that changes, and not before.</p>
      </section>
    </div>
    </>
  );
}
