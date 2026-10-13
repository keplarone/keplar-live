/**
 * Keplar app icon set: 16px grid, 1.4px hairline strokes, geometry drawn
 * from the mark (squares, right angles, circles). Decorative by default.
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
      strokeWidth={1.4}
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

export const IconPlus = (p: P) => <Svg {...p}><path d="M8 3.5v9M3.5 8h9" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="7" cy="7" r="4.25" /><path d="m10.2 10.2 2.8 2.8" /></Svg>;
export const IconProjects = (p: P) => <Svg {...p}><rect x="2.5" y="2.5" width="5" height="5" rx="1.4" /><rect x="8.5" y="8.5" width="5" height="5" rx="1.4" /><path d="M10 2.5h2a1.5 1.5 0 0 1 1.5 1.5v2M6 13.5H4A1.5 1.5 0 0 1 2.5 12v-2" /></Svg>;
export const IconAgents = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="2" /><path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2" /><circle cx="8" cy="8" r="5.5" strokeDasharray="1.6 2.2" /></Svg>;
export const IconCreate = (p: P) => <Svg {...p}><path d="M3 13 13 3" /><path d="M9.5 3H13v3.5" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1.2" /></Svg>;
export const IconImage = (p: P) => <Svg {...p}><rect x="2.5" y="3" width="11" height="10" rx="1.8" /><circle cx="6" cy="6.6" r="1.1" /><path d="m3 12 3.4-3.2 2.4 2.2 1.8-1.6L13 12" /></Svg>;
export const IconSlides = (p: P) => <Svg {...p}><rect x="2.5" y="3" width="11" height="7.5" rx="1.5" /><path d="M8 10.5v2.5M5.5 13h5" /></Svg>;
export const IconStudy = (p: P) => <Svg {...p}><path d="M2.5 5.2 8 2.8l5.5 2.4L8 7.6z" /><path d="M4.8 7v3c0 .9 1.5 1.8 3.2 1.8s3.2-.9 3.2-1.8V7" /><path d="M13.5 5.2v4" /></Svg>;
export const IconMore = (p: P) => <Svg {...p}><circle cx="3.5" cy="8" r="0.9" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" /><circle cx="12.5" cy="8" r="0.9" fill="currentColor" stroke="none" /></Svg>;
export const IconHistory = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2l2 1.3" /></Svg>;
export const IconAttach = (p: P) => <Svg {...p}><path d="M12.5 7.6 8 12.1a3 3 0 0 1-4.2-4.2l4.6-4.6a2 2 0 0 1 2.8 2.8L6.7 10.6a1 1 0 0 1-1.4-1.4L9.4 5" /></Svg>;
export const IconWeb = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c1.6 1.5 2.3 3.3 2.3 5.5S9.6 12 8 13.5C6.4 12 5.7 10.2 5.7 8S6.4 4 8 2.5" /></Svg>;
/** Debate mode: two speech bubbles facing each other. */
export const IconDebate = (p: P) => <Svg {...p}><path d="M2.5 3.5h6.5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5.5L3.5 10V8.5h-1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z" /><path d="M12 6.5h1.5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1V13l-2-1.5H8a1 1 0 0 1-1-1V10.5" /></Svg>;
/** Reason mode: a short list of steps, each ticked. */
export const IconReason = (p: P) => <Svg {...p}><path d="m2.5 4.5 1.2 1.2 2-2.2M2.5 10.5l1.2 1.2 2-2.2" /><path d="M8 4.5h5.5M8 10.5h5.5" /></Svg>;
export const IconDeep = (p: P) => <Svg {...p}><path d="M2.5 5 8 2.5 13.5 5 8 7.5z" /><path d="m2.5 8 5.5 2.5L13.5 8M2.5 11 8 13.5 13.5 11" /></Svg>;
export const IconAgentMode = IconAgents;
export const IconStop = (p: P) => <Svg {...p}><rect x="4.5" y="4.5" width="7" height="7" rx="1.5" fill="currentColor" stroke="none" /></Svg>;
export const IconMenu = (p: P) => <Svg {...p}><path d="M2.5 5.5h11M2.5 10.5h7" /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="m4 4 8 8M12 4l-8 8" /></Svg>;
export const IconSave = (p: P) => <Svg {...p}><path d="M8 2.5v7.5M4.5 6.5 8 10l3.5-3.5" /><path d="M3 12.5h10" /></Svg>;
export const IconCopy = (p: P) => <Svg {...p}><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" /><path d="M10.5 3.5A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 3.5 10.5" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="m3.5 8.5 3 3 6-7" /></Svg>;
export const IconChevron = (p: P) => <Svg {...p}><path d="m6 4 4 4-4 4" /></Svg>;
export const IconRouting = (p: P) => <Svg {...p}><path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" /><circle cx="10" cy="4.5" r="1.5" /><circle cx="6" cy="11.5" r="1.5" /></Svg>;
export const IconRetry = (p: P) => <Svg {...p}><path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M13 2.8v2.7h-2.7" /></Svg>;
export const IconEdit = (p: P) => <Svg {...p}><path d="M3 13h2.5l7-7a1.4 1.4 0 0 0-2-2l-7 7z" /><path d="M9.5 5 11 6.5" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" /></Svg>;
export const IconArrowDown = (p: P) => <Svg {...p}><path d="M8 3v10M4 9l4 4 4-4" /></Svg>;
export const IconBusiness = (p: P) => <Svg {...p}><rect x="2.5" y="5" width="11" height="8" rx="1.5" /><path d="M6 5V3.5h4V5M2.5 8.5h11" /></Svg>;

