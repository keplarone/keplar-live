import Link from "next/link";
import s from "./SignInGate.module.css";

type Tone = "reasoning" | "research" | "creation" | "memory" | "attention";

/**
 * Shown where a signed-out visitor reaches a signed-in feature. A plain statement of what is locked and
 * why, with the two real next steps. Hue = what the place is for (Create = creation).
 */
export function SignInGate({ title, body, next, tone = "creation" }: { title: string; body: string; next: string; tone?: Tone }) {
  return (
    <section className={s.gate} data-tone={tone} aria-labelledby="gate-title" role="status">
      <h2 id="gate-title" className={s.title}>{title}</h2>
      <p className={s.body}>{body}</p>
      <div className={s.actions}>
        <Link href={`/signin?next=${encodeURIComponent(next)}`} className={s.primary}>Sign in</Link>
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className={s.ghost}>Create a free account</Link>
      </div>
    </section>
  );
}
