import { RouteTransition } from "@/components/motion/RouteTransition";

/**
 * Arriving in /app from another page fades and rises the shell in. Switching tabs inside the app does not go through Next
 * (KeplarApp swaps views with pushState); those use withViewTransition (src/lib/ui/view-transition.ts).
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}