export function IconMic(p: P) {
  return (
    <Svg {...p}>
      <rect x="6" y="1.8" width="4" height="7.4" rx="2" />
      <path d="M3.6 7.6a4.4 4.4 0 0 0 8.8 0M8 12v2.2M5.6 14.2h4.8" />
    </Svg>
  );
}

export const IconAsk = (p: P) => <Svg {...p}><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5A1.5 1.5 0 0 1 11.5 11H7l-3 2.5V11H4.5A1.5 1.5 0 0 1 3 9.5z" /></Svg>;
export const IconMemory = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="1.4" /><circle cx="3.6" cy="4.4" r="1" /><circle cx="12.4" cy="5" r="1" /><circle cx="11" cy="12.2" r="1" /><path d="M4.4 5 7 7.2M11.5 5.7 9.2 7.3M9.8 11.4 8.8 9.2" /></Svg>;
export const IconApprovals = (p: P) => <Svg {...p}><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="m5.5 8.2 1.8 1.8 3.2-3.6" /></Svg>;
export const IconUsage = (p: P) => <Svg {...p}><path d="M3 13V8.5M7 13V4M11 13V6.5M14 13H2" /></Svg>;
// Gear: drawn on a 24px grid and scaled to 16, so the stroke is widened to keep the 1.4px hairline.
export const IconSettings = (p: P) => <Svg {...p}><g transform="scale(0.6667)" strokeWidth={2.1}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></g></Svg>;
/** Roblox Studio mode: a tilted block with a window cut in it. */
export const IconRobloxStudio = (p: P) => <Svg {...p}><path d="M4.2 2.6 13.4 4.2 11.8 13.4 2.6 11.8Z" /><path d="M7 7.1 9.1 7.5 8.7 9.6 6.6 9.2Z" /></Svg>;
export const IconDeploy = (p: P) => <Svg {...p}><path d="M8 13.5V6M5 8.5 8 5.5l3 3" /><path d="M3 3h10" /></Svg>;

export const IconThumb = ({ up, ...p }: P & { up?: boolean }) => (
  <Svg {...p}>
    <g transform={up ? undefined : "rotate(180 8 8)"}>
      <path d="M5.2 7.2v6H3.4a.9.9 0 0 1-.9-.9V8.1c0-.5.4-.9.9-.9h1.8Z" />
      <path d="M5.2 7.2 7.6 2.6c.8 0 1.5.7 1.5 1.5v2h3a1 1 0 0 1 1 1.2l-.9 4.5a1.2 1.2 0 0 1-1.2 1H5.2" />
    </g>
  </Svg>
);

/** Speaker with sound waves: read the answer aloud. */
export function IconSpeaker(p: P) {
  return (
    <Svg {...p}>
      <path d="M2.2 6.2h2.4L8 3.4v9.2L4.6 9.8H2.2z" />
      <path d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.2 3.8a6 6 0 0 1 0 8.4" />
    </Svg>
  );
}

/** Rounded square: stop playback. */
export function IconStopSquare(p: P) {
  return (
    <Svg {...p}>
      <rect x="3.6" y="3.6" width="8.8" height="8.8" rx="1.8" />
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
