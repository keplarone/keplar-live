/** A drawn miniature of a showcase demo's composition, in its own palette. Pure CSS, no iframe, so lists stay light. */
import type { CSSProperties } from "react";
import type { ShowcaseItem } from "@/lib/create/showcase/data";
import s from "./Showcase.module.css";

export function ShowcasePoster({ item }: { item: ShowcaseItem }) {
  const p = item.palette;
  const style = { "--p-bg": p.bg, "--p-surface": p.surface, "--p-ink": p.ink, "--p-muted": p.muted, "--p-acc": p.accent, "--p-line": p.line, "--p-fd": item.font.display, "--p-fb": item.font.body } as CSSProperties;
  return (
    <div className={s.poster} style={style} aria-hidden="true">
      <div className={s.pBar}>{item.title}<i><span /><span /><span /></i></div>
      <div className={s.pBody}>{body(item)}</div>
    </div>
  );
}

function body(item: ShowcaseItem) {
  switch (item.archetype) {
    case "editorial":
      return <div className={s.pEditorial}><h4>{item.slug === "field-notes-portfolio" ? <>Pictures that take <em>their time.</em></> : <>Pots for the <em>everyday table.</em></>}</h4><div className={s.rule}><span /><span /><span /></div><div className={s.fig} /></div>;
    case "menu":
      return <div className={s.pMenu} style={{ height: "100%" }}><div className={s.card}><b>{item.slug === "small-hours-books" ? "Late readings" : "By the glass"}</b>{[0, 1, 2, 3].map((i) => <div className={s.row} key={i}><span>{["Grüner", "Rosé", "Carignan", "Chenin"][i]}</span><span /><span>{[9, 10, 11, 48][i]}</span></div>)}</div></div>;
    case "ledger":
      return <div className={s.pLedger} style={{ height: "100%" }}><div className={s.side}><span /><span /><span /><span /></div><div><div className={s.stats}><b>148</b><b>12</b><b>1:49</b></div><div className={s.rows}><span /><span /><span /><span /><span /></div></div></div>;
    case "board": {
      const brutal = item.slug === "northline-couriers";
      return <div className={`${s.pBoard} ${brutal ? s.brutal : s.soft}`} style={{ height: "100%" }}>{[3, 2, 1].map((n, c) => <div className={s.col} key={c}><span />{Array.from({ length: n }, (_, i) => <div key={i} className={`${s.cd} ${c === 0 && i === 0 ? s.hot : ""}`} />)}</div>)}</div>;
    }
    case "calendar":
      return <div className={s.pCalendar} style={{ height: "100%" }}>{[1, 0, 1, 0, 0, 2, 1].map((n, d) => <div className={s.d} key={d}>{Array.from({ length: n }, (_, i) => <span key={i} className={d === 2 ? s.full : ""} />)}</div>)}</div>;
  }
}
