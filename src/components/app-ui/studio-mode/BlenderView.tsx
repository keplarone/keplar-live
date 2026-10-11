"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { TwoTone } from "@/components/page/TwoTone";
import { blenderBridge, STUDIO_PLANS, type BlenderStatus } from "@/lib/desktop/studio-bridge";
import { StudioDock } from "./StudioDock";
import { useStudioAgent } from "./useStudioAgent";
import s from "./studio-mode.module.css";

const noSubscribe = () => () => {};

const IDEAS = [
  { title: "Game-ready prop", line: "A low-poly treasure chest with brass trim, PBR wood, under 5k triangles, exported as FBX for Roblox.", tone: "amber" },
  { title: "Stylised character base", line: "A chunky stylised robot with rounded panels, emissive eyes and a toon-ish procedural material.", tone: "violet" },
  { title: "Photoreal surface", line: "A stone well with mossy bricks and a wooden roof, real PBR textures and a soft outdoor HDRI.", tone: "teal" },
  { title: "Modular kit", line: "Six modular sci-fi wall and floor pieces on a 4 m grid with matching trim materials.", tone: "rose" },
] as const;

const CAN_DO = ["Models from a description", "Clean topology and modifiers", "Real PBR textures (Poly Haven, free)", "Procedural node materials", "HDRI lighting", "UV unwrapping", "Export to FBX for Roblox, GLB or OBJ"];

/**
 * Blender mode (Create > Blender, desktop app 0.1.8+): Keplar builds models and textures in the person's Blender through the Keplar
 * add-on, with approvals, the same chat as Roblox Studio mode, and a saved chat per .blend file. Cheap by design: it reads the scene
 * as text and only looks at the viewport when it must.
 */
