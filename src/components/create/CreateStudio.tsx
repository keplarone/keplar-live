"use client";
/**
 * Create: Apps (one prompt -> a tested, full-stack app; the default tab) and image / video / mobile studios.
 * The older Site (landing-page) builder is no longer a Create tab; Site URLs redirect to App. Views stay mounted
 * so switching never loses work in progress.
 *
 * Site resume / template remix still set sessionStorage "keplar:create-site" and land here: we mount SiteBuilder
 * for that handoff only (no Site tab), then "Back to Create" returns to the App tabs.
 *
 * Only the App studio ships with the Create chunk; Images, Video and Mobile are separate chunks fetched the first
 * time their tab is opened (and warmed when the pointer reaches the tab), so opening Create costs only what the
 * App studio needs.
 *
 * Keplar Studio (desktop app only) is one tab with an environment switch, Roblox Studio | Blender, and mounts the Keplar
 * Studio Workspace for the chosen one (each environment's stays mounted once opened). Links: ?tab=studio&env=roblox|blender is canonical; ?tab=roblox and ?tab=blender still
 * work; ?tab=studio alone opens the environment used last. Outside the desktop app these links land on App with a note
 * pointing to the download page (see ./studio/keplar-studio-nav.ts).
 */
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { studioBridge } from "@/lib/desktop/studio-bridge";
import { useTabIndicator } from "@/components/motion/useTabIndicator";
import { SignInGate } from "@/components/app-ui/SignInGate";
import { AppBuilder } from "./apps/AppBuilder";
import b from "./builder.module.css";
import st from "./apps/studio.module.css";
import { KeplarStudioElsewhere, KeplarStudioPane } from "./studio/KeplarStudioPane";
import { createSearch, locationFromUrl, pickEnv, readRememberedEnv, rememberEnv, resolveCreateLocation, studioRequested, type CreateLocation, type CreateView, type StudioEnv } from "./studio/keplar-studio-nav";

const loadImages = () => import("./ImageStudio");
const loadVideo = () => import("./video/VideoStudio");
const loadMobile = () => import("./mobile/MobileStudio");
const loadSite = () => import("./SiteBuilder");
const ImageStudio = lazy(() => loadImages().then((m) => ({ default: m.ImageStudio })));
const VideoStudio = lazy(() => loadVideo().then((m) => ({ default: m.VideoStudio })));
const MobileStudio = lazy(() => loadMobile().then((m) => ({ default: m.MobileStudio })));
const SiteBuilder = lazy(() => loadSite().then((m) => ({ default: m.SiteBuilder })));
// One chunk serves both environments (Roblox Studio and Blender share the Keplar Studio Workspace).
const loadWorkspace = () => import("@/components/app-ui/studio-mode/workspace/Workspace");
const StudioWorkspace = lazy(() => loadWorkspace().then((m) => ({ default: m.Workspace })));
const noSubscribe = () => () => {};
const WARM: Record<string, () => Promise<unknown>> = { images: loadImages, video: loadVideo, mobile: loadMobile, roblox: loadWorkspace, blender: loadWorkspace };

/** "studio" is Keplar Studio: desktop app only, so its tab appears only when the desktop bridge is there. */
type View = CreateView;
type Auth = "loading" | "in" | "out";

type Props = {
  embedded?: boolean;
  /** A `?tab=` value (see ./studio/keplar-studio-nav.ts); falls back to the page URL. */
  initialTab?: string;
  /** A `?env=` value for Keplar Studio ("roblox" | "blender"); falls back to the page URL. */
  initialEnv?: string;
  /** null while the app shell is still resolving the account. undefined when Create is mounted on its own. */
  signedIn?: boolean | null;
  /** The plan, for Keplar Studio (Lite and up). */
  plan?: string;
};

const SITE_HANDOFF_KEY = "keplar:create-site";

function initialLocation(initialTab?: string, initialEnv?: string): CreateLocation {
  const fromUrl = typeof window === "undefined" ? { view: "app" as const, env: null } : locationFromUrl(window.location.href);
  if (initialTab === undefined) return fromUrl;
  const given = resolveCreateLocation(initialTab, initialEnv ?? null);
  return given.view === "studio" && !given.env && fromUrl.view === "studio" ? { ...given, env: fromUrl.env } : given;
}

