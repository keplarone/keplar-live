import Link from "next/link";
import { KeplarLogo } from "@/components/brand";
import { brand, footerNav, site } from "@/lib/site";
import { CREATOR_LINE } from "@/lib/identity";
import { CookieSettingsButton } from "@/components/consent/CookieSettingsButton";
import { ThemeControl } from "@/components/theme/ThemeControl";
import { LanguagePicker } from "@/components/i18n/LanguagePicker";
import { getMessages } from "@/lib/i18n/server";
import { localizedPath } from "@/lib/i18n/routing";
import s from "./Footer.module.css";

/** Site footer. In a localized layout labels come from that locale's catalog and links to translated pages stay in the locale. */
export async function Footer({ locale = "en" }: { locale?: string }) {
  const year = new Date().getFullYear();
  const f = (await getMessages(locale, "common")).footer;
  return (
    <footer className={s.footer}>
      <div className={s.inner}>
        <div className={s.brand}>
          <KeplarLogo height={22} title={brand.name} />
          {/* The tagline under the logo is the brand lockup: it stays in English in every locale. */}
          <p className={s.tagline} lang="en">{site.tagline}</p>
          {/* Who made Keplar: two co-founders, two different people. Names are never translated, and no personal details are added. */}
          <p className={s.credit} lang="en" data-credit="">{CREATOR_LINE}</p>
          <a href={`mailto:${brand.contactEmail}`} className={s.email}>
            {brand.contactEmail}
          </a>
        </div>
        <nav className={s.cols} aria-label={f.label}>
          {footerNav.map((col) => (
            <div key={col.heading} className={s.col} data-wide={col.links.length > 8 ? "" : undefined}>
              <h2 className={s.heading}>{f.headings[col.heading] ?? col.heading}</h2>
              <ul>
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={localizedPath(l.href, locale)} className={s.link}>
                      {f.links[l.href] ?? l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className={s.base}>
        <p>
          © {year} {brand.companyName}.{site.legalEntity ? ` ${site.legalEntity}` : ""}
        </p>
        <CookieSettingsButton className={s.cookieLink} />
        <LanguagePicker />
        <div className={s.theme}>
          <span className={s.themeLabel} aria-hidden="true">{f.theme}</span>
          <ThemeControl compact />
        </div>
      </div>
    </footer>
  );
}
