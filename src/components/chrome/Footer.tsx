import Link from "next/link";
import { KeplarLogo } from "@/components/brand";
import { brand, footerNav, site } from "@/lib/site";
import { CookieSettingsButton } from "@/components/consent/CookieSettingsButton";
import { ThemeControl } from "@/components/theme/ThemeControl";
import { LanguagePicker } from "@/components/i18n/LanguagePicker";
import { getMessages } from "@/lib/i18n/server";
import { loadConsent } from "@/lib/i18n/consent";
import { localizedPath } from "@/lib/i18n/routing";
import { MoreButton, MoreRoot } from "@/components/ui/MobileMore";
import { TOPIC_LINKS } from "@/lib/seo/clusters";
import s from "./Footer.module.css";

/** Site footer. In a localized layout labels come from that locale's catalog and links to translated pages stay in the locale.
 *  Phones (640px and narrower): each link group is an accordion whose heading is the toggle (src/components/ui/MobileMore.tsx);
 *  every link is still in the page, and wider screens show the open columns as before. */
export async function Footer({ locale = "en" }: { locale?: string }) {
  const year = new Date().getFullYear();
  const [f, consent] = await Promise.all([getMessages(locale, "common").then((m) => m.footer), loadConsent(locale)]);
  return (
    <footer className={s.footer}>
      <div className={s.inner}>
        <div className={s.brand}>
          <KeplarLogo height={22} title={brand.name} />
          {/* The tagline under the logo is the brand lockup: it stays in English in every locale. */}
          <p className={s.tagline} lang="en">{site.tagline}</p>
          <a href={`mailto:${brand.contactEmail}`} className={s.email}>
            {brand.contactEmail}
          </a>
        </div>
        <nav className={s.cols} aria-label={f.label}>
          {footerNav.map((col) => {
            const heading = f.headings[col.heading] ?? col.heading;
            return (
            <MoreRoot key={col.heading} className={s.col} data-wide={col.links.length > 8 ? "" : undefined}>
              <h2 className={s.heading}>
                <span className={s.headingText}>{heading}</span>
                <MoreButton more={heading} less={heading} className={s.headingBtn} />
              </h2>
              <ul data-more-rest="">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={localizedPath(l.href, locale)} className={s.link}>
                      {f.links[l.href] ?? l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </MoreRoot>
            );
          })}
        </nav>
        {/* The search-intent topic hubs (src/lib/seo/clusters.ts): one compact row, so every hub is linked from every page. English only. */}
        <nav className={s.topics} aria-label="Topics">
          <span className={s.topicsLabel}>Topics</span>
          {TOPIC_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={s.link}>{l.label}</Link>
          ))}
        </nav>
      </div>
      <div className={s.base}>
        <p>
          © {year} {brand.companyName}.{site.legalEntity ? ` ${site.legalEntity}` : ""}
        </p>
        <CookieSettingsButton className={s.cookieLink}>{consent.settings}</CookieSettingsButton>
        <LanguagePicker />
        <div className={s.theme}>
          <span className={s.themeLabel} aria-hidden="true">{f.theme}</span>
          <ThemeControl compact />
        </div>
      </div>
    </footer>
  );
}
