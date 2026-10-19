"use client";
import Link from "next/link";
import { useSyncExternalStore, type ComponentProps } from "react";
import { authHref, DEFAULT_NEXT, hereOf, type AuthPage } from "./signin-href";

const subscribe = (on: () => void) => {
  window.addEventListener("popstate", on);
  return () => window.removeEventListener("popstate", on);
};

/** The current path and query ("/app" on the server, so the first client render matches it). */
export function useHere(): string {
  return useSyncExternalStore(subscribe, () => hereOf(window.location), () => DEFAULT_NEXT);
}

/** A link to sign in (or sign up) that returns to the page it was clicked on. */
export function SignInLink({ page = "signin", ...props }: Omit<ComponentProps<typeof Link>, "href"> & { page?: AuthPage }) {
  const here = useHere();
  return <Link {...props} href={authHref(page, here)} />;
}
