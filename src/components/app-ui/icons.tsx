/**
 * Keplar Icons v2 (Oct 2026). Drawn for Keplar, not taken from a stock set.
 *
 * Every glyph is built from the mark's three shapes (src/components/brand/KeplarSymbol.tsx): a soft square (rx 2.5 to 3), a
 * triangle and a circle. 16px grid, a light 1.3px stroke with round ends and joins, so the set reads light and soft next to
 * the site face, Nunito Sans (the weight of Gemini's light symbols, in our own forms).
 *
 * Signature: the "orbit" dot, a solid circle from the mark, used only on Keplar's own actions (new chat and add, search,
 * create, deep research, history, memory, settings, web, the sidebar menu). Universal controls (close, check, chevrons,
 * arrows, copy, stop, thumbs) stay plain so they read at a glance (HIG: familiarity). Decorative by default: every control
 * that uses one carries its own accessible label.
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** The mark's circle, filled: Keplar's accent on its own actions. */
const Dot = ({ cx, cy, r = 1.15 }: { cx: number; cy: number; r?: number }) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

/** Add / new chat: four short arms around the orbit dot. Rotated 45° (Attach open) it reads as close. */
export const IconPlus = (p: P) => <Svg {...p}><path d="M8 2.75v3.4M8 9.85v3.4M2.75 8h3.4M9.85 8h3.4" /><Dot cx={8} cy={8} r={1.05} /></Svg>;
/** Search: a soft-square lens from the mark, not the stock circle. */
export const IconSearch = (p: P) => <Svg {...p}><rect x="2.4" y="2.4" width="8.4" height="8.4" rx="3" /><path d="M10.9 10.9 13.6 13.6" /></Svg>;
/** Projects: two soft squares linked at the corners. */
export const IconProjects = (p: P) => <Svg {...p}><rect x="2.4" y="2.4" width="5.4" height="5.4" rx="1.9" /><rect x="8.2" y="8.2" width="5.4" height="5.4" rx="1.9" /><path d="M10.4 2.4h1.2a2 2 0 0 1 2 2v1.2M5.6 13.6H4.4a2 2 0 0 1-2-2v-1.2" /></Svg>;
/** Agents: a dashed orbit around a solid core. */
export const IconAgents = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="5.4" strokeDasharray="1.7 2.2" /><circle cx="8" cy="8" r="2.1" /><Dot cx={12.6} cy={4.2} r={1} /></Svg>;
/** Create: the mark taken apart: a soft square, a triangle and the orbit dot. */
export const IconCreate = (p: P) => <Svg {...p}><rect x="2.4" y="6.6" width="7" height="7" rx="2.4" /><path d="M10.8 2.4 13.8 7.6H7.8Z" /><Dot cx={12.3} cy={11.9} r={1.25} /></Svg>;
/** Image: a soft frame, a triangle hill and the sun as the orbit dot. */
export const IconImage = (p: P) => <Svg {...p}><rect x="2" y="2.8" width="12" height="10.4" rx="3" /><path d="m4.6 11 2.7-3.4 2 2.3 1.4-1.4 1.6 2.5" /><Dot cx={10.7} cy={6.1} r={1.05} /></Svg>;
export const IconSlides = (p: P) => <Svg {...p}><rect x="2.2" y="2.8" width="11.6" height="7.8" rx="2.4" /><path d="M8 10.6v2.6M5.6 13.2h4.8" /></Svg>;
/** Study: an open book (not the stock mortarboard). */
export const IconStudy = (p: P) => <Svg {...p}><path d="M8 4.6C6.5 3.6 4.5 3.2 2.4 3.5v8.7c2.1-.3 4.1.1 5.6 1.1 1.5-1 3.5-1.4 5.6-1.1V3.5c-2.1-.3-4.1.1-5.6 1.1Z" /><path d="M8 4.6v8.7" /></Svg>;
export const IconMore = (p: P) => <Svg {...p}><circle cx="3.5" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="12.5" cy="8" r="1" fill="currentColor" stroke="none" /></Svg>;
/** History: an open orbit that starts at the dot, with the hands inside. */
export const IconHistory = (p: P) => <Svg {...p}><path d="M3.2 6.3A5.2 5.2 0 1 1 3.4 10.4" /><path d="M8 5.2V8l1.9 1.3" /><Dot cx={3.6} cy={4.6} r={1.05} /></Svg>;
export const IconAttach = (p: P) => <Svg {...p}><path d="M12.4 7.6 8 12a3 3 0 0 1-4.2-4.2l4.5-4.5a2 2 0 0 1 2.8 2.8L6.7 10.5a1 1 0 0 1-1.4-1.4L9.3 5" /></Svg>;
/** Web: a planet with a tilted ring and a moon. */
export const IconWeb = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="4.6" /><ellipse cx="8" cy="8" rx="6.6" ry="2.3" transform="rotate(-24 8 8)" /><Dot cx={12.8} cy={3.4} r={0.95} /></Svg>;
/** Debate mode: two speech bubbles facing each other. */
export const IconDebate = (p: P) => <Svg {...p}><path d="M2.6 3.4H9a1.2 1.2 0 0 1 1.2 1.2v2.9A1.2 1.2 0 0 1 9 8.7H5.6L3.6 10.2V8.7h-1A1.2 1.2 0 0 1 1.4 7.5V4.6a1.2 1.2 0 0 1 1.2-1.2Z" /><path d="M12.2 6.4h1.2a1.2 1.2 0 0 1 1.2 1.2v2.9a1.2 1.2 0 0 1-1.2 1.2h-1v1.5l-2-1.5H8.2A1.2 1.2 0 0 1 7 10.5V10.4" /></Svg>;
/** Reason mode: a short list of steps, each ticked. */
export const IconReason = (p: P) => <Svg {...p}><path d="m2.4 4.5 1.2 1.2 2-2.2M2.4 10.5l1.2 1.2 2-2.2" /><path d="M8 4.5h5.6M8 10.5h5.6" /></Svg>;
/** Deep research: nested soft squares going down to the dot. */
export const IconDeep = (p: P) => <Svg {...p}><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="3.4" /><rect x="5" y="5" width="6" height="6" rx="2" /><Dot cx={8} cy={8} r={0.95} /></Svg>;
export const IconAgentMode = IconAgents;
export const IconStop = (p: P) => <Svg {...p}><rect x="4.5" y="4.5" width="7" height="7" rx="1.8" fill="currentColor" stroke="none" /></Svg>;
/** Sidebar menu: two lines of different length ending at the dot. */
export const IconMenu = (p: P) => <Svg {...p}><path d="M2.6 5.4h10.8M2.6 10.6h6.6" /><Dot cx={12.5} cy={10.6} r={1.1} /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="m4 4 8 8M12 4l-8 8" /></Svg>;
export const IconSave = (p: P) => <Svg {...p}><path d="M8 2.5v7.5M4.6 6.6 8 10l3.4-3.4" /><path d="M3 12.8h10" /></Svg>;
export const IconCopy = (p: P) => <Svg {...p}><rect x="5.6" y="5.6" width="7.9" height="7.9" rx="2.2" /><path d="M10.4 3.4a1.8 1.8 0 0 0-1.6-1H4.3a1.8 1.8 0 0 0-1.9 1.9v4.5a1.8 1.8 0 0 0 1 1.6" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="m3.5 8.5 3 3 6-7" /></Svg>;
export const IconChevron = (p: P) => <Svg {...p}><path d="m6 4 4 4-4 4" /></Svg>;
export const IconRouting = (p: P) => <Svg {...p}><path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" /><circle cx="10" cy="4.5" r="1.5" /><circle cx="6" cy="11.5" r="1.5" /></Svg>;
export const IconRetry = (p: P) => <Svg {...p}><path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M13 2.8v2.7h-2.7" /></Svg>;
/** Edit: the mark's triangle as the nib. */
export const IconEdit = (p: P) => <Svg {...p}><path d="M2.8 13.2 3.6 10 10.4 3.2a1.4 1.4 0 0 1 2 0l.4.4a1.4 1.4 0 0 1 0 2L6 12.4Z" /><path d="M2.8 13.2 6 12.4 3.6 10Z" fill="currentColor" /></Svg>;
/** Delete: a soft-square bin with a rounded handle. */
export const IconTrash = (p: P) => <Svg {...p}><path d="M2.8 4.6h10.4" /><rect x="4.2" y="4.6" width="7.6" height="9" rx="2.2" /><path d="M6.4 4.6a1.6 1.6 0 0 1 3.2 0M6.8 7.4v3.4M9.2 7.4v3.4" /></Svg>;
export const IconArrowDown = (p: P) => <Svg {...p}><path d="M8 3v10M4 9l4 4 4-4" /></Svg>;
export const IconBusiness = (p: P) => <Svg {...p}><rect x="2.4" y="5" width="11.2" height="8.2" rx="2.2" /><path d="M6 5V3.6h4V5M2.4 8.6h11.2" /></Svg>;

