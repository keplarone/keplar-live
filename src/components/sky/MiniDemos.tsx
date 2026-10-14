import { KeplarSymbol } from "@/components/brand";
import d from "./MiniDemos.module.css";

/**
 * Looping mini demos for the feature hover list (one per chapter in src/lib/features.ts). Each is a small app window drawn with
 * CSS shapes and keyframes, about six seconds a loop, and is mounted only while its row is hovered, so the loop starts from the top.
 * Decorative: the row text carries the meaning.
 */
export function MiniDemo({ id }: { id: string }) {
  return (
    <div className={d.win}>
      <div className={d.bar}><i /><i /><i /><span>{TITLES[id] ?? "Keplar"}</span></div>
      <div className={d.body}>{SCENES[id] ?? null}</div>
    </div>
  );
}

const TITLES: Record<string, string> = {
  understand: "lease.pdf",
  create: "Create",
  together: "Shared draft",
  ship: "Publish",
  platform: "Terminal",
  trust: "Privacy",
};

const SCENES: Record<string, React.ReactNode> = {
  // a file drops in, a highlight scans its lines, an answer chip appears
  understand: (
    <div className={d.understand}>
      <div className={d.doc}>
        <span className={d.docLines}><i /><i /><i /><i /><i /><i /></span>
        <span className={d.scan} />
      </div>
      <p className={d.found}><KeplarSymbol size={12} /> Clause 14: 60 days notice</p>
    </div>
  ),
  // a page assembles block by block
  create: (
    <div className={d.create}>
      <i className={d.blockNav} />
      <i className={d.blockHero} />
      <span className={d.blockRow}><i /><i /><i /></span>
      <i className={d.blockCta} />
    </div>
  ),
  // two named cursors move over a draft and a comment pops up
  together: (
    <div className={d.together}>
      <span className={d.lines}><i /><i /><i /><i /></span>
      <span className={d.cursorA}><svg viewBox="0 0 12 12"><path d="M1 1l10 4-4 1.5L5.5 11z" /></svg><b>Sam</b></span>
      <span className={d.cursorB}><svg viewBox="0 0 12 12"><path d="M1 1l10 4-4 1.5L5.5 11z" /></svg><b>Ana</b></span>
      <span className={d.comment}>Tighten this line?</span>
    </div>
  ),
  // publish button, progress, then a live URL
  ship: (
    <div className={d.ship}>
      <span className={d.publish}>Publish</span>
      <span className={d.progress}><i /></span>
      <span className={d.live}><i />Live · yoursite.keplar.app</span>
    </div>
  ),
  // a request types out and a JSON answer comes back
  platform: (
    <div className={d.platform}>
      <code className={d.cmd}>$ curl keplar.one/api/ask -d &quot;Is it safe?&quot;</code>
      <code className={d.json}>{"{"} &quot;answer&quot;: &quot;…&quot;, &quot;agree&quot;: 4 {"}"}</code>
    </div>
  ),
  // a checklist ticks itself
  trust: (
    <div className={d.trust}>
      <p><i />Files used for this answer only</p>
      <p><i />No training on your chats</p>
      <p><i />Delete any chat in one step</p>
    </div>
  ),
};
