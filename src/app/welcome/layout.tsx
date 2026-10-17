import { SignupBeacon } from "@/components/growth/SeoBeacon";

/** /welcome: first-run onboarding. Full-screen like /app (no marketing nav or footer); the page-wide particle layer is the background. */
export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" style={{ position: "relative", zIndex: 1, isolation: "isolate" }}>
      {children}
      <SignupBeacon />
    </main>
  );
}
