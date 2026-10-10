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
 */
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { studioBridge } from "@/lib/desktop/studio-bridge";
import { useTabIndicator } from "@/components/motion/useTabIndicator";
import { SignInGate } from "@/components/app-ui/SignInGate";
import { AppBuilder } from "./apps/AppBuilder";
import b from "./builder.module.css";
import st from "./apps/studio.module.css";

const loadImages = () => import("./ImageStudio");
const loadVideo = () => import("./video/VideoStudio");
const loadMobile = () => import("./mobile/MobileStudio");
const loadSite = () => import("./SiteBuilder");
const ImageStudio = lazy(() => loadImages().then((m) => ({ default: m.ImageStudio })));
const VideoStudio = lazy(() => loadVideo().then((m) => ({ default: m.VideoStudio })));
const MobileStudio = lazy(() => loadMobile().then((m) => ({ default: m.MobileStudio })));
const SiteBuilder = lazy(() => loadSite().then((m) => ({ default: m.SiteBuilder })));
const loadRoblox = () => import("@/components/app-ui/studio-mode/StudioView");
const RobloxStudio = lazy(() => loadRoblox().then((m) => ({ default: m.StudioView })));
const noSubscribe = () => () => {};
const WARM: Record<string, () => Promise<unknown>> = { images: loadImages, video: loadVideo, mobile: loadMobile, roblox: loadRoblox };

/** "roblox" is Roblox Studio mode: desktop app only, so its tab appears only when the desktop bridge is there. */
type View = "app" | "images" | "video" | "mobile" | "roblox";
type Auth = "loading" | "in" | "out";

type Props = { embedded?: boolean; initialTab?: string; /** null while the app shell is still resolving the account. undefined when Create is mounted on its own. */ signedIn?: boolean | null; /** The plan, for Roblox Studio mode (Lite and up). */ plan?: string };

const SITE_HANDOFF_KEY = "keplar:create-site";

function resolveTab(raw?: string | null): View {
  if (raw === "images" || raw === "video" || raw === "mobile" || raw === "roblox") return raw;
  // "site" and anything else land on App (Site Create UI removed).
  return "app";
}

function tabFromLocation(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("tab");
  } catch {
    return null;
  }
}

function peekSiteHandoff(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return Boolean(sessionStorage.getItem(SITE_HANDOFF_KEY));
  } catch {
    return false;
  }
}

function setTabQuery(v: View) {
  try {
    const url = new URL(window.location.href);
    if (v === "app") url.searchParams.delete("tab");
    else url.searchParams.set("tab", v);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}

export function CreateStudio({ initialTab, signedIn, plan = "free" }: Props) {
  // Roblox Studio mode needs the desktop app; the server render and the first client render see no bridge.
  const desktop = useSyncExternalStore(noSubscribe, () => Boolean(studioBridge()), () => false);
  const [view, setView] = useState<View>(() => resolveTab(initialTab ?? tabFromLocation()));
  const [imagesSeen, setImagesSeen] = useState(() => resolveTab(initialTab ?? tabFromLocation()) === "images");
  const [videoSeen, setVideoSeen] = useState(() => resolveTab(initialTab ?? tabFromLocation()) === "video");
  const [mobileSeen, setMobileSeen] = useState(() => resolveTab(initialTab ?? tabFromLocation()) === "mobile");
  const [robloxSeen, setRobloxSeen] = useState(() => resolveTab(initialTab ?? tabFromLocation()) === "roblox");
  const [siteHandoff, setSiteHandoff] = useState(() => peekSiteHandoff());
  const [auth, setAuth] = useState<Auth>(signedIn === true ? "in" : signedIn === false ? "out" : "loading");
  const shown: Auth = signedIn === true ? "in" : signedIn === false ? "out" : auth;

  const pick = (v: View) => {
    setView(v);
    setTabQuery(v);
    if (v === "images") setImagesSeen(true);
    if (v === "video") setVideoSeen(true);
    if (v === "mobile") setMobileSeen(true);
    if (v === "roblox") setRobloxSeen(true);
  };
  // Outside the desktop app a Roblox Studio link lands on App.
  const current: View = view === "roblox" && !desktop ? "app" : view;

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

  // The underline slides between App, Images, Video, Mobile and (desktop app) Roblox Studio (placed once the tab bar renders after the auth probe).
  const kindTabsRef = useRef<HTMLDivElement>(null);
  useTabIndicator(kindTabsRef, `${shown}:${current}:${desktop}`);

  const warm = (v: string) => () => void WARM[v]?.().catch(() => undefined);
  const tab = (v: View, label: React.ReactNode) => (
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
          {desktop ? tab("roblox", "Roblox Studio") : null}
          <span className="m-tab-indicator" aria-hidden="true" />
        </div>
      </div>
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
      {desktop && robloxSeen ? (
        <div style={current === "roblox" ? { overflowY: "auto", flex: 1, padding: "24px 20px" } : { display: "none" }}>
          <Suspense fallback={loading}><RobloxStudio plan={plan} signedIn={shown === "in"} /></Suspense>
        </div>
      ) : null}
    </div>
  );
}
