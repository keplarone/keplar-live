import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MARK_SIZE, markShapes } from "@/components/brand/geometry";
import { color } from "./tokens";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

/** On-brand share card: white, ink type, six streams converging on the mark. */
export async function renderOg({ title, subtitle, label }: { title: string; subtitle: string; label?: string }) {
  const [regular, medium] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/GoogleSans-400.ttf")),
    readFile(join(process.cwd(), "assets/fonts/GoogleSans-500.ttf")),
  ]);
  const { square: sq, triangle: tri, circle: ci } = markShapes;
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
      <div style={{ width: "100%", height: "100%", display: "flex", background: color.canvas, position: "relative", fontFamily: "Google Sans" }}>
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          {streams.map((d, i) => (
            <path key={d} d={d} stroke={color.streams[i]} strokeWidth="2" strokeDasharray="1.5 7" strokeLinecap="round" fill="none" opacity="0.55" />
          ))}
        </svg>
        <svg width="210" height="210" viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`} style={{ position: "absolute", left: 895, top: 195 }}>
          <rect x={sq.x} y={sq.y} width={sq.size} height={sq.size} rx={sq.radius} fill={color.ink} />
          <path d={tri.path} fill={color.ink} />
          <circle cx={ci.cx} cy={ci.cy} r={ci.r} fill={color.ink} />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 72px 80px", width: 860, height: "100%" }}>
          {label ? (
            <div style={{ fontSize: 20, color: color.inkSecondary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 24 }}>{label}</div>
          ) : null}
          <div style={{ fontSize: 84, fontWeight: 500, color: color.ink, letterSpacing: "-0.045em", lineHeight: 0.98, maxWidth: 640 }}>{title}</div>
          <div style={{ fontSize: 30, color: color.inkSecondary, letterSpacing: "-0.015em", marginTop: 28, lineHeight: 1.25, maxWidth: 780 }}>{subtitle}</div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: "Google Sans", data: regular, weight: 400, style: "normal" },
        { name: "Google Sans", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
