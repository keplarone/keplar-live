import { RouteLoading } from "@/components/motion/Loading";

/** Docs page loading state: delayed fade, flat pulsing skeleton (no shimmer). */
export default function Loading() {
  return <RouteLoading label="Loading docs" lines={6} variant="docs" />;
}