function peekSiteHandoff(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return Boolean(sessionStorage.getItem(SITE_HANDOFF_KEY));
  } catch {
    return false;
  }
}

function setCreateQuery(v: View, env: StudioEnv) {
  try {
    const url = new URL(window.location.href);
    window.history.replaceState(null, "", `${url.pathname}${createSearch(url.search, v, env)}${url.hash}`);
  } catch {
    /* ignore */
  }
}

export function CreateStudio({ initialTab, initialEnv, signedIn, plan = "free" }: Props) {
  // Keplar Studio needs the desktop app; the server render and the first client render see no bridge.
  const desktop = useSyncExternalStore(noSubscribe, () => Boolean(studioBridge()), () => false);
  const [start] = useState(() => initialLocation(initialTab, initialEnv));
  const [view, setView] = useState<View>(start.view);
  const [env, setEnv] = useState<StudioEnv>(() => pickEnv(start.env, readRememberedEnv()));
  const [imagesSeen, setImagesSeen] = useState(start.view === "images");
  const [videoSeen, setVideoSeen] = useState(start.view === "video");
  const [mobileSeen, setMobileSeen] = useState(start.view === "mobile");
  // Which environments have been opened (each stays mounted after that, so switching keeps its work).
  const [envSeen, setEnvSeen] = useState<Record<StudioEnv, boolean>>(() => ({ roblox: start.view === "studio" && env === "roblox", blender: start.view === "studio" && env === "blender" }));
  const [elsewhereDismissed, setElsewhereDismissed] = useState(false);
  const [siteHandoff, setSiteHandoff] = useState(() => peekSiteHandoff());
  const [auth, setAuth] = useState<Auth>(signedIn === true ? "in" : signedIn === false ? "out" : "loading");
  const shown: Auth = signedIn === true ? "in" : signedIn === false ? "out" : auth;

  const pick = (v: View) => {
    setView(v);
    setCreateQuery(v, env);
    if (v === "images") setImagesSeen(true);
    if (v === "video") setVideoSeen(true);
    if (v === "mobile") setMobileSeen(true);
    if (v === "studio") setEnvSeen((s) => (s[env] ? s : { ...s, [env]: true }));
  };
  const pickEnvironment = (next: StudioEnv) => {
    setEnv(next);
    rememberEnv(next);
    setEnvSeen((s) => (s[next] ? s : { ...s, [next]: true }));
    setCreateQuery("studio", next);
  };
  // Outside the desktop app a Keplar Studio link lands on App (with a note saying where it runs).
  const current: View = view === "studio" && !desktop ? "app" : view;
  const showElsewhere = studioRequested(view, desktop) && !elsewhereDismissed;

  // A deep link that named an environment is remembered like a pick, so the next plain Keplar Studio visit opens it.
  useEffect(() => {
    if (start.view === "studio" && start.env) rememberEnv(start.env);
  }, [start]);
  // Inside the desktop app a Studio link in an older form (?tab=roblox, ?tab=blender, ?tab=studio) is rewritten to the
  // canonical ?tab=studio&env=…, once, when the bridge is first seen. Later switches write the URL themselves.
  const canonical = useRef(false);
  useEffect(() => {
    if (!desktop || canonical.current || start.view !== "studio") return;
    canonical.current = true;
    setCreateQuery("studio", env);
  }, [desktop, start, env]);

  // Strip ?tab=site from the URL after mount (redirects cover full navigations; this covers client deep links).
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("tab") === "site") {
        url.searchParams.delete("tab");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // The app shell already knows who is signed in. Create only asks /api/compute when it is mounted on its own.
  useEffect(() => {
    if (signedIn === true || signedIn === false || signedIn === null) return;
    let on = true;
    fetch("/api/compute", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ signedIn?: boolean }>) : null))
      .then((m) => {
        if (!on) return;
        setAuth(m && m.signedIn === false ? "out" : "in");
      })
      .catch(() => {
        if (on) setAuth("in");
      });
    return () => {
      on = false;
    };
  }, [signedIn]);

  // The underline slides between App, Images, Video, Mobile and (desktop app) Keplar Studio (placed once the tab bar renders after the auth probe).
  const kindTabsRef = useRef<HTMLDivElement>(null);
  useTabIndicator(kindTabsRef, `${shown}:${current}:${desktop}`);

  const warm = (v: string) => () => void WARM[v === "studio" ? env : v]?.().catch(() => undefined);
  const tab = (v: View, label: ReactNode) => (
    <button type="button" role="tab" aria-selected={current === v} className={`${b.segBtn} ${st.kindTab}`} onClick={() => pick(v)} onPointerEnter={v === "app" ? undefined : warm(v)} onFocus={v === "app" ? undefined : warm(v)}>{label}</button>
  );
  const loading = <div className={st.paneMsg}>Loading…</div>;

  if (shown === "loading") {
    return (
      <div className={b.root}>
        <h1 className="visually-hidden">Create</h1>
        {loading}
      </div>
    );
  }

  if (shown === "out") {
    return (
      <div className={b.root}>
        <h1 className="visually-hidden">Create</h1>
        <SignInGate
          title="Sign in to create"
          body="Create builds your app, images and video, and keeps them in your account so you can edit, publish and come back to them. Free accounts can start; Plus and Pro unlock more."
          next="/app/create"
        />
      </div>
    );
  }

  // Resume site / template remix: mount the site builder for this handoff only (no Site tab in the bar).
  if (siteHandoff) {
    return (
      <div className={b.root}>
        <h1 className="visually-hidden">Create</h1>
        <div className={`${b.stageBar} ${st.kindBar}`}>
          <button type="button" className={`${b.segBtn} ${st.kindTab}`} onClick={() => setSiteHandoff(false)}>
            ← Back to Create
          </button>
        </div>
        <Suspense fallback={loading}>
          <SiteBuilder />
        </Suspense>
      </div>
    );
  }

  return (
    <div className={b.root}>
      <h1 className="visually-hidden">Create</h1>
      <div className={`${b.stageBar} ${st.kindBar}`} role="tablist" aria-label="Create">
        <div ref={kindTabsRef} className={`${b.seg} ${st.kindTabs}`}>
          {tab("app", "App")}
          {tab("images", "Images")}
          {tab("video", <>Video <span aria-hidden="true">(Beta)</span></>)}
          {tab("mobile", <>Mobile <span aria-hidden="true">(Beta)</span></>)}
          {desktop ? tab("studio", "Keplar Studio") : null}
          <span className="m-tab-indicator" aria-hidden="true" />
        </div>
      </div>
      {showElsewhere && current === "app" ? <KeplarStudioElsewhere onDismiss={() => setElsewhereDismissed(true)} /> : null}
      <div className={b.root} style={current === "app" ? undefined : { display: "none" }}>
        <AppBuilder />
      </div>
      {imagesSeen ? (
        <div style={current === "images" ? { overflowY: "auto", flex: 1 } : { display: "none" }}>
          <Suspense fallback={loading}><ImageStudio /></Suspense>
        </div>
      ) : null}
      {videoSeen ? (
        <div style={current === "video" ? { overflowY: "auto", flex: 1 } : { display: "none" }}>
          <Suspense fallback={loading}><VideoStudio /></Suspense>
        </div>
      ) : null}
      {mobileSeen ? (
        <div style={current === "mobile" ? { overflowY: "auto", flex: 1 } : { display: "none" }}>
          <Suspense fallback={loading}><MobileStudio /></Suspense>
        </div>
      ) : null}
      {desktop && (envSeen.roblox || envSeen.blender) ? (
        <KeplarStudioPane
          env={env}
          onEnvChange={pickEnvironment}
          onWarm={(e) => void WARM[e]?.().catch(() => undefined)}
          hidden={current !== "studio"}
          views={{
            roblox: envSeen.roblox ? <Suspense fallback={loading}><StudioWorkspace env="roblox" plan={plan} signedIn={shown === "in"} onEnvChange={pickEnvironment} /></Suspense> : null,
            blender: envSeen.blender ? <Suspense fallback={loading}><StudioWorkspace env="blender" plan={plan} signedIn={shown === "in"} onEnvChange={pickEnvironment} /></Suspense> : null,
          }}
        />
      ) : null}
    </div>
  );
}
