import { RouteTransition } from "@/components/motion/RouteTransition";

/** Docs page to docs page (the marketing template does not remount inside /docs): the same quick fade and rise. */
export default function DocsTemplate({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}