/** Dictate: a capsule and its pickup arc. */
export function IconMic(p: P) {
  return (
    <Svg {...p}>
      <rect x="5.8" y="1.9" width="4.4" height="7.6" rx="2.2" />
      <path d="M3.5 7.7a4.5 4.5 0 0 0 9 0M8 12.2v1.9" />
    </Svg>
  );
}

export const IconAsk = (p: P) => <Svg {...p}><path d="M3 5.4A2.4 2.4 0 0 1 5.4 3h5.2A2.4 2.4 0 0 1 13 5.4v3.2a2.4 2.4 0 0 1-2.4 2.4H7l-3 2.5V11a2.4 2.4 0 0 1-1-2Z" /></Svg>;
export const IconSpace = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="2" /><circle cx="8" cy="8" r="5.4" /><Dot cx={11.8} cy={4.2} r={0.95} /></Svg>;
export const IconMemory = (p: P) => <Svg {...p}><Dot cx={8} cy={8} r={1.4} /><circle cx="3.6" cy="4.4" r="1.1" /><circle cx="12.4" cy="5" r="1.1" /><circle cx="11" cy="12.2" r="1.1" /><path d="M4.5 5.1 6.9 7.2M11.5 5.7 9.3 7.3M10.4 11.2 8.9 9.3" /></Svg>;
export const IconApprovals = (p: P) => <Svg {...p}><rect x="2.4" y="2.4" width="11.2" height="11.2" rx="3" /><path d="m5.4 8.2 1.8 1.8 3.4-3.7" /></Svg>;
export const IconUsage = (p: P) => <Svg {...p}><path d="M3 13V8.5M7 13V4M11 13V6.5M14 13H2" /></Svg>;
/** Settings: two tuning sliders, each knob a soft square from the mark (a ring with notches read as the theme toggle's sun). */
export const IconSettings = (p: P) => (
  <Svg {...p}>
    <path d="M2.4 5h5.4M12.6 5h1M2.4 11h1M8.2 11h5.4" />
    <rect x="8.2" y="3.2" width="3.6" height="3.6" rx="1.3" />
    <rect x="3.8" y="9.2" width="3.6" height="3.6" rx="1.3" />
  </Svg>
);
/** Roblox Studio mode: a tilted block with a window cut in it. */
export const IconRobloxStudio = (p: P) => <Svg {...p}><path d="M4.2 2.6 13.4 4.2 11.8 13.4 2.6 11.8Z" /><path d="M7 7.1 9.1 7.5 8.7 9.6 6.6 9.2Z" /></Svg>;
export const IconApps = (p: P) => <Svg {...p}><rect x="2.4" y="2.4" width="4.6" height="4.6" rx="1.6" /><rect x="9" y="2.4" width="4.6" height="4.6" rx="1.6" /><rect x="2.4" y="9" width="4.6" height="4.6" rx="1.6" /><path d="M11.3 9v4.6M9 11.3h4.6" /></Svg>;
export const IconDeploy = (p: P) => <Svg {...p}><path d="M8 13.5V6M5 8.5 8 5.5l3 3" /><path d="M3 3h10" /></Svg>;

