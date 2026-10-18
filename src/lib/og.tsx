import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MARK_SIZE, markShapes } from "@/components/brand/geometry";
import { color } from "./tokens";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

/**
 * Share images use Montserrat, the site's face (Space UI, docs/design/space-ui.md), from the bundled OFL files in assets/fonts
 * (@fontsource/montserrat 5, latin + latin-ext, WOFF: Satori reads TTF/OTF/WOFF, not WOFF2). Read from disk, so rendering never
 * needs the network. Satori falls back across every loaded font, so latin-ext covers accented titles.
 */
async function loadFonts() {
  const files = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Montserrat-latin-400.woff")),
    readFile(join(process.cwd(), "assets/fonts/Montserrat-latin-500.woff")),
    readFile(join(process.cwd(), "assets/fonts/Montserrat-latin-600.woff")),
    readFile(join(process.cwd(), "assets/fonts/Montserrat-latin-ext-400.woff")),
    readFile(join(process.cwd(), "assets/fonts/Montserrat-latin-ext-500.woff")),
    readFile(join(process.cwd(), "assets/fonts/Montserrat-latin-ext-600.woff")),
  ]);
  const weights = [400, 500, 600, 400, 500, 600] as const;
  return files.map((data, i) => ({ name: "Montserrat", data, weight: weights[i]!, style: "normal" as const }));
}

function Mark({ size, style }: { size: number; style?: React.CSSProperties }) {
  const { square: sq, triangle: tri, circle: ci } = markShapes;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`} style={style}>
      <rect x={sq.x} y={sq.y} width={sq.size} height={sq.size} rx={sq.radius} fill={color.ink} />
      <path d={tri.path} fill={color.ink} />
      <circle cx={ci.cx} cy={ci.cy} r={ci.r} fill={color.ink} />
    </svg>
  );
}

/**
 * Homepage share card: the mark as a mind, with what Keplar can do wired into it, over the light-theme aura
 * (src/styles/aura.css: peach, violet, cyan and gold in the four corners, the middle left clear).
 * Feature chips are live or beta features (src/lib/features.ts and the product pages), positioned by hand in rows
 * ([left, top, label]); each connects to the mark with a dotted stream.
 */
const MIND = { x: 890, y: 315, mark: 116 };
const AURA = [
  { cx: 0, cy: 0, rx: 560, ry: 270, rgb: "255,168,122", a: 0.55 },
  { cx: 1200, cy: 0, rx: 530, ry: 250, rgb: "168,112,176", a: 0.42 },
  { cx: 0, cy: 630, rx: 530, ry: 265, rgb: "72,186,196", a: 0.38 },
  { cx: 1200, cy: 630, rx: 580, ry: 280, rgb: "214,164,72", a: 0.5 },
];
const FEATURES: [number, number, string][] = [
  [600, 50, "Several models, one answer"],
  [856, 50, "Deep Research"],
  [1012, 50, "Debate mode"],
  [640, 114, "Disagreement map"],
  [820, 114, "Voice mode"],
  [954, 114, "Images & screenshots"],
  [600, 178, "Docs, code & data"],
  [786, 178, "Video"],
  [882, 178, "Fact-check"],
  [1016, 178, "Study tools"],
  [650, 242, "Slideshows"],
  [1000, 242, "Build sites & apps"],
  [610, 306, "Voice Live Create"],
  [1010, 306, "Version history"],
  [660, 370, "AI critic"],
  [996, 370, "Live collaboration"],
  [610, 434, "One-click publish"],
  [1020, 434, "Custom domains"],
  [650, 498, "Public API"],
  [800, 498, "Embeddable widget"],
  [990, 498, "Keplar for Teams"],
];

export async function renderHomeOg({ title, accent, subtitle }: { title: string; accent: string; subtitle: string }) {
  const chipH = 36;
  const chipW = (label: string) => label.length * 7.7 + 40; // Montserrat 14px, 500
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FFFCF8", position: "relative", fontFamily: "Montserrat" }}>
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          <defs>
            {AURA.map((g, i) => (
              <radialGradient key={i} id={`aura${i}`}>
                <stop offset="0%" stopColor={`rgb(${g.rgb})`} stopOpacity={g.a} />
                <stop offset="60%" stopColor={`rgb(${g.rgb})`} stopOpacity={g.a * 0.3} />
                <stop offset="100%" stopColor={`rgb(${g.rgb})`} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>
          {AURA.map((g, i) => (
            <ellipse key={i} cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry} fill={`url(#aura${i})`} />
          ))}
          {[84, 150, 230].map((r) => (
            <circle key={r} cx={MIND.x} cy={MIND.y} r={r} fill="none" stroke="rgba(9,9,11,0.07)" strokeWidth="1" />
          ))}
          <circle cx={MIND.x} cy={MIND.y} r="84" fill="rgba(255,255,255,0.75)" />
          {FEATURES.map(([x, y, label], i) => {
            const cx = x + chipW(label) / 2;
            const cy = y + chipH / 2;
            const mx = (cx + MIND.x) / 2 + (MIND.y - cy) * 0.15;
            const my = (cy + MIND.y) / 2 + (cx - MIND.x) * 0.15;
            return (
              <path
                key={label}
                d={`M${cx} ${cy} Q ${mx} ${my}, ${MIND.x} ${MIND.y}`}
                stroke={color.streams[i % color.streams.length]}
                strokeWidth="1.6"
                strokeDasharray="1.5 5"
                strokeLinecap="round"
                fill="none"
                opacity="0.6"
              />
            );
          })}
        </svg>
        {FEATURES.map(([x, y, label], i) => (
          <div
            key={label}
            style={{
              position: "absolute",
              left: x,
              top: y,
              height: chipH,
              display: "flex",
              alignItems: "center",
              padding: "0 15px 0 12px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.88)",
              // Space UI: no outlines; the chip separates by light and a soft drop
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 18px -10px rgba(9,9,11,0.35)",
              fontSize: 14,
              fontWeight: 500,
              color: color.ink,
              letterSpacing: "-0.01em",
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: 999, background: color.streams[i % color.streams.length], marginRight: 8 }} />
            {label}
          </div>
        ))}
        <Mark size={MIND.mark} style={{ position: "absolute", left: MIND.x - MIND.mark / 2, top: MIND.y - MIND.mark / 2 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 0 68px 72px", width: 580, height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Mark size={30} />
            <div style={{ fontSize: 28, fontWeight: 600, color: color.ink, letterSpacing: "-0.03em", marginLeft: 12 }}>Keplar</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 60, fontWeight: 600, color: color.ink, letterSpacing: "-0.05em", lineHeight: 1, maxWidth: 500 }}>{title}</div>
            <div style={{ fontSize: 60, fontWeight: 600, color: color.inkSecondary, letterSpacing: "-0.05em", lineHeight: 1, marginTop: 4 }}>{accent}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: color.inkSecondary, letterSpacing: "-0.01em", marginTop: 26, lineHeight: 1.32, maxWidth: 480 }}>{subtitle}</div>
          </div>
        </div>
      </div>
    ),
    { ...ogSize, fonts: await loadFonts() },
  );
}

