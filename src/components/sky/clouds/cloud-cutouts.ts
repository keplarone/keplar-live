/** Photographic cumulus at the edges and corners. The hero sky stays clear. */
export type CloudCutout = {
  src: string;
  /** Far drifts slower than near, so the two layers parallax. */
  layer: "far" | "near";
  /** Hidden at phone width so a small screen shows three clouds, not four. */
  hideOnPhone?: boolean;
  left?: string;
  right?: string;
  top: string;
  width: string;
  w: number;
  h: number;
  dur: string;
  dx: string;
  dy: string;
  delay: string;
};

export const CLOUD_CUTOUTS: CloudCutout[] = [
  { src: "/sky/clouds/cumulus-1.webp", layer: "far", left: "-8%", top: "-12%", width: "28%", w: 560, h: 366, dur: "160s", dx: "2.2%", dy: "0.3%", delay: "-20s" },
  { src: "/sky/clouds/cumulus-2.webp", layer: "far", right: "-10%", top: "-8%", width: "26%", w: 540, h: 359, dur: "180s", dx: "2%", dy: "0.25%", delay: "-70s" },
  { src: "/sky/clouds/cumulus-3.webp", layer: "near", hideOnPhone: true, left: "-12%", top: "62%", width: "32%", w: 560, h: 392, dur: "90s", dx: "2.4%", dy: "0.4%", delay: "-30s" },
  { src: "/sky/clouds/cumulus-4.webp", layer: "near", right: "-8%", top: "64%", width: "30%", w: 580, h: 409, dur: "80s", dx: "2.6%", dy: "0.35%", delay: "-48s" },
];
