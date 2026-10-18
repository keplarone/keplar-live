import { WhopPixel } from "@/components/analytics/WhopPixel";

/** Account and /account/usage. The pixel measures a purchase; it is not on the home page or other marketing pages. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WhopPixel />
      {children}
    </>
  );
}
