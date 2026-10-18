import type { Metadata } from "next";
import { Nav } from "@/components/chrome/Nav";
import { Footer } from "@/components/chrome/Footer";
import { ButtonLink } from "@/components/ui/Button";
import s from "@/components/page/NotFound.module.css";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

/** 404: a quiet "404", a two-tone line and two ways out (one primary, one secondary), on the colour backdrop. */
export default function NotFound() {
  return (
    <>
      <Nav />
      <main id="main" style={{ position: "relative", zIndex: 1, isolation: "isolate", overflowX: "clip" }}>
        <section className={s.wrap} aria-labelledby="nf-title">
          <div className={s.card}>
            <p className={s.code} aria-hidden="true">404</p>
            <h1 id="nf-title" className={s.title}>This page <span className="tt-g">drifted off.</span></h1>
            <p className={s.lede}>The link may be old, or the page moved. Try help and search, or start from home.</p>
            <div className={s.actions}>
              <ButtonLink href="/" size="lg">Go home</ButtonLink>
              <ButtonLink href="/help" size="lg" variant="secondary">Search help</ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
