import { brand } from "@/lib/site";

/** "Try Keplar" signed out, "Open Keplar" signed in. Both are in the HTML; CSS (fit.css) shows one, keyed on <html data-signed>. */
export function CtaLabel({ tryText, openText }: { tryText?: string; openText?: string }) {
  return (
    <>
      <span data-cta="try">{tryText ?? `Try ${brand.name}`}</span>
      <span data-cta="open">{openText ?? `Open ${brand.name}`}</span>
    </>
  );
}
