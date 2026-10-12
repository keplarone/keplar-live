"use client";
/**
 * Keplar Studio settings (a Dialog). Everything here is a real setting or a real fact:
 * - View: Simple (conversation only) or Advanced (with the inspector); the shell owns the layout and passes callbacks.
 * - Layout: save, restore the saved one, reset.
 * - Approvals: Auto-approve safe changes (a.setAuto, the same flag the Composer's switch drives). Destructive steps always ask.
 * - Appearance: the theme follows the site's setting (<html data-theme>, src/lib/theme.ts); shown, not duplicated.
 * - Technical details: the accurate disclosure from solar-modes.ts. Solar 5.8 runs on Claude Opus 5.5 by Anthropic via
 *   OpenRouter; the five modes are execution configurations of that one model.
 */
import { useState, useSyncExternalStore } from "react";
import { SOLAR_MODES, SOLAR_TECHNICAL_DETAILS } from "@/lib/studio/solar-modes";
import { Button, Dialog, Icon, MorphIcon, SegmentedControl, Switch } from "../../ui";
import type { StudioAgent } from "../../useStudioAgent";
import s from "./panels.module.css";

export type ViewMode = "simple" | "advanced";

export type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  a: Pick<StudioAgent, "autoApprove" | "setAuto">;
  env: "roblox" | "blender";
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  onResetLayout: () => void;
  onSaveLayout?: () => void;
  /** Restores the saved layout; shown only when given together with `hasSavedLayout`. */
  onRestoreLayout?: () => void;
  hasSavedLayout?: boolean;
};

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const themeNow = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "Dark" : "Light");

export function SettingsDialog(p: SettingsDialogProps) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange} title="Settings" size="md" footer={<Button variant="primary" onClick={() => p.onOpenChange(false)}>Done</Button>}>
      <SettingsBody {...p} />
    </Dialog>
  );
}

function SettingsBody({ a, env, view, onViewChange, onResetLayout, onSaveLayout, onRestoreLayout, hasSavedLayout }: SettingsDialogProps) {
  const theme = useSyncExternalStore(subscribeTheme, themeNow, () => "Light");
  const [details, setDetails] = useState(false);
  const t = SOLAR_TECHNICAL_DETAILS;

  return (
    <div className={s.stack}>
      <section className={s.section} aria-labelledby="ks-set-view">
        <h3 id="ks-set-view" className={s.sectionTitle}>View</h3>
        <div className={s.settingRow}>
          <span className={s.line}>{view === "simple" ? "Conversation only" : "Conversation and inspector"}</span>
          <SegmentedControl<ViewMode>
            label="View"
            size="sm"
            value={view}
            onValueChange={onViewChange}
            options={[{ value: "simple", label: "Simple" }, { value: "advanced", label: "Advanced" }]}
          />
        </div>
      </section>

      <section className={s.section} aria-labelledby="ks-set-layout">
        <h3 id="ks-set-layout" className={s.sectionTitle}>Layout</h3>
        <div className={s.row}>
          {onSaveLayout ? <Button size="sm" onClick={onSaveLayout}>Save layout</Button> : null}
          {onRestoreLayout && hasSavedLayout ? <Button size="sm" onClick={onRestoreLayout}>Restore saved layout</Button> : null}
          <Button size="sm" variant="ghost" leadingIcon={<Icon name="undo" size={14} />} onClick={onResetLayout}>Reset layout</Button>
        </div>
      </section>

      <section className={s.section} aria-labelledby="ks-set-approvals">
        <h3 id="ks-set-approvals" className={s.sectionTitle}>Approvals</h3>
        <div className={s.settingRow}>
          <Switch checked={a.autoApprove} onCheckedChange={a.setAuto} label="Auto-approve safe changes" />
        </div>
        <p className={s.meta}>Destructive steps always ask, even with this on.</p>
      </section>

      <section className={s.section} aria-labelledby="ks-set-theme">
        <h3 id="ks-set-theme" className={s.sectionTitle}>Appearance</h3>
        <p className={s.line}>Theme follows Keplar&apos;s appearance setting · now {theme}</p>
      </section>

      <section className={s.section} aria-label="Technical details">
        <details className={s.disclosure} open={details} onToggle={(e) => setDetails((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>
            <MorphIcon icon="chevron" state={details ? "expanded" : "collapsed"} size={14} />
            Technical details
          </summary>
          <div className={s.disclosureBody}>
            <dl className={s.facts}>
              <dt>Product</dt><dd>{t.product}</dd>
              <dt>Model</dt><dd>{t.foundationModel} by {t.developer}</dd>
              <dt>Served through</dt><dd>{t.servedThrough} · <code>{t.openRouterModelId}</code></dd>
              <dt>Modes</dt><dd>{SOLAR_MODES.map((m) => m.label).join(", ")}: execution configurations of this one model, not separate models.</dd>
            </dl>
            <p className={s.meta}>{t.modes}</p>
            <p className={s.meta}>{env === "blender" ? t.blenderModel : t.studioModelLock}</p>
            <p className={s.meta}>{t.billing}</p>
          </div>
        </details>
      </section>
    </div>
  );
}
