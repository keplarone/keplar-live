import type { ReactNode } from "react";
import { KeplarSymbol } from "@/components/brand";
import s from "./StatusScreen.module.css";

/**
 * A full-view status: an error, a lost connection or a page that needs something first. Shared by the site's error page and the
 * app's, so every "something stopped" moment reads the same: what happened, what is safe, and the one way forward.
 */
export function StatusScreen({ title, children, actions, help, fill, as = "main" }: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  help?: ReactNode;
  /** Cover the whole viewport (inside the app shell, which is itself fixed). */
  fill?: boolean;
  as?: "main" | "div";
}) {
  const Tag = as;
  return (
    <Tag id={as === "main" ? "main" : undefined} className={s.screen} data-fill={fill || undefined} role={as === "div" ? "alert" : undefined}>
      <div className={s.box}>
        <KeplarSymbol size={32} className={s.mark} />
        <h1 className={s.title}>{title}</h1>
        <p className={s.body}>{children}</p>
        <div className={s.actions}>{actions}</div>
        {help ? <p className={s.help}>{help}</p> : null}
      </div>
    </Tag>
  );
}
