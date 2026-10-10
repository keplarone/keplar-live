"use client";

import type { ComponentProps } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { parseUtm, useUtmRaw, withUtm } from "@/lib/utm";

type Props = Omit<ComponentProps<typeof ButtonLink>, "onClick"> & { where: string };

/** A CTA that keeps campaign tags on its link and reports one click event (placement only). */
export function TrackedLink({ href, where, ...rest }: Props) {
  const utm = parseUtm(useUtmRaw());
  const to = withUtm(String(href), utm);
  return <ButtonLink {...rest} href={to} onClick={() => track("cta_click", { where, to: String(href).split("?")[0] })} />;
}
