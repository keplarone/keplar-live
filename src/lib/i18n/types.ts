/**
 * Catalog types. English (messages/<ns>/en.ts) defines the shape; every other locale is a deep-partial of it, so a missing key
 * is a type-safe fallback to English and an unknown key is a type error.
 */
import type commonEn from "./messages/common/en";
import type clientEn from "./messages/client/en";
import type marketingEn from "./messages/marketing/en";
import type appEn from "./messages/app/en";

type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : T extends object ? { [K in keyof T]: Widen<T[K]> } : T;
/** Objects may omit keys; arrays are all-or-nothing (a translated list replaces the English one only when it has the same length). */
export type DeepPartial<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export type CommonMessages = Widen<typeof commonEn>;
export type ClientMessages = Widen<typeof clientEn>;
export type MarketingMessages = Widen<typeof marketingEn>;
export type AppMessages = Widen<typeof appEn>;

export type Messages = { common: CommonMessages; client: ClientMessages; marketing: MarketingMessages; app: AppMessages };
export type Namespace = keyof Messages;
export const NAMESPACES: Namespace[] = ["common", "client", "marketing", "app"];

export type CommonCatalog = DeepPartial<CommonMessages>;
export type ClientCatalog = DeepPartial<ClientMessages>;
export type MarketingCatalog = DeepPartial<MarketingMessages>;
export type AppCatalog = DeepPartial<AppMessages>;
export type Catalog<N extends Namespace> = DeepPartial<Messages[N]>;
