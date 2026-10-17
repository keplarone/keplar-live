"use client";

import { useRef, useState } from "react";
import { Button, ButtonLink, Card, Dialog, Disclosure, Field, Input, Notice, Panel, Popover, RollingNumber, RotatingHeadline, SegmentedControl, Select, Skeleton, Textarea, Toggle, Tooltip, spaceFx, type SpaceButtonStatus } from "./index";

const LINES = [
  ["Ask", "every model at once."],
  ["Compare", "where they disagree."],
  ["Build", "apps from one prompt."],
  ["Study", "anything, step by step."],
] as const;

/** The dev-only Space UI showcase (/dev/space-ui). Not linked anywhere; a living reference for the components in this folder. */
export function SpaceUiShowcase() {
  const [status, setStatus] = useState<SpaceButtonStatus>("idle");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [on, setOn] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [pop, setPop] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const run = () => {
    setStatus("loading");
    window.setTimeout(() => setStatus("success"), 1400);
    window.setTimeout(() => setStatus("idle"), 3200);
  };
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "140px 24px 96px", display: "flex", flexDirection: "column", gap: 40 }}>
      <header className="sp-rise" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <span className="sp-eyebrow">Space UI · dev showcase</span>
        <RotatingHeadline className="sp-hero-title" lines={LINES} label="Space UI showcase" warp />
        <p className="sp-lede">Space Studio&apos;s design language on keplar.one. Guide: docs/design/space-ui.md.</p>
      </header>

      <Card style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Buttons</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
          <Button variant="primary" status={status} successLabel="Saved" onClick={run}>Save changes</Button>
          <Button variant="secondary" arrow>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" size="lg" onClick={() => spaceFx.prompt()}>Warp the stars</Button>
          <ButtonLink href="/pricing" variant="secondary">ButtonLink</ButtonLink>
          <Tooltip content="Search everything"><Button iconOnly label="Search" variant="secondary">⌕</Button></Tooltip>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
        <Card style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Controls</h2>
          <SegmentedControl label="Billing period" value={period} onChange={setPeriod} segments={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]} />
          <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.04em" }}>
            $<RollingNumber value={period === "month" ? 45 : 432} />
          </div>
          <Toggle checked={on} onChange={setOn} label="Private chat" description="Nothing from this chat is saved." />
          <Disclosure summary="Show the details">The panel resolves in with the Space swap.</Disclosure>
        </Card>
        <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Fields</h2>
          <Field label="Email" hint="We never share it.">{(a) => <Input type="email" placeholder="you@example.com" {...a} />}</Field>
          <Field label="Plan" error={period === "year" ? undefined : undefined}>{(a) => <Select {...a} defaultValue="plus"><option value="free">Free</option><option value="plus">Plus</option></Select>}</Field>
          <Field label="Message">{(a) => <Textarea placeholder="Ask anything" {...a} />}</Field>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
        <Panel title="Panel (dense app UI)" actions={<Button size="sm" variant="ghost">Edit</Button>}>
          <Skeleton lines={3} />
        </Panel>
        <Card interactive style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Overlays</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={() => setDialog(true)}>Open dialog</Button>
            <Button ref={anchor} variant="secondary" aria-expanded={pop} onClick={() => setPop((v) => !v)}>Open popover</Button>
          </div>
          <span>Text with a <span className="sp-grad">moving gradient</span> verb.</span>
        </Card>
      </div>
      <Notice tone="info" title="Heads up">Notices are glass with a colored glow, never a colored border.</Notice>
      <Notice tone="error" title="Something went wrong">Try again in a moment.</Notice>

      <Dialog open={dialog} onClose={() => setDialog(false)} title="Delete this chat?" actions={<><Button variant="ghost" onClick={() => setDialog(false)}>Cancel</Button><Button variant="danger" onClick={() => setDialog(false)}>Delete</Button></>}>
        This cannot be undone.
      </Dialog>
      <Popover open={pop} onClose={() => setPop(false)} anchorRef={anchor} label="Actions" role="menu" width={240}>
        <button type="button" role="menuitem" className="sp-menu-item" onClick={() => setPop(false)}>Rename <small>R</small></button>
        <button type="button" role="menuitem" className="sp-menu-item" onClick={() => setPop(false)}>Duplicate <small>D</small></button>
      </Popover>
    </div>
  );
}
