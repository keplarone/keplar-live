"use client";
/**
 * The <html> element, with lang and dir taken from the URL (/ar/... is Arabic, right to left). Rendering it from the pathname
 * keeps every page static: no cookies or headers are read, and the prerendered HTML already carries the right lang and dir.
 * Client navigation between locales updates both attributes. The app (/app, no prefix) sets them from the saved language
 * itself (AppI18n), which this component leaves alone because its own props do not change there.
 */
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { localeInfo } from "@/lib/i18n/locales";
import { splitLocale } from "@/lib/i18n/routing";
import "./i18n.css";

type Props = { className: string; style?: CSSProperties; children: ReactNode } & Record<`data-${string}`, string>;

export function LocaleHtml({ className, children, ...rest }: Props) {
  const info = localeInfo(splitLocale(usePathname() ?? "/").locale);
  return (
    <html lang={info.lang} dir={info.dir} className={className} {...rest} suppressHydrationWarning>
      {children}
    </html>
  );
}