export const IconThumb = ({ up, ...p }: P & { up?: boolean }) => (
  <Svg {...p}>
    <g transform={up ? undefined : "rotate(180 8 8)"}>
      <path d="M5.2 7.2v6H3.6a1.1 1.1 0 0 1-1.1-1.1V8.3c0-.6.5-1.1 1.1-1.1h1.6Z" />
      <path d="M5.2 7.2 7.6 2.6c.8 0 1.5.7 1.5 1.5v2h3a1 1 0 0 1 1 1.2l-.9 4.5a1.2 1.2 0 0 1-1.2 1H5.2" />
    </g>
  </Svg>
);

/** Speaker with sound waves: read the answer aloud. */
export function IconSpeaker(p: P) {
  return (
    <Svg {...p}>
      <path d="M2.2 6.3h2.3L8 3.4v9.2L4.5 9.7H2.2Z" />
      <path d="M10.4 5.7a3.3 3.3 0 0 1 0 4.6M12.2 3.9a5.9 5.9 0 0 1 0 8.2" />
    </Svg>
  );
}

/** Rounded square: stop playback. */
export function IconStopSquare(p: P) {
  return (
    <Svg {...p}>
      <rect x="3.6" y="3.6" width="8.8" height="8.8" rx="2.2" />
    </Svg>
  );
}

