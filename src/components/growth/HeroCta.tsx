"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import { useExperiment } from "@/lib/growth/use-experiment";

/** The home hero's primary button (Space Studio's 3D primary, .sp-btn lg): counted as a CTA click, and its label is the "home-cta"
 *  experiment (control unless switched on). */
export function HeroCta({ href, className }: { href: string; className?: string }) {
  const arm = useExperiment("home-cta");
  return (
    <Link href={href} className={className} data-sp-btn="" data-variant="primary" data-size="lg" onClick={() => track("cta_click", { where: `home:hero:${arm.id}` })}>
      {arm.label}
    </Link>
  );
}
