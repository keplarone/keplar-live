import Image from "next/image";
import Link from "next/link";
import { Montserrat } from "next/font/google";
import { Telemetry } from "@/components/growth/Telemetry";
import { SpaceBackground, SpaceReveal } from "@/components/space/SpaceChrome";
import { RELEASES_URL } from "@/components/space/links";
import s from "@/components/space/space.module.css";

// Montserrat is SIL OFL; next/font downloads it at build time and serves it from keplar.one.
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600"], display: "swap", variable: "--space-font" });

const FORCE_DARK = `(function(){var r=document.documentElement;r.setAttribute("data-theme","dark");r.classList.remove("light");r.classList.add("dark");r.style.colorScheme="dark"})();`;

/**
 * Space Studio's site (space.keplar.one, also keplar.one/space-studio). Always dark, its own nav and footer, and the star field
 * mounted here once so it keeps running across Space pages instead of restarting on every navigation.
 */
export default function SpaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${s.root} ${montserrat.variable}`} data-space-root>
      {/* Space pages are always dark: switch the site theme before first paint so shared parts (cookie card, toasts) match. */}
      <script dangerouslySetInnerHTML={{ __html: FORCE_DARK }} />
      <SpaceBackground />
      <a className={s.skip} href="#main">Skip to content</a>
      <header className={s.nav}>
        <Link href="/space-studio" className={s.brand} aria-label="Space Studio home">
          <Image className={s.mark} src="/icons/space-studio.png" alt="" width={30} height={30} priority />
          <span className={s.word} aria-hidden="true">Space</span>
        </Link>
        <nav className={s.links} aria-label="Space Studio">
          <Link href="/space-studio#models">Models</Link>
          <Link href="/space-studio#plans">Plans</Link>
          <Link href="/space-studio#today">Status</Link>
        </nav>
        <a className={s.navCta} href={RELEASES_URL}>Download</a>
      </header>
      <main id="main" className={s.main}>{children}</main>
      <footer className={s.footer}>
        <div className={s.footInner}>
          <div className={s.footBrand}>
            <Image src="/icons/space-studio.png" alt="" width={22} height={22} />
            <span>Space Studio by Keplar</span>
          </div>
          <nav className={s.footLinks} aria-label="Footer">
            <a href={RELEASES_URL}>Releases</a>
            <a href="https://keplar.one">Keplar</a>
            <a href="https://keplar.one/privacy">Privacy</a>
            <a href="https://keplar.one/terms">Terms</a>
            <a href="mailto:team@keplar.one">team@keplar.one</a>
          </nav>
        </div>
      </footer>
      <SpaceReveal />
      <Telemetry />
    </div>
  );
}
