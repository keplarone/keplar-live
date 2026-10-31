"use client";

import { useRef, useState } from "react";
import { Button as KitButton, IconButton as KitIconButton, Menu, MenuItem, SegmentedControl, Switch } from "@/components/kit";
import { IconCopy, IconPlus, IconRetry, IconTrash } from "@/components/app-ui/icons";
import { Rail } from "@/components/app-ui/shell/Rail";
import { ContextPanel, type ContextTab } from "@/components/app-ui/shell/ContextPanel";
import type { KeplarMessage, View } from "@/components/app-ui/state/types";
import { Button, ButtonLink, Chip, IconButton } from "./Button";
import { flashSuccess } from "@/lib/orbit-fx";
import s from "./Showcase.module.css";

/**
 * The Keplar Orbit living reference (/dev/orbit, dev tools only). Tokens, type, every control in every state, and the app shell
 * pieces, rendered from the real components. Guide: docs/design/keplar-orbit.md.
 */
const COLORS = ["canvas", "surface-1", "surface-2", "surface-3", "line", "line-strong", "ink", "ink-2", "ink-3", "accent", "accent-hover", "accent-soft", "accent-text", "good", "warn", "bad"];
const TYPE = [64, 48, 36, 28, 22, 18, 16, 14, 13, 12, 11];
const RADII = [["chip", 6], ["control", 10], ["card", 14], ["panel", 20], ["pill", 999]] as const;

const Send = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
  </svg>
);
const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </svg>
);

const MOCK: KeplarMessage = {
  id: "m1",
  role: "keplar",
  replyTo: "u1",
  status: "done",
  stages: [],
  capabilities: [],
  models: [],
  draft: "",
  memory: { saved: 1, used: 2 },
  answer: {
    id: "a1",
    markdown: "",
    consensus: { level: "strong", score: 0.9, agree: 3, disagree: 0, missing: 0, responded: 3, consulted: 3, summary: "All three models agree on the answer; one adds a caveat about dates." },
    models: [
      { id: "c", name: "Claude", provider: "Anthropic", slot: "primary", status: "responded", stance: "Agrees" },
      { id: "g", name: "GPT", provider: "OpenAI", slot: "primary", status: "responded", stance: "Agrees, adds a caveat" },
      { id: "d", name: "DeepSeek", provider: "DeepSeek", slot: "primary", status: "responded", stance: "Agrees" },
    ],
    sources: [
      { kind: "web", title: "Keplar documentation", url: "https://keplar.one/docs" },
      { kind: "note", title: "Your note: meeting summary", detail: "Attached to this chat" },
    ],
    disagreements: [],
    verification: { mode: "none", summary: "", checks: [], notes: [] },
    reasoning: "",
    capabilities: [],
    compute: { units: 1, level: "standard" },
    durationMs: 1200,
  },
} as unknown as KeplarMessage;