/** Sound bars: Voice mode "Talk" (the plain microphone stays on Dictate). */
export function IconTalk(p: P) {
  return (
    <Svg {...p}>
      <path d="M2.6 6.6v2.8M5.3 4.2v7.6M8 2.4v11.2M10.7 4.6v6.8M13.4 6.8v2.4" />
    </Svg>
  );
}

/* Sidebar footer links (Gemini's About / Get the app / For Business / Pricing row), drawn in the same Keplar v2 language. */
/** About Keplar: the mark's three shapes, small — soft square, triangle and the orbit dot. */
export const IconAbout = (p: P) => (
  <Svg {...p}>
    <rect x="2.4" y="2.4" width="5.2" height="5.2" rx="1.8" />
    <path d="M11 2.6 13.6 7.2H8.4Z" />
    <Dot cx={8} cy={11.4} r={1.9} />
  </Svg>
);
/** Get the app: the send button's triangle head, pointing down into a soft tray. */
export const IconGetApp = (p: P) => (
  <Svg {...p}>
    <path d="M8 2.4v5.2M5.7 7.2 8 10.2l2.3-3Z" />
    <path d="M2.6 10.2v1.4a2 2 0 0 0 2 2h6.8a2 2 0 0 0 2-2v-1.4" />
  </Svg>
);
/** For Business: a soft-square case with the orbit dot as its clasp. */
export const IconBusinessCase = (p: P) => (
  <Svg {...p}>
    <rect x="2.4" y="5" width="11.2" height="8.4" rx="2.4" />
    <path d="M6 5V3.8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V5" />
    <Dot cx={8} cy={9.2} r={1.05} />
  </Svg>
);
/** Pricing: a soft tag, the orbit dot as its eyelet. */
export const IconPricing = (p: P) => (
  <Svg {...p}>
    <path d="M2.6 3.9v3.3c0 .4.15.75.42 1.03l4.8 4.8a1.4 1.4 0 0 0 2 0l3.25-3.25a1.4 1.4 0 0 0 0-2l-4.8-4.8a1.45 1.45 0 0 0-1.03-.42H3.9a1.3 1.3 0 0 0-1.3 1.3Z" />
    <Dot cx={5.5} cy={5.5} r={1.05} />
  </Svg>
);
