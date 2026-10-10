/**
 * Server-side catalogs. Only the requested locale's file is loaded (one lazy chunk per locale and namespace), laid over English.
 * Server components call `await getMessages(locale, "marketing")`; client components get theirs from <I18nProvider>.
 */
import commonEn from "./messages/common/en";
import clientEn from "./messages/client/en";
import marketingEn from "./messages/marketing/en";
import appEn from "./messages/app/en";
import { loaders as common } from "./loaders/common";
import { loaders as client } from "./loaders/client";
import { loaders as marketing } from "./loaders/marketing";
import { loaders as app } from "./loaders/app";
import { withFallback } from "./merge";
import { DEFAULT_LOCALE, isLocale } from "./locales";
import type { Messages, Namespace } from "./types";

export const EN: Messages = { common: commonEn, client: clientEn, marketing: marketingEn, app: appEn };
const LOADERS: Record<Namespace, Record<string, () => Promise<{ default: unknown }>>> = { common, client, marketing, app };
const cache = new Map<string, Promise<unknown>>();

export function getMessages<N extends Namespace>(locale: string, ns: N): Promise<Messages[N]> {
  if (locale === DEFAULT_LOCALE || !isLocale(locale)) return Promise.resolve(EN[ns]);
  const key = `${ns}:${locale}`;
  let hit = cache.get(key);
  if (!hit) {
    const load = LOADERS[ns][locale];
    hit = (load ? load().then((m) => m.default).catch(() => ({})) : Promise.resolve({})).then((part) => withFallback(EN[ns], part));
    cache.set(key, hit);
  }
  return hit as Promise<Messages[N]>;
}

/** The raw (un-merged) catalog, for coverage tests. */
export async function rawCatalog(locale: string, ns: Namespace): Promise<unknown> {
  const load = LOADERS[ns][locale];
  return load ? (await load()).default : {};
}
