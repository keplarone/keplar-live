/**
 * What a finished (or handed-over) errand found, as the pages showed it: a receipt for an order, a comparison for options.
 * Prices are the pages' own text; "est." marks what a page called approximate; Keplar's own sum is labelled as Keplar's.
 */
import { itemsSubtotal, type ErrandResult, type Money } from "@/lib/browser/errand-result";
import { hostOf } from "@/lib/browser/errand-view";
import s from "./ErrandResultView.module.css";

function Price({ m }: { m: Money }) {
  return (
    <>
      {m.text}
      {m.estimated ? <><span className={s.est} aria-hidden="true"> est.</span><span className="visually-hidden"> (estimated by the site)</span></> : null}
    </>
  );
}

export function ErrandResultView({ result, stoppedAt }: { result: ErrandResult; stoppedAt: string | null }) {
  if (result.type === "options") {
    return (
      <section className={s.box} aria-label="Options Keplar found">
        <h4 className={s.title}>{result.options.length} options to compare</h4>
        <ul className={s.options}>
          {result.options.map((o, i) => (
            <li key={i} className={s.option}>
              <div className={s.optText}>
                <span className={s.name}>{o.name}</span>
                {o.detail ? <span className={s.detail}>{o.detail}</span> : null}
                {o.url ? <a className={s.link} href={o.url} target="_blank" rel="noopener noreferrer">{hostOf(o.url)}<span className="visually-hidden"> (opens in a new tab)</span></a> : null}
              </div>
              <span className={s.price}>{o.price ? <Price m={o.price} /> : <span className={s.none}>No price shown</span>}</span>
            </li>
          ))}
        </ul>
        <p className={s.foot}>{result.note ? `${result.note} ` : ""}Prices as each site showed them. Nothing was booked or bought.</p>
      </section>
    );
  }
  const sum = result.total ? null : itemsSubtotal(result.items);
  return (
    <section className={s.box} aria-label="Order summary">
      <h4 className={s.title}>{result.merchant ? `Your order from ${result.merchant}` : "Your order"}</h4>
      <table className={s.receipt}>
        <thead className="visually-hidden">
          <tr><th scope="col">Item</th><th scope="col">Price</th></tr>
        </thead>
        <tbody>
          {result.items.map((it, i) => (
            <tr key={`i${i}`}>
              <th scope="row">{it.qty && it.qty > 1 ? <span className={s.qty}>{it.qty} ×</span> : null}{it.name}</th>
              <td>{it.price ? <Price m={it.price} /> : <span className={s.none}>No price shown</span>}</td>
            </tr>
          ))}
          {result.fees.map((f, i) => (
            <tr key={`f${i}`} className={s.fee}>
              <th scope="row">{f.label}</th>
              <td><Price m={f.amount} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {result.total ? (
            <tr className={s.total}><th scope="row">Total</th><td><Price m={result.total} /></td></tr>
          ) : sum ? (
            <tr className={s.total}><th scope="row">Items, added up by Keplar</th><td>{sum}</td></tr>
          ) : (
            <tr className={s.total}><th scope="row">Total</th><td><span className={s.none}>Not shown yet</span></td></tr>
          )}
        </tfoot>
      </table>
      {!result.total && sum ? <p className={s.foot}>The page showed no total yet. This sum leaves out any fees, tax or delivery the page didn&apos;t list.</p> : null}
      {stoppedAt ? (
        <p className={s.stop}><strong>Stops here for payment.</strong> Keplar didn&apos;t pay. Check the order on the page and pay there if it&apos;s right.</p>
      ) : (
        <p className={s.foot}>Nothing was ordered or paid.</p>
      )}
    </section>
  );
}
