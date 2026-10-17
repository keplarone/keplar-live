import s from "./EntrySky.module.css";

/**
 * The entry sky behind sign-in, sign-up, account recovery and onboarding: a day sky with soft drifting clouds in the light
 * theme, a night sky with moonlit clouds in the dark theme (no star field). Pure CSS, decorative (aria-hidden), painted under the
 * page's content inside its own stacking context. Clouds drift slowly on wider screens; phones and reduced motion get a still sky.
 */
export function EntrySky({ className }: { className?: string }) {
  return (
    <div className={className ? `${s.sky} ${className}` : s.sky} aria-hidden="true">
      <div className={s.base} />
      <div className={s.light} />
      <div className={`${s.cloud} ${s.c1}`} />
      <div className={`${s.cloud} ${s.c2}`} />
      <div className={`${s.cloud} ${s.c3}`} />
      <div className={`${s.cloud} ${s.c4}`} />
      <div className={`${s.cloud} ${s.c5}`} />
      <div className={`${s.cloud} ${s.c6}`} />
      <div className={s.haze} />
    </div>
  );
}
