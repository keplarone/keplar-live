"use client";

import { usePathname } from "next/navigation";
import { GlassCaps, GlassDefs } from "@/components/glass/GlassCaps";
import { TypingFeel } from "@/components/glass/TypingFeel";
import { PageMonolith } from "@/components/monolith/PageMonolith";
import { ProximityLight } from "@/components/ui/ProximityLight";
import { ButtonFx } from "@/components/ui/ButtonFx";

/**
 * The old decorative runtimes (glass, proximity glow, page monolith). Space Studio still mounts them
 * so its page is unchanged. keplar.one does not. The smooth caret is not decoration: it mounts once, for every page, in the root layout.
 */
export function LegacyDecor() {
  const path = usePathname() ?? "";
  if (path !== "/space-studio" && !path.startsWith("/space-studio/")) return null;
  return (
    <>
      <GlassCaps />
      <TypingFeel />
      <PageMonolith />
      <GlassDefs />
      <ProximityLight />
      <ButtonFx />
    </>
  );
}
