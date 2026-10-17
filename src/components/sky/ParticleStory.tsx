import s from "./Sky.module.css";

type Step = { title: string; body: string };

/** "How Keplar works": three steps on the page background. The old pinned particle scene is gone. */
export function ParticleStory({ title, muted, steps }: { title: string; muted: string; steps: Step[] }) {
  return (
    <section className={s.story} aria-labelledby="how-title">
      <h2 id="how-title" className={`${s.h2} ${s.storyTitle}`}>
        <span>{title}</span> <span className={s.muted}>{muted}</span>
      </h2>
      <ol className={s.storySteps}>
        {steps.map((st, i) => (
          <li key={st.title}>
            <span className={s.stepN}>{i + 1}</span>
            <div>
              <h3>{st.title}</h3>
              <p>{st.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