export function BlenderView({ plan, signedIn }: { plan: string; signedIn: boolean | null }) {
  const bridge = useSyncExternalStore(noSubscribe, blenderBridge, () => null);
  const [status, setStatus] = useState<BlenderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const allowed = signedIn === true && STUDIO_PLANS.has(plan);
  const a = useStudioAgent(bridge, "blender");

  useEffect(() => {
    if (!bridge || !allowed) return;
    let live = true;
    void bridge.status().then((st) => { if (live) setStatus(st); });
    const off = bridge.onStatus((st) => setStatus(st));
    return () => { live = false; off(); };
  }, [bridge, allowed]);

  const connect = async () => {
    if (!bridge) return;
    setBusy(true);
    setNote("");
    try { setStatus(await bridge.connect()); } finally { setBusy(false); }
  };
  const setup = async () => {
    if (!bridge) return;
    setBusy(true);
    setNote("Installing the Keplar add-on in Blender…");
    try { setNote((await bridge.setup()).message); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!bridge) return;
    setBusy(true);
    try { setStatus(await bridge.disconnect()); } finally { setBusy(false); }
  };

  const kicker = <span className={s.kicker}>Desktop app · Lite and up</span>;

  if (!bridge || signedIn === false || (signedIn === true && !allowed)) {
    const card = !bridge
      ? { title: "Open this in the Keplar desktop app", text: "Blender mode talks to Blender on your computer, so it runs in the Keplar desktop app (version 0.1.8 or newer). If the app is open and you don't see it, update the app.", href: "/download", cta: "Download Keplar for desktop" }
      : signedIn === false
        ? { title: "Sign in to use Blender mode", text: "Blender mode is part of Keplar Lite, Plus and Pro.", href: "/signin?next=/app/create?tab=blender", cta: "Sign in" }
        : { title: "Blender mode comes with Lite and up", text: "Upgrade to Keplar Lite, Plus or Pro to model and texture in Blender with Keplar.", href: "/pricing", cta: "See plans" };
    return (
      <div className={s.wrap}>
        <header className={s.head}>
          {kicker}
          <h1 className={s.title}><TwoTone text="Build in Blender" /></h1>
          <p className={s.lede}>Keplar models and textures in Blender on this computer. You approve every change.</p>
        </header>
        <section className={s.card}>
          <h2 className={s.cardTitle}>{card.title}</h2>
          <p className={s.text}>{card.text}</p>
          <Link href={card.href} className={s.primary}>{card.cta}</Link>
        </section>
      </div>
    );
  }

  const st = status?.state ?? "idle";
  if (st !== "connected") {
    return (
      <div className={s.wrap} data-wide="">
        <header className={s.hero}>
          <div className={s.heroText}>
            {kicker}
            <h1 className={s.heroTitle}><TwoTone text="Build in Blender" /></h1>
            <p className={s.lede}>Describe a model. Keplar plans it, models it with clean topology, textures it with real PBR materials or procedural nodes, and can export it for Roblox. You approve every change and look it over in Blender.</p>
            <div className={s.heroActions} aria-live="polite">
              <button type="button" className={s.primary} data-size="lg" onClick={() => void connect()} disabled={busy || st === "connecting"}>
                {st === "connecting" ? "Connecting…" : "Connect to Blender"}
              </button>
              <button type="button" className={s.ghost} onClick={() => void setup()} disabled={busy}>Set up Blender</button>
              <span className={s.statusLine}><span className={s.dot} data-state={st === "missing" ? "error" : st} aria-hidden="true" />{note || status?.message || "Open Blender, then connect"}</span>
            </div>
            {draft ? <p className={s.draftNote}>Ready to build: “{draft.slice(0, 80)}{draft.length > 80 ? "…" : ""}”</p> : null}
          </div>
        </header>

        <section className={s.block} aria-labelledby="blender-how">
          <h2 id="blender-how" className={s.blockTitle}><TwoTone text="Three steps to your first model" /></h2>
          <ol className={s.steps}>
            <li><span className={s.stepNum}>1</span><strong>Set up Blender once</strong><span>Installs the small Keplar add-on in Blender 4.2 or newer. It only listens on this computer and needs a key only Keplar has.</span></li>
            <li><span className={s.stepNum}>2</span><strong>Open Blender and connect</strong><span>The add-on starts with Blender. Nothing is sent anywhere until you ask for a build.</span></li>
            <li><span className={s.stepNum}>3</span><strong>Describe it</strong><span>Add reference images if you have them. Approve each change, then tell Keplar what to adjust.</span></li>
          </ol>
        </section>

        <section className={s.block} aria-labelledby="blender-ideas">
          <h2 id="blender-ideas" className={s.blockTitle}><TwoTone text="Start from an idea" /></h2>
          <div className={s.ideas}>
            {IDEAS.map((idea) => (
              <button key={idea.title} type="button" className={s.idea} aria-pressed={draft === idea.line} onClick={() => { setDraft(idea.line); if (st !== "connecting") void connect(); }}>
                <span className={s.ideaArt} data-tone={idea.tone} aria-hidden="true" />
                <span className={s.ideaTitle}>{idea.title}</span>
                <span className={s.ideaLine}>{idea.line}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={s.split} aria-labelledby="blender-can">
          <div className={s.card} data-grow="">
            <h2 id="blender-can" className={s.cardTitle}>What Keplar does in Blender</h2>
            <ul className={s.chips}>{CAN_DO.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          <div className={s.card}>
            <h3 className={s.cardTitle}>You stay in charge</h3>
            <p className={s.text}>Changes wait for your approval. Its Python cannot touch your files, the network or other apps, and it never saves or closes Blender.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={s.wrap} data-wide="" data-connected="">
      <header className={s.bar}>
        <div className={s.barText}>
          {kicker}
          <h1 className={s.title}><TwoTone text="Build in Blender" /></h1>
        </div>
        <div className={s.barActions}>
          <span className={s.statusPill}>
            <span className={s.dot} data-state="connected" aria-hidden="true" />
            Blender {status?.blender ?? ""}
            {status?.file ? <span className={s.placeName}>{status.file}</span> : null}
          </span>
          <button type="button" className={s.ghost} onClick={() => void disconnect()} disabled={busy || a.running}>Disconnect</button>
        </div>
      </header>
      <div className={s.workspace}>
        <StudioDock a={a} draft={draft} onDraftUsed={() => setDraft("")} canPlayTest={false} />
      </div>
    </div>
  );
}
