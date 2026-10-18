import { WhopPixel } from "@/components/analytics/WhopPixel";

/** business.keplar.one/account rewrites here and embeds the same checkout. */
export default function BusinessAccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WhopPixel />
      {children}
    </>
  );
}
