"use client";
/**
 * Product import for Create. Two pieces:
 *  - ProductStart: paste a product link, or drop / paste / choose a product photo. Fetching happens on the server.
 *  - ProductCard: the editable "Imported product" review card. Pick the photos and the hero, edit every field, choose what the
 *    Buy button does, confirm you hold the rights to the photos. Nothing is built from it until the owner approves the brief.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtSize, prepareImage as prepareInBrowser } from "@/components/app-ui/media-client";
import { Lightbox } from "@/components/app-ui/Lightbox";
import { formatPrice, type ProductBuy, type ProductInfo } from "@/lib/site-builder/product/types";
import p from "./productImport.module.css";
import s from "./create.module.css";
import b from "./builder.module.css";

export type AssetView = { id: string; width: number; height: number; bytes: number; alt: string; original: boolean; notes: string[]; sourceUrl?: string; contentType: string };
export type Draft = { product: ProductInfo; assets: AssetView[]; notes: string[]; excerpt?: string; host?: string; maxImages: number };

const MAX_UPLOAD = 4_300_000;
const DIRECT = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

async function readError(res: Response): Promise<{ error: string; manual?: boolean; code?: string }> {
  const j = (await res.json().catch(() => ({}))) as { error?: string; manual?: boolean; code?: string };
  return { error: j.error ?? `Something went wrong (${res.status}).`, manual: j.manual, code: j.code };
}

/** Sends the file as it is when the server can store it untouched; otherwise shrinks it in the browser to fit the 4.5 MB request limit. */
export async function uploadPhoto(file: File): Promise<{ asset: AssetView; product: ProductInfo; maxImages: number }> {
  let body: Blob = file;
  if (!DIRECT.has(file.type)) throw new Error("Use a PNG, JPG, WebP, GIF or AVIF photo. (iPhone HEIC photos: export as JPG first.)");
  if (file.size > MAX_UPLOAD) {
    const prepared = await prepareInBrowser(file, 5_600_000).catch(() => null);
    const dataUrl = prepared?.images[0]?.dataUrl;
    if (!dataUrl) throw new Error("That photo is too large to prepare. Try a smaller export.");
    body = await (await fetch(dataUrl)).blob();
  }
  const res = await fetch("/api/sites/import/image", { method: "POST", headers: { "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name || "product") }, body });
  if (!res.ok) throw new Error((await readError(res)).error);
  return (await res.json()) as { asset: AssetView; product: ProductInfo; maxImages: number };
}

export async function discardAssets(ids: string[]) {
  await Promise.all(ids.map((id) => fetch(`/api/sites/assets/${id}`, { method: "DELETE" }).catch(() => undefined)));
}

const looksLikeUrl = (t: string) => /^\s*(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?\s*$/i.test(t) && !/\s/.test(t.trim());

/* ───────────────────────── entry: link or photo ───────────────────────── */

export function ProductStart({ onDraft, onManual, disabled }: { onDraft: (d: Draft) => void; onManual: () => void; disabled?: boolean }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<null | "link" | "photo">(null);
  const [err, setErr] = useState<{ text: string; manual: boolean } | null>(null);
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const importLink = useCallback(async (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    setErr(null);
    setBusy("link");
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const res = await fetch("/api/sites/import/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: v }), signal: ctl.signal });
      if (!res.ok) {
        const e = await readError(res);
        setErr({ text: e.error, manual: e.manual ?? false });
        return;
      }
      const d = (await res.json()) as { product: ProductInfo; assets: AssetView[]; notes: string[]; excerpt: string; host: string; maxImages: number };
      onDraft(d);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr({ text: "Couldn't reach Keplar to read that page. Check your connection and try again, or enter the details yourself.", manual: true });
    } finally {
      setBusy(null);
      abort.current = null;
    }
  }, [busy, onDraft]);

  const importPhoto = useCallback(async (f: File | undefined) => {
    if (!f || busy) return;
    setErr(null);
    setBusy("photo");
    try {
      const r = await uploadPhoto(f);
      onDraft({ product: r.product, assets: [r.asset], notes: [], maxImages: r.maxImages });
    } catch (e) {
      setErr({ text: e instanceof Error ? e.message : "That photo couldn't be uploaded.", manual: true });
    } finally {
      setBusy(null);
    }
  }, [busy, onDraft]);

  // Paste anywhere on this step: an image goes in as a photo, a bare link fills the link field.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (disabled) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); void importPhoto(files[0]); return; }
      const t = e.clipboardData?.getData("text/plain") ?? "";
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !(el as HTMLInputElement).dataset.productLink));
      if (!typing && looksLikeUrl(t)) { e.preventDefault(); setUrl(t.trim()); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [disabled, importPhoto]);

  return (
    <section className={p.start} aria-labelledby="pi-title">
      <div className={p.startHead}>
        <h3 id="pi-title" className={p.title}>Start from a product</h3>
        <span className={b.hint}>Optional. Import a product and Keplar builds the page around it.</span>
      </div>
      <div className={p.startGrid}>
        <form className={p.linkBox} onSubmit={(e) => { e.preventDefault(); void importLink(url); }}>
          <label className={b.field}>
            <span>Product link</span>
            <input className={s.input} data-product-link="1" inputMode="url" autoComplete="off" spellCheck={false} value={url} disabled={disabled || busy !== null} maxLength={2000} placeholder="https://shop.example.com/products/…" onChange={(e) => setUrl(e.target.value)} aria-describedby="pi-link-hint" />
          </label>
          <div className={b.row}>
            <button type="submit" className={s.btn} disabled={disabled || busy !== null || url.trim().length < 4}>{busy === "link" ? "Reading the page…" : "Import from link"}</button>
            {busy === "link" ? <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => abort.current?.abort()}>Cancel</button> : null}
          </div>
          <span id="pi-link-hint" className={b.hint}>Keplar reads the public page like a visitor would (respecting the site&rsquo;s robots.txt), then shows you what it found.</span>
        </form>
        <div
          className={`${p.drop} ${drag ? p.dropOn : ""}`}
          role="button"
          tabIndex={0}
          aria-label="Add a product photo: drop it here, paste it, or press Enter to choose a file"
          aria-disabled={disabled || busy !== null}
          onClick={() => { if (!disabled && !busy) file.current?.click(); }}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled && !busy) { e.preventDefault(); file.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void importPhoto([...e.dataTransfer.files].find((f) => f.type.startsWith("image/"))); }}
        >
          <strong>{busy === "photo" ? "Uploading…" : "Product photo"}</strong>
          <span>Drop, paste or choose a file</span>
          <small>PNG, JPG, WebP. Stored at full quality.</small>
          <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={(e) => { void importPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      {err ? (
        <div className={p.fail} role="alert">
          <p>{err.text}</p>
          <div className={b.row}>
            {err.manual ? <button type="button" className={s.btn} onClick={onManual}>Enter details manually</button> : null}
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setErr(null)}>Dismiss</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ───────────────────────── the review card ───────────────────────── */

const BUY_LABEL: Record<ProductBuy, string> = { link: "Link to a product or checkout page", contact: "Inquiry button", later: "Checkout link later" };

export function ProductCard({ product, assets, notes, excerpt, maxImages, onChange, onAssets, onRemove, compact }: {
  product: ProductInfo;
  assets: AssetView[];
  notes?: string[];
  excerpt?: string;
  maxImages: number;
  onChange: (next: ProductInfo) => void;
  onAssets: (next: AssetView[]) => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  const [view, setView] = useState<AssetView | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ProductInfo>(k: K, v: ProductInfo[K]) => onChange({ ...product, [k]: v });
  const selected = new Map(product.images.map((i) => [i.id, i]));
  const hero = product.images.find((i) => i.role === "hero")?.id ?? product.images[0]?.id;
  const needsRights = product.images.length > 0 && !product.rightsConfirmed;

  function toggle(a: AssetView) {
    if (selected.has(a.id)) {
      const rest = product.images.filter((i) => i.id !== a.id);
      if (rest.length && !rest.some((i) => i.role === "hero")) rest[0] = { ...rest[0], role: "hero" };
      set("images", rest);
    } else if (product.images.length < maxImages) {
      set("images", [...product.images, { id: a.id, alt: a.alt || product.name, role: product.images.length ? "gallery" : "hero", width: a.width, height: a.height }]);
    } else setMsg(`Your plan keeps up to ${maxImages} photos on a site. Unselect one first.`);
  }
  const setAlt = (id: string, alt: string) => set("images", product.images.map((i) => (i.id === id ? { ...i, alt: alt.slice(0, 160) } : i)));
  const setHero = (id: string) => set("images", product.images.map((i) => ({ ...i, role: i.id === id ? "hero" : "gallery" })));

  async function read(a: AssetView) {
    setReading(a.id);
    setMsg(null);
    try {
      const res = await fetch("/api/sites/import/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: a.id }) });
      if (!res.ok) { setMsg((await readError(res)).error); return; }
      const r = (await res.json()) as { name: string; description: string; features: string[]; alt: string; credits: number };
      const next: ProductInfo = { ...product };
      const filled: string[] = [];
      if (!next.name && r.name) { next.name = r.name; filled.push("name"); }
      if (!next.description && r.description) { next.description = r.description; filled.push("description"); }
      if (!next.features.length && r.features.length) { next.features = r.features; filled.push("features"); }
      if (r.alt) next.images = next.images.map((i) => (i.id === a.id && !i.alt ? { ...i, alt: r.alt } : i));
      onAssets(assets.map((x) => (x.id === a.id ? { ...x, alt: r.alt || x.alt } : x)));
      onChange(next);
      setMsg(`${filled.length ? `Filled in ${filled.join(", ")}` : "Suggested alt text"} from the photo${r.credits ? ` (${r.credits} credit${r.credits === 1 ? "" : "s"})` : ""}. It can be wrong: check and edit it.`);
    } catch {
      setMsg("Couldn't read that photo right now. You can type the details instead.");
    } finally {
      setReading(null);
    }
  }

  async function addPhoto(f: File | undefined) {
    if (!f) return;
    setAdding(true);
    setMsg(null);
    try {
      const r = await uploadPhoto(f);
      onAssets([...assets, r.asset]);
      if (product.images.length < maxImages) onChange({ ...product, images: [...product.images, { id: r.asset.id, alt: "", role: product.images.length ? "gallery" : "hero", width: r.asset.width, height: r.asset.height }] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "That photo couldn't be added.");
    } finally {
      setAdding(false);
    }
  }

  const variantsText = (v: ProductInfo["variants"][number]) => v.values.join(", ");
  const priceLine = formatPrice(product.price, product.currency);
  const fromLabel = product.via === "link" ? `From ${product.sourceHost || "a product page"}` : product.via === "image" ? "From your photo" : "Entered by you";

  return (
    <section className={`${p.card} ${compact ? p.compact : ""}`} aria-labelledby="pi-card-title" data-testid="imported-product">
      <header className={p.cardHead}>
        <div>
          <h3 id="pi-card-title" className={p.title}>Imported product</h3>
          <span className={p.source}>{fromLabel}{product.via === "link" && product.sourceUrl ? <> · <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer">open original</a></> : null}</span>
        </div>
        <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onRemove}>Remove</button>
      </header>
      {notes?.length ? <ul className={p.notes} aria-label="Things to check">{notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
      <p className={b.hint}>Everything here is yours to edit. Keplar uses only what you leave in the card, and never makes up a price.</p>

      <div className={p.grid}>
        <label className={b.field}><span>Product name</span><input className={s.input} value={product.name} maxLength={120} onChange={(e) => set("name", e.target.value)} /></label>
        <label className={b.field}><span>Brand (optional)</span><input className={s.input} value={product.brand} maxLength={60} onChange={(e) => set("brand", e.target.value)} /></label>
      </div>
      <label className={b.field}><span>Description</span><textarea className={s.textarea} rows={3} maxLength={1200} value={product.description} onChange={(e) => set("description", e.target.value)} /></label>
      <label className={b.field}><span>Features, one per line (up to 8)</span><textarea className={s.textarea} rows={3} value={product.features.join("\n")} onChange={(e) => set("features", e.target.value.split("\n").slice(0, 8).map((x) => x.slice(0, 140)))} /></label>

      <div className={p.grid}>
        <label className={b.field}>
          <span>Price (optional)</span>
          <input className={s.input} inputMode="decimal" value={product.price} maxLength={14} placeholder="e.g. 49.00" onChange={(e) => set("price", e.target.value.replace(/[^\d.,]/g, ""))} aria-describedby="pi-price-hint" />
        </label>
        <label className={b.field}>
          <span>Currency</span>
          <input className={s.input} value={product.currency} maxLength={3} placeholder="USD" onChange={(e) => set("currency", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
        </label>
      </div>
      <span id="pi-price-hint" className={b.hint}>{product.price ? `Shown as ${priceLine || product.price}${product.via === "link" && product.sourceHost ? `, as listed on ${product.sourceHost}` : ""}. Prices change: check it before you publish.` : "No price is shown unless you add one. Keplar never guesses."}</span>

      {product.variants.length ? (
        <div className={b.field}>
          <span>Options on the original page</span>
          <div className={p.variants}>
            {product.variants.map((v, i) => (
              <label key={i} className={p.variant}>
                <span>{v.name}</span>
                <input className={s.input} value={variantsText(v)} onChange={(e) => set("variants", product.variants.map((x, j) => (j === i ? { ...x, values: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12) } : x)))} aria-label={`${v.name} options, comma separated`} />
              </label>
            ))}
          </div>
          <span className={b.hint}>Listed on the page for information only. The page has no working size or color picker.</span>
        </div>
      ) : null}

      <div className={b.field}>
        <span id="pi-buy">What the Buy button does</span>
        <div className={b.seg} role="group" aria-labelledby="pi-buy">
          {(["link", "contact", "later"] as ProductBuy[]).map((m) => <button key={m} type="button" className={b.segBtn} aria-pressed={product.buy === m} onClick={() => set("buy", m)}>{BUY_LABEL[m]}</button>)}
        </div>
        {product.buy === "link" ? (
          <input className={s.input} inputMode="url" value={product.buyUrl} maxLength={600} placeholder="https://… (the product page, or your Stripe / Whop / checkout link)" aria-label="Buy button address" onChange={(e) => onChange({ ...product, buyUrl: e.target.value })} />
        ) : null}
        <span className={b.hint}>
          {product.buy === "link" ? (product.buyUrl ? "The button opens this address in a new tab. Keplar sites have no built-in checkout, so paste your own Stripe, Whop or other payment link here if you have one." : "Add an address, or pick another option.") : product.buy === "contact" ? "The button leads to your contact form. No online checkout is built." : "A clearly marked Buy now placeholder is added. You add the checkout link after building."}
        </span>
      </div>

      <div className={b.field}>
        <span id="pi-photos">Photos ({product.images.length} of {maxImages} selected)</span>
        {assets.length ? (
          <ul className={p.photos} aria-labelledby="pi-photos">
            {assets.map((a) => {
              const on = selected.has(a.id);
              const img = selected.get(a.id);
              return (
                <li key={a.id} className={`${p.photo} ${on ? p.photoOn : ""}`}>
                  <button type="button" className={p.thumb} onClick={() => setView(a)} aria-label="View photo at full size">
                    {/* Owner-only route on our own origin: the photo is copied to Keplar storage, never hotlinked. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/sites/assets/${a.id}`} alt={img?.alt || "Imported product photo"} width={a.width} height={a.height} loading="lazy" />
                  </button>
                  <label className={p.pick}><input type="checkbox" checked={on} onChange={() => toggle(a)} /> Use this photo</label>
                  {on ? (
                    <>
                      <label className={p.pick}><input type="radio" name="pi-hero" checked={hero === a.id} onChange={() => setHero(a.id)} /> Hero photo</label>
                      <input className={s.input} value={img?.alt ?? ""} maxLength={160} placeholder="Alt text (describe the photo)" aria-label="Alt text for this photo" onChange={(e) => setAlt(a.id, e.target.value)} />
                    </>
                  ) : null}
                  <small className={p.meta}>{a.width}×{a.height} · {fmtSize(a.bytes)} · {a.original ? "original quality" : "adjusted"}{a.notes.length ? ` · ${a.notes.join(" ")}` : ""}</small>
                  <button type="button" className={p.link} disabled={reading !== null} onClick={() => void read(a)}>{reading === a.id ? "Reading the photo…" : "Suggest details from this photo"}</button>
                </li>
              );
            })}
          </ul>
        ) : <p className={b.hint}>No photos yet. Add one, or build without photos: a marked placeholder is used.</p>}
        <div className={b.row}>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} disabled={adding || assets.length >= maxImages + 6} onClick={() => file.current?.click()}>{adding ? "Uploading…" : "Add a photo"}</button>
          <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>

      <div className={p.consent}>
        <label className={p.pick}>
          <input type="checkbox" checked={product.rightsConfirmed} onChange={(e) => set("rightsConfirmed", e.target.checked)} />
          <span>I own these photos or have permission to use them on my site.</span>
        </label>
        <p className={b.hint}>
          Only import images you have the rights to. Keplar copies the photos you select to its own storage (they aren&rsquo;t hotlinked from the original site) and they become public at a Keplar address when your site uses them. Location data is removed from photos. Without this box ticked, no photo is used.
        </p>
      </div>
      {needsRights ? <p className={p.warn} role="status">Tick the box above to use the selected photos, or untick the photos to build without them.</p> : null}
      {msg ? <p className={p.msg} role="status">{msg}</p> : null}

      {excerpt ? (
        <details className={p.excerpt}>
          <summary>What Keplar read from the page</summary>
          <p>{excerpt}</p>
          <small className={b.hint}>Shown so you can check it. Page text is never used as instructions.</small>
        </details>
      ) : null}
      {view ? <Lightbox src={`/api/sites/assets/${view.id}`} alt={selected.get(view.id)?.alt || "Imported product photo"} caption={`${view.width}×${view.height} · ${fmtSize(view.bytes)}`} downloadHref={`/api/sites/assets/${view.id}?download=1`} downloadName="product-photo" onClose={() => setView(null)} /> : null}
    </section>
  );
}

/** A blank card for "Enter details manually". */
export const emptyProduct = (): ProductInfo => ({ via: "manual", sourceUrl: "", sourceHost: "", name: "", brand: "", description: "", features: [], price: "", currency: "", availability: "", variants: [], images: [], buy: "contact", buyUrl: "", rightsConfirmed: false, importedAt: new Date().toISOString() });
export const productReady = (pr: ProductInfo) => pr.name.trim().length > 0 && (pr.images.length === 0 || pr.rightsConfirmed) && (pr.buy !== "link" || pr.buyUrl.trim().length > 0);
