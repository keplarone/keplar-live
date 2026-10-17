import { TwoTone } from "@/components/page/TwoTone";
import c from "./create-intro.module.css";

/** The one header every Create tab uses (App, Video, Mobile): a centred two-tone title, an optional quiet badge and one short line. */
export function CreateIntro({ title, badge, lede, badgeProps }: { title: string; badge?: string; lede: string; badgeProps?: Record<string, string> }) {
  return (
    <header className={c.intro}>
      <h2 className={c.title}><TwoTone text={title} />{badge ? <span className={c.badge} {...badgeProps}>{badge}</span> : null}</h2>
      <p className={c.lede}>{lede}</p>
    </header>
  );
}
