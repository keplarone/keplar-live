import { WhopPixel } from "@/components/analytics/WhopPixel";

/** Whop's checkout script and pixel stay on this route. The root layout does not load them. */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WhopPixel />
      {children}
    </>
  );
}