/** On-brand share card: white, ink type, six streams converging on the mark. */
export async function renderOg({ title, subtitle, label }: { title: string; subtitle: string; label?: string }) {
  const streams = [
    "M-20 90 C 260 120, 560 360, 930 300",
    "M-20 210 C 300 250, 600 230, 930 300",
    "M-20 330 C 280 360, 620 330, 930 300",
    "M-20 450 C 320 420, 640 380, 930 300",
    "M-20 560 C 300 520, 580 300, 930 300",
    "M-20 30 C 380 60, 520 420, 930 300",
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: color.canvas, position: "relative", fontFamily: "Montserrat" }}>
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          {streams.map((d, i) => (
            <path key={d} d={d} stroke={color.streams[i]} strokeWidth="2" strokeDasharray="1.5 7" strokeLinecap="round" fill="none" opacity="0.55" />
          ))}
        </svg>
        <Mark size={210} style={{ position: "absolute", left: 895, top: 195 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 72px 80px", width: 860, height: "100%" }}>
          {label ? (
            <div style={{ fontSize: 18, fontWeight: 600, color: color.inkSecondary, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 24 }}>{label}</div>
          ) : null}
          <div style={{ fontSize: 76, fontWeight: 600, color: color.ink, letterSpacing: "-0.05em", lineHeight: 1.02, maxWidth: 640 }}>{title}</div>
          <div style={{ fontSize: 27, fontWeight: 500, color: color.inkSecondary, letterSpacing: "-0.01em", marginTop: 28, lineHeight: 1.25, maxWidth: 780 }}>{subtitle}</div>
        </div>
      </div>
    ),
    { ...ogSize, fonts: await loadFonts() },
  );
}
