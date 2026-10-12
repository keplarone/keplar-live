"use client";

/**
 * Embed configurator on /developers: choose theme, size and accent, see the widget's look, copy the snippet.
 * The widget id placeholder is replaced with a real `emb_…` id from Account → Embed Ask.
 */
import { useMemo, useState } from "react";
import s from "./Developers.module.css";
import { CodeTabs } from "./CodeTabs";
import { EMBED_ACCENTS, EMBED_ACCENT_HEX, EMBED_SIZES, EMBED_SIZE_PX, EMBED_THEMES, type EmbedAccent, type EmbedSize, type EmbedTheme } from "@/lib/embed/config";

export function EmbedConfigurator({ origin }: { origin: string }) {
  const [theme, setTheme] = useState<EmbedTheme>("dark");
  const [size, setSize] = useState<EmbedSize>("standard");
  const [accent, setAccent] = useState<EmbedAccent>("graphite");
  const dims = EMBED_SIZE_PX[size];

  const samples = useMemo(() => {
    const script = `<script src="${origin}/embed.js"
  data-keplar-embed="emb_YOUR_WIDGET_ID"
  data-theme="${theme}"
  data-size="${size}"
  data-accent="${accent}"
  async></script>`;
    const iframe = `<iframe
  src="${origin}/embed?id=emb_YOUR_WIDGET_ID&theme=${theme}&accent=${accent}"
  title="Keplar Ask"
  width="${dims.width}" height="${dims.height}"
  style="border:0;border-radius:12px;max-width:100%"
  loading="lazy"></iframe>`;
    const react = `export function KeplarAsk() {
  return (
    <iframe
      src="${origin}/embed?id=emb_YOUR_WIDGET_ID&theme=${theme}&accent=${accent}"
      title="Keplar Ask"
      width={${dims.width}}
      height={${dims.height}}
      style={{ border: 0, borderRadius: 12, maxWidth: "100%" }}
      loading="lazy"
    />
  );
}`;
    return [{ label: "Script tag", code: script }, { label: "iframe", code: iframe }, { label: "React", code: react }];
  }, [origin, theme, size, accent, dims.width, dims.height]);

  const scale = Math.min(1, 340 / dims.width);

  return (
    <div className={s.config}>
      <div className={s.controls}>
        <fieldset className={s.group}>
          <legend className={s.groupLabel}>Theme</legend>
          <div className={s.seg}>
            {EMBED_THEMES.map((t) => <button key={t} type="button" className={s.segBtn} aria-pressed={t === theme} onClick={() => setTheme(t)}>{t}</button>)}
          </div>
        </fieldset>
        <fieldset className={s.group}>
          <legend className={s.groupLabel}>Size</legend>
          <div className={s.seg}>
            {EMBED_SIZES.map((t) => <button key={t} type="button" className={s.segBtn} aria-pressed={t === size} onClick={() => setSize(t)}>{t} <span style={{ opacity: 0.85, fontFamily: "var(--f-mono)", fontSize: 11 }}>{EMBED_SIZE_PX[t].width}×{EMBED_SIZE_PX[t].height}</span></button>)}
          </div>
        </fieldset>
        <fieldset className={s.group}>
          <legend className={s.groupLabel}>Accent</legend>
          <div className={s.seg}>
            {EMBED_ACCENTS.map((t) => <button key={t} type="button" className={s.segBtn} aria-pressed={t === accent} onClick={() => setAccent(t)}><span className={s.swatch} style={{ background: EMBED_ACCENT_HEX[t] }} aria-hidden="true" />{t}</button>)}
          </div>
        </fieldset>
        <CodeTabs samples={samples} label="Embed code" />
      </div>
      <div className={s.previewWrap}>
        <div
          className={s.mini}
          data-theme={theme}
          style={{ ["--mini-accent" as string]: EMBED_ACCENT_HEX[accent], maxWidth: dims.width * scale, minHeight: dims.height * scale * 0.82 }}
          aria-label={`Look of the ${theme} ${size} widget with the ${accent} accent`}
          role="img"
        >
          <div className={s.miniTop}><strong>Keplar Ask</strong><span>Free models</span></div>
          <div className={s.miniBubble} data-role="user">Is Postgres JSONB fine for user settings that change shape often?</div>
          <div className={s.miniBubble}>
            Yes, for settings read and written as a whole. Normalize the few fields you filter or join on.
            <span className={s.miniMeta}>3 of 3 models agreed</span>
          </div>
          <div style={{ flex: 1 }} />
          <div className={s.miniInput}>Ask Keplar…</div>
          <span className={s.miniBtn} style={{ alignSelf: "flex-start" }}>Ask</span>
        </div>
        <span className={s.previewCaption}>{theme} · {size} · {accent}. The live widget uses these exact colors</span>
      </div>
    </div>
  );
}
