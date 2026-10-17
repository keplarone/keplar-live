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
import { lazy, Suspense, useEffect, useState, type FocusEvent, type PointerEvent } from "react";
import { ActivityIndicator, Button, Tabs, tabId, tabPanelId, type TabItem } from "@/components/kit";
import { SignInGate } from "@/components/app-ui/SignInGate";
import { AppBuilder } from "./apps/AppBuilder";
import b from "./builder.module.css";
import st from "./apps/studio.module.css";
import { createSearch, resolveCreateView, viewFromUrl, type CreateView } from "./create-nav";

const loadImages = () => import("./ImageStudio");
const loadVideo = () => import("./video/VideoStudio");
const loadMobile = () => import("./mobile/MobileStudio");
const loadSite = () => import("./SiteBuilder");
const ImageStudio = lazy(() => loadImages().then((m) => ({ default: m.ImageStudio })));
const VideoStudio = lazy(() => loadVideo().then((m) => ({ default: m.VideoStudio })));
const MobileStudio = lazy(() => loadMobile().then((m) => ({ default: m.MobileStudio })));
const SiteBuilder = lazy(() => loadSite().then((m) => ({ default: m.SiteBuilder })));
const WARM: Record<string, () => Promise<unknown>> = { images: loadImages, video: loadVideo, mobile: loadMobile };

type View = CreateView;
type Auth = "loading" | "in" | "out";

type Props = {
  embedded?: boolean;
  /** A `?tab=` value (see ./create-nav.ts); falls back to the page URL. */
  initialTab?: string;
  /** null while the app shell is still resolving the account. undefined when Create is mounted on its own. */
  signedIn?: boolean | null;
};

const SITE_HANDOFF_KEY = "keplar:create-site";
/** The kit Tabs id of the kind switch (tab and panel ids derive from it). */
const KIND_TABS = "create-kind";
const RETIRED_TABS = new Set(["site", "studio", "roblox", "blender"]);

function initialView(initialTab?: string): View {
  const fromUrl = typeof window === "undefined" ? "app" : viewFromUrl(window.location.href);
  if (initialTab === undefined) return fromUrl;
  return resolveCreateView(initialTab);
}

function peekSiteHandoff(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return Boolean(sessionStorage.getItem(SITE_HANDOFF_KEY));
  } catch {
    return false;
  }
}

function setCreateQuery(v: View) {
  try {
    const url = new URL(window.location.href);
    window.history.replaceState(null, "", `${url.pathname}${createSearch(url.search, v)}${url.hash}`);
  } catch {
    /* ignore */
  }
}

export function CreateStudio({ initialTab, signedIn }: Props) {
  const [start] = useState(() => initialView(initialTab));
  const [view, setView] = useState<View>(start);
  const [imagesSeen, setImagesSeen] = useState(start === "images");
  const [videoSeen, setVideoSeen] = useState(start === "video");
  const [mobileSeen, setMobileSeen] = useState(start === "mobile");
  const [siteHandoff, setSiteHandoff] = useState(() => peekSiteHandoff());
  const [auth, setAuth] = useState<Auth>(signedIn === true ? "in" : signedIn === false ? "out" : "loading");
  const shown: Auth = signedIn === true ? "in" : signedIn === false ? "out" : auth;

  const pick = (v: View) => {
    setView(v);
    setCreateQuery(v);
    if (v === "images") setImagesSeen(true);
    if (v === "video") setVideoSeen(true);
    if (v === "mobile") setMobileSeen(true);
  };

  // Strip retired tabs from the URL after mount (redirects cover full navigations; this covers client deep links).
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const tab = url.searchParams.get("tab");
      if (tab && RETIRED_TABS.has(tab)) {
        url.searchParams.delete("tab");
        url.searchParams.delete("env");
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

  // The kind switch is the kit's Tabs (UI v2): an underline that slides between App, Images, Video and Mobile.
  // Pointing at or focusing a tab that is not open fetches its chunk early.
  const kinds: TabItem<View>[] = [
    { value: "app", label: "App" },
    { value: "images", label: "Images" },
    { value: "video", label: <>Video</> },
    { value: "mobile", label: <>Mobile</> },
  ];
  const warmFrom = (e: PointerEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    const v = t?.id.slice(`${KIND_TABS}-tab-`.length);
    if (!v || v === "app" || v === view) return;
    void WARM[v]?.().catch(() => undefined);
  };
  /** The panel each kind tab controls (the views stay mounted; only the open one shows). */
  const panel = (v: View) => ({ id: tabPanelId(KIND_TABS, v), role: "tabpanel", "aria-labelledby": tabId(KIND_TABS, v), hidden: view !== v });
  const loading = <div className={st.paneMsg}><ActivityIndicator label="Loading" showLabel /></div>;

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
        <div className={st.kindBar}>
          <Button variant="ghost" size="sm" onClick={() => setSiteHandoff(false)}>
            ← Back to Create
          </Button>
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
      <div className={st.kindBar} onPointerOver={warmFrom} onFocus={warmFrom}>
        <Tabs id={KIND_TABS} label="Create" value={view} onValueChange={pick} items={kinds} className={st.kindTabs} />
      </div>
      <div {...panel("app")} className={`${b.root} ${st.kindPanel}`}>
        <AppBuilder />
      </div>
      {imagesSeen ? (
        <div {...panel("images")} className={st.kindPanel} data-scroll="">
          <Suspense fallback={loading}><ImageStudio /></Suspense>
        </div>
      ) : null}
      {videoSeen ? (
        <div {...panel("video")} className={st.kindPanel} data-scroll="">
          <Suspense fallback={loading}><VideoStudio /></Suspense>
        </div>
      ) : null}
      {mobileSeen ? (
        <div {...panel("mobile")} className={st.kindPanel} data-scroll="">
          <Suspense fallback={loading}><MobileStudio /></Suspense>
        </div>
      ) : null}
    </div>
  );
}
