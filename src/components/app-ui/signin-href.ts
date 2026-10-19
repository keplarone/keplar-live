/**
 * Sign-in and sign-up links that bring the person back where they were. The auth pages clean `next` themselves
 * (authRedirectPath: same-origin paths only, never an auth page), so this only builds the link.
 */
export type AuthPage = "signin" | "signup";

/** The fallback when the location is not known (server render). */
export const DEFAULT_NEXT = "/app";

export const authHref = (page: AuthPage, next: string = DEFAULT_NEXT): string => `/${page}?next=${encodeURIComponent(next || DEFAULT_NEXT)}`;

/** Path and query of a location, e.g. "/app/create?tab=apps". */
export const hereOf = (loc: Pick<Location, "pathname" | "search"> | null | undefined): string => (loc?.pathname ? `${loc.pathname}${loc.search ?? ""}` : DEFAULT_NEXT);