export function OrbitShowcase() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [seg, setSeg] = useState<"day" | "week" | "month">("week");
  const [chip, setChip] = useState(true);
  const [sw, setSw] = useState(true);
  const [view, setView] = useState<View>("thread");
  const [drawer, setDrawer] = useState(true);
  const [tab, setTab] = useState<ContextTab>("sources");
  const copyRef = useRef<HTMLButtonElement>(null);

  const run = () => {
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    }, 1400);
  };

  return (
    <div className={s.page} data-orbit-showcase="">
      <header className={s.head}>
        <p className={s.kicker} data-o="Showcase kicker">Keplar Orbit</p>
        <h1 className={s.title} data-o="Showcase title">The interface system</h1>
        <p className={s.lede}>Tokens, type, controls and the app shell, rendered from the real components. Guide: docs/design/keplar-orbit.md.</p>
      </header>

      <section className={s.section} aria-labelledby="o-color">
        <h2 id="o-color" className={s.h2}>Color</h2>
        <ul className={s.swatches}>
          {COLORS.map((c) => (
            <li key={c} className={s.swatch}>
              <span className={s.chipColor} style={{ background: `var(--o-${c})` }} />
              <code>--o-{c}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-labelledby="o-type">
        <h2 id="o-type" className={s.h2}>Type</h2>
        <div className={s.typeList}>
          {TYPE.map((t) => (
            <p key={t} style={{ fontSize: `var(--o-t-${t})`, fontWeight: t >= 28 ? 600 : 400, letterSpacing: t >= 32 ? "var(--o-tr-display)" : undefined, lineHeight: t >= 28 ? "var(--o-lh-display)" : "var(--o-lh-text)" }}>
              <span className={s.typeTag}>{t}</span> Several models. One answer.
            </p>
          ))}
          <p style={{ fontFamily: "var(--o-font-mono)", fontSize: "var(--o-t-14)" }}>
            <span className={s.typeTag}>mono</span> const answer = await keplar.ask(&quot;why is the sky blue?&quot;);
          </p>
        </div>
      </section>

      <section className={s.section} aria-labelledby="o-shape">
        <h2 id="o-shape" className={s.h2}>Radius and elevation</h2>
        <div className={s.row}>
          {RADII.map(([n, v]) => (
            <div key={n} className={s.shape} style={{ borderRadius: `var(--o-r-${n})` }}>
              {n} · {v}
            </div>
          ))}
        </div>
        <div className={s.row}>
          {[0, 1, 2, 3].map((e) => (
            <div key={e} className={s.elev} style={{ boxShadow: `var(--o-elev-${e})` }}>
              elev-{e}
            </div>
          ))}
        </div>
      </section>

      <section className={s.section} aria-labelledby="o-buttons">
        <h2 id="o-buttons" className={s.h2}>Buttons</h2>
        <p className={s.note}>Hover for the sheen (and the magnet on primary and icon buttons), press for the spring, Tab for the focus ring. Reduced motion: no sheen, magnet or icon motion. Touch: press and focus only.</p>
        <div className={s.grid}>
          {(["primary", "secondary", "ghost", "danger"] as const).map((v) => (
            <div key={v} className={s.cell} data-variant-row={v}>
              <span className={s.label}>{v}</span>
              <Button variant={v}>Continue</Button>
              <Button variant={v} size="sm">Small</Button>
              <Button variant={v} disabled>Disabled</Button>
              <Button variant={v} loading>Saving</Button>
              <Button variant={v} success>Saved</Button>
            </div>
          ))}
        </div>
        <div className={s.row}>
          <Button variant="primary" loading={busy} success={done} onClick={run} data-demo-run="">Publish site</Button>
          <Button variant="secondary" leadingIcon={<IconPlus size={16} />} intent="plus">New project</Button>
          <ButtonLink href="/pricing" variant="secondary" trailingIcon={<Chevron />} intent="chevron">See plans</ButtonLink>
          <Button
            ref={copyRef}
            variant="ghost"
            leadingIcon={<IconCopy size={16} />}
            intent="copy"
            onClick={() => flashSuccess(copyRef.current)}
          >
            Copy link
          </Button>
        </div>
        <h3 className={s.h3}>Icon buttons and micro-motion</h3>
        <div className={s.row}>
          <IconButton label="Send" icon={<Send />} variant="primary" shape="circle" intent="send" />
          <IconButton label="New chat" icon={<IconPlus size={18} />} intent="plus" />
          <IconButton label="Copy answer" icon={<IconCopy size={18} />} intent="copy" />
          <IconButton label="Delete chat" icon={<IconTrash size={18} />} intent="trash" />
          <IconButton label="Ask again" icon={<IconRetry size={18} />} intent="refresh" />
          <IconButton label="Next" icon={<Chevron />} intent="chevron" variant="secondary" />
          <IconButton label="Pressed" icon={<IconCopy size={18} />} pressed />
          <IconButton label="Disabled" icon={<IconTrash size={18} />} disabled />
        </div>
        <h3 className={s.h3}>Chips, segmented control, switch, menu</h3>
        <div className={s.row}>
          <Chip selected={chip} onClick={() => setChip((v) => !v)}>Web</Chip>
          <Chip>Deep Research</Chip>
          <Chip disabled>Debate</Chip>
          <SegmentedControl label="Range" value={seg} onValueChange={setSeg} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
          <Switch checked={sw} onCheckedChange={setSw} label="Memory" />
          <Menu label="More" trigger={(p) => <KitButton {...p} variant="secondary">Menu</KitButton>}>
            <MenuItem onSelect={() => undefined}>Rename</MenuItem>
            <MenuItem onSelect={() => undefined}>Move to project</MenuItem>
            <MenuItem danger onSelect={() => undefined}>Delete</MenuItem>
          </Menu>
        </div>
        <h3 className={s.h3}>Existing primitives (kit), same effects</h3>
        <div className={s.row}>
          <KitButton variant="primary">Kit primary</KitButton>
          <KitButton variant="secondary">Kit secondary</KitButton>
          <KitButton variant="ghost">Kit ghost</KitButton>
          <KitButton variant="primary" loading>Kit loading</KitButton>
          <KitIconButton label="Kit copy" icon={<IconCopy size={16} />} />
        </div>
      </section>

      <section className={s.section} aria-labelledby="o-shell">
        <h2 id="o-shell" className={s.h2}>App shell</h2>
        <p className={s.note}>The rail (56px, sliding active pill), the drawer (264px, Ctrl/⌘+\), the 760px canvas and the context panel (Sources, Models, Memory).</p>
        <div className={s.shell}>
          <Rail active={view} mac={false} onNew={() => setView("thread")} onSearch={() => undefined} onView={setView} onToggleDrawer={() => setDrawer((v) => !v)} drawerShown={drawer} signedIn />
          {drawer ? (
            <div className={s.mockDrawer} aria-label="Drawer (sample)" role="group">
              <p className={s.label}>Today</p>
              <p className={s.mockRow} data-on="">Why is the sky blue?</p>
              <p className={s.mockRow}>Plan a week in Lisbon</p>
              <p className={s.label}>Yesterday</p>
              <p className={s.mockRow}>Compare three laptops</p>
            </div>
          ) : null}
          <div className={s.mockCanvas}>
            <p className={s.mockUser}>Why is the sky blue?</p>
            <p className={s.mockAnswer}>Sunlight scatters off air molecules, and shorter (blue) wavelengths scatter the most, so blue light reaches your eyes from every direction of the sky.</p>
          </div>
          <div className={s.mockContext}>
            <ContextPanel msg={MOCK} memoryOn tab={tab} onTab={setTab} onClose={() => undefined} autoFocus={false} />
          </div>
        </div>
      </section>
    </div>
  );
}
