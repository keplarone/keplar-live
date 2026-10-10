import { RouteTransition } from "@/components/motion/RouteTransition";

/** Remounts on every marketing navigation, so the page fades and rises in (src/components/motion/RouteTransition.tsx). */
export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}
