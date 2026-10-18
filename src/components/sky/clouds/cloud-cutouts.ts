/** Photographic cumulus placed at the sides, corners and lower frame. The centre stays sky. */
export type CloudCutout = {
  src: string;
  /** Far drifts slower than near, so the two layers parallax. */
  layer: "far" | "near";
  /** Shown when the live weather is overcast, wet or snowy. */
  extra?: boolean;
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
  { src: "/sky/clouds/cumulus-1.webp", layer: "far", left: "-4%", top: "-4%", width: "36%", w: 480, h: 350, dur: "150s", dx: "3.2%", dy: "0.4%", delay: "-20s" },
  { src: "/sky/clouds/cumulus-2.webp", layer: "far", right: "-4%", top: "46%", width: "36%", w: 480, h: 331, dur: "170s", dx: "2.8%", dy: "0.3%", delay: "-60s" },
  { src: "/sky/clouds/cumulus-3.webp", layer: "far", left: "-8%", top: "62%", width: "34%", w: 440, h: 370, dur: "160s", dx: "3%", dy: "0.5%", delay: "-90s" },
  { src: "/sky/clouds/cumulus-4.webp", layer: "near", left: "-10%", top: "18%", width: "40%", w: 600, h: 596, dur: "78s", dx: "6.5%", dy: "0.7%", delay: "-12s" },
  { src: "/sky/clouds/cumulus-5.webp", layer: "near", right: "-6%", top: "24%", width: "38%", w: 560, h: 590, dur: "70s", dx: "7%", dy: "0.6%", delay: "-36s" },
  { src: "/sky/clouds/cumulus-6.webp", layer: "near", right: "2%", top: "64%", width: "36%", w: 540, h: 536, dur: "84s", dx: "6%", dy: "0.8%", delay: "-48s" },
  { src: "/sky/clouds/cumulus-7.webp", layer: "near", extra: true, left: "-2%", top: "74%", width: "30%", w: 440, h: 315, dur: "90s", dx: "5%", dy: "0.4%", delay: "-8s" },
  { src: "/sky/clouds/cumulus-8.webp", layer: "far", extra: true, right: "16%", top: "54%", width: "28%", w: 420, h: 299, dur: "140s", dx: "3.4%", dy: "0.3%", delay: "-70s" },
];
