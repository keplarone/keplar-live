/** Static drawing of Voice Live Create's three panes (editor, terminal, preview) shown at once. No script, no animation loop. */
import s from "./Chapters.module.css";

export function VoiceSchematic({ caption, label = "Voice Live Create: editor, terminal and live preview side by side" }: { caption?: string; label?: string }) {
  return (
    <figure className={s.vs} aria-label={label}>
      <div className={s.vsEd}>
        <p className={s.vsBar}><span>pages/menu.js</span><span className={s.vsLive}>Listening</span></p>
        <pre><code><span className={s.kk}>export</span> <span className={s.kk}>function</span> Menu() {"{"}{"\n"}  <span className={s.kk}>const</span> list = db.<span className={s.ks}>wines</span>.byWeek();{"\n"}  <span className={s.kc}>{"// \"actually, group by region\""}</span>{"\n"}  <span className={s.kk}>return</span> groupBy(list, <span className={s.ks}>&quot;region&quot;</span>);{"\n"}{"}"}</code></pre>
      </div>
      <div className={s.vsTerm}>
        <pre><code>$ keplar create --live --from voice{"\n"}<span className={s.kc}>›</span> kind: site · hospitality{"\n"}<span className={s.kc}>›</span> screens: menu, tastings, visit{"\n"}<span className={s.kc}>›</span> revised: group by region</code></pre>
      </div>
      <div className={s.vsPrev}>
        <span className={s.vsT}>Saltgrass</span>
        <span className={s.vsH}>By the glass</span>
        {[0, 1, 2].map((i) => <span key={i} className={s.vsR}><i /><b /></span>)}
      </div>
      <figcaption className={s.small}>{caption ?? "Voice Live Create: speak, and the editor, terminal and preview move together. Pause and it holds; say \"actually\" and it revises."}</figcaption>
    </figure>
  );
}
