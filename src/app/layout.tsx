import type { Metadata, Viewport } from "next";
import { Google_Sans } from "next/font/google";
import { JsonLd } from "@/components/seo/JsonLd";
import { brand, isIndexable, site, siteVerification } from "@/lib/site";
import { siteGraph } from "@/lib/structuredData";
import { THEME_COLORS, THEME_SCRIPT } from "@/lib/theme";
import { DESKTOP_SCRIPT } from "@/lib/desktop";
import { SIGNED_SCRIPT } from "@/lib/signed-hint";
import { PREFS_SCRIPT } from "@/lib/prefs";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { WhopPixel } from "@/components/analytics/WhopPixel";
import { PresenceBeacon } from "@/components/analytics/PresenceBeacon";
import { FitRuntime } from "@/components/ui/FitRuntime";
import { ThemeWatcher } from "@/components/theme/ThemeControl";
import { LegacyDecor } from "@/components/chrome/LegacyDecor";
import { InsertMode } from "@/components/glass/InsertMode";
import { SmoothCaret } from "@/components/glass/SmoothCaret";
import { StaticAssetSw } from "@/components/perf/StaticAssetSw";
import { CommandPalette } from "@/components/nav/CommandPalette";
import { LocaleHtml } from "@/components/i18n/LocaleHtml";
import { KitHosts } from "@/components/kit/Hosts";
import { SpaceMotionFilters } from "@/components/ui/space/MotionFilters";
import "@/styles/globals.css";
import "@/styles/redesign.css";

// Google Sans (SIL OFL 1.1, the open-source family on Google Fonts) is the one UI face for keplar.one, matching the Gemini-led look in
// src/styles/gemini.css. next/font self-hosts one variable file (wght 400–700), display swap, preloaded, with a metric-matched fallback
// so the swap does not shift layout. The subsets match what Inter covered so translated pages keep their glyphs. (Google Sans Flex
// has no Cyrillic or Greek, so it is not used.) Space Studio loads Montserrat on its own layout. Code uses the system mono stack.
const sans = Google_Sans({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"],
  variable: "--font-sans",
  display: "swap",
  adjustFontFallback: true,
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
  themeColor: THEME_COLORS.dark,
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // edge-to-edge on notched phones; mobile.css and the fixed bars add the safe-area padding
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is the server default (dark graphite); THEME_SCRIPT corrects it before
    // paint from localStorage / the keplar-theme-v2 cookie, hence suppressHydrationWarning.
    // LocaleHtml renders <html> with lang and dir from the URL (/ar → ar, rtl; English at the root → en, ltr). src/components/i18n/LocaleHtml.tsx
    <LocaleHtml className={`${sans.variable} dark`} data-theme="dark" data-theme-pref="dark" style={{ colorScheme: "dark" }}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: DESKTOP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SIGNED_SCRIPT }} />
        <WhopPixel />
      </head>
      <body>
        <ThemeWatcher />
        <InsertMode />
        <SmoothCaret />
        <LegacyDecor />
        <StaticAssetSw />
        <CommandPalette />
        <SpaceMotionFilters />
        <CookieBanner />
        <PresenceBeacon />
        <FitRuntime />
        <JsonLd data={siteGraph()} />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <KitHosts />
      </body>
    </LocaleHtml>
  );
}
