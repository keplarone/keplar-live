/**
 * The cookie banner's copy in the page's language (messages/consent). Server and client: the footer awaits it on the server for
 * its "Cookie settings" label; the banner loads it in the browser (useConsentText in src/lib/i18n/consent-client.ts).
 */
import en from "./messages/consent/en";
import { loaders } from "./loaders/consent";
import { withFallback } from "./merge";
import { DEFAULT_LOCALE } from "./locales";
import type { ConsentMessages } from "./types";

export const CONSENT_EN: ConsentMessages = en;

/** The locale's strings over English (a missing or empty string stays English). Never throws. */
export async function loadConsent(locale: string): Promise<ConsentMessages> {
  if (locale === DEFAULT_LOCALE) return en;
  const load = loaders[locale];
  if (!load) return en;
  return withFallback(en as ConsentMessages, (await load().catch(() => ({ default: {} }))).default);
}
