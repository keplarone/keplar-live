import { ImageResponse } from "next/og";
import { BUSINESS_TIERS } from "@/lib/business/tiers";

export const dynamic = "force-static";

/** business.keplar.one/opengraph-image (src/proxy.ts): the Business share card, dark like the product. */
export function GET() {
  const from = BUSINESS_TIERS.starter.monthly!.toFixed(2);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: "#0b0b0d", color: "#f2f2f4", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 600 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#f2f2f4" }} />
          Keplar Business
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 66, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>AI agents, automation and one workspace for your business.</div>
          <div style={{ fontSize: 30, color: "#a4a6ad" }}>Research, design, build, automate and deploy. Desktop app for Windows, macOS and Linux.</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#8fb4ff" }}>Plans from ${from} a month · business.keplar.one</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
