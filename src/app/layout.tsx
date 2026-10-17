import type { Metadata, Viewport } from "next";
import { Montserrat, IBM_Plex_Mono } from "next/font/google";
import { JsonLd } from "@/components/seo/JsonLd";
import { brand, isIndexable, site, siteVerification } from "@/lib/site";
import { siteGraph } from "@/lib/structuredData";
import { THEME_COLORS, THEME_SCRIPT } from "@/lib/theme";
import { DESKTOP_SCRIPT } from "@/lib/desktop";
import { SIGNED_SCRIPT } from "@/lib/signed-hint";
import { HOME_FX_SCRIPT } from "@/lib/home-fx";
import { PREFS_SCRIPT } from "@/lib/prefs";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { WhopPixel } from "@/components/analytics/WhopPixel";
import { PresenceBeacon } from "@/components/analytics/PresenceBeacon";
import { ProximityLight } from "@/components/ui/ProximityLight";
import { ButtonFx } from "@/components/ui/ButtonFx";
import { FitRuntime } from "@/components/ui/FitRuntime";
import { SmoothCaret } from "@/components/glass/SmoothCaret";
import { ThemeWatcher } from "@/components/theme/ThemeControl";
import { GlassBudget, GlassCaps, GlassDefs } from "@/components/glass/GlassCaps";
import { TypingFeel } from "@/components/glass/TypingFeel";
import { InsertMode } from "@/components/glass/InsertMode";
import { PageMonolith } from "@/components/monolith/PageMonolith";
import { StaticAssetSw } from "@/components/perf/StaticAssetSw";
import { CommandPalette } from "@/components/nav/CommandPalette";
import { LocaleHtml } from "@/components/i18n/LocaleHtml";
import { KitHosts } from "@/components/kit/Hosts";
import { SpaceMotionFilters } from "@/components/ui/space/MotionFilters";
import { SiteClouds } from "@/components/sky/clouds/LandingClouds";
import { SpaceSkyExempt } from "@/components/space/SpaceSkyExempt";
import { SPACE_SKY_SCRIPT } from "@/components/space/surface";
import "@/styles/globals.css";
import "@/styles/redesign.css";

// Montserrat (SIL OFL 1.1) is the one sitewide UI font, the Space Studio face: body, headings, buttons, inputs. next/font fetches it at
// build time and self-hosts it from our own origin as one variable file (wght 400-700), latin subset, display swap, preloaded, with
// next/font's metric-matched fallback (adjustFontFallback) so the swap does not shift layout. The CSS variable is --font-sans
// (tokens.css --f-sans). IBM Plex Mono stays for code. docs/design/space-ui.md
const sans = Montserrat({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  adjustFontFallback: true,
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
  preload: false, // mono is rare above the fold; fetch it only on pages that actually use it
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.seoTitle, template: `%s · ${brand.name}` },
  description: site.description,
  applicationName: site.name,
  // No default canonical here: a page without its own would point Google at the home page ("alternate page" / "Google chose
  // different canonical"). Each public page sets its own via pageMeta(); the home page sets "/" itself.
  openGraph: {
    type: "website",
    siteName: site.name,
    url: "/",
    locale: "en_US",
    title: `${brand.name} — Stop trusting one AI.`,
    description: `One question. Multiple intelligences. One answer. ${brand.engineName} asks the AI models your question needs, investigates where they disagree, and synthesizes one answer with the agreement and disagreements shown.`,
  },
  twitter: {
    card: "summary_large_image",
    title: `${brand.name} — Stop trusting one AI.`,
    description: site.tagline,
  },
  robots: isIndexable ? undefined : { index: false, follow: false },
  ...(siteVerification.google || siteVerification.bing
    ? {
        verification: {
          ...(siteVerification.google ? { google: siteVerification.google } : {}),
          ...(siteVerification.bing ? { other: { "msvalidate.01": siteVerification.bing } } : {}),
        },
      }
    : {}),
};

export const viewport: Viewport = {
  // Dark first. The head script / ThemeWatcher update this when the visitor chose Light or Auto.
  themeColor: THEME_COLORS.dark,
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // edge-to-edge on notched phones; mobile.css and the fixed bars add the safe-area padding
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is the server default (dark). THEME_SCRIPT corrects it before paint from
    // localStorage / the keplar-theme-v3 cookie, hence suppressHydrationWarning.
    // LocaleHtml renders <html> with lang and dir from the URL (/ar → ar, rtl; English at the root → en, ltr). src/components/i18n/LocaleHtml.tsx
    <LocaleHtml className={`${sans.variable} ${mono.variable} dark`} data-theme="dark" data-theme-pref="dark" style={{ colorScheme: "dark" }}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: DESKTOP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SIGNED_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: HOME_FX_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SPACE_SKY_SCRIPT }} />
        <WhopPixel />
      </head>
      <body>
        <ThemeWatcher />
        <GlassCaps />
        <GlassBudget />
        <TypingFeel />
        <InsertMode />
        <PageMonolith />
        <StaticAssetSw />
        <CommandPalette />
        <GlassDefs />
        <SpaceMotionFilters />
        <CookieBanner />
        <PresenceBeacon />
        <ProximityLight />
        <ButtonFx />
        <FitRuntime />
        <SmoothCaret />
        <JsonLd data={siteGraph()} />
        <div data-site-sky="">
          <SpaceSkyExempt>
            <SiteClouds />
          </SpaceSkyExempt>
        </div>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <KitHosts />
      </body>
    </LocaleHtml>
  );
}
