import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/chrome/Nav";
import { Footer } from "@/components/chrome/Footer";
import s from "@/components/page/NotFound.module.css";

export const metadata: Metadata = { title: "Page not found" };

/** 404: a large soft "404", a two-tone line and two ways out, on the plain canvas. */
export default function NotFound() {
  return (
    <>
      <Nav />
      <main id="main" style={{ position: "relative", zIndex: 0, isolation: "isolate", overflowX: "clip" }}>
        <section className={s.wrap} aria-labelledby="nf-title">
          <div className={s.card}>
            <p className={s.code} aria-hidden="true">404</p>
            <h1 id="nf-title" className={s.title}>This page <span className="tt-g">drifted off.</span></h1>
            <p className={s.lede}>The link may be old, or the page moved. Try help and search, or start from home.</p>
            <div className={s.actions}>
              <Link href="/" className={s.primary}>Go home</Link>
              <Link href="/help" className={s.secondary}>Search help</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
