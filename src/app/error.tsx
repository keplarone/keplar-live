"use client";

import Link from "next/link";
import { useEffect } from "react";
import { brand } from "@/lib/site";

/** Route-level error boundary: a calm retry state instead of a blank page. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Report to the error tracker (scrubbed, rate limited server-side). Best effort: never throws.
  useEffect(() => {
    void fetch("/api/client-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: error.name, message: error.message, digest: error.digest, path: window.location.pathname }), keepalive: true }).catch(() => undefined);
  }, [error]);
  return (
    <main id="main" style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: "6rem 1.5rem", textAlign: "center" }}>
      <div style={{ maxWidth: 440 }}>
        <h1 style={{ fontSize: "1.6rem", margin: "0 0 .75rem" }}>Something went wrong.</h1>
        <p style={{ opacity: 0.75, margin: "0 0 1.5rem" }}>That page failed to load. Try again, or head back home.</p>
        <p style={{ display: "flex", gap: "1rem", justifyContent: "center", margin: 0 }}>
          <button type="button" onClick={reset} style={{ font: "inherit", padding: ".6rem 1.2rem", borderRadius: 999, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer" }}>Try again</button>
          <Link href="/" style={{ padding: ".6rem 1.2rem", color: "inherit" }}>Back to Keplar</Link>
        </p>
        <p style={{ opacity: 0.6, fontSize: ".85rem", margin: "1.5rem 0 0" }}>
          Still stuck? Tell us at <a href={`mailto:${brand.contactEmail}`} style={{ color: "inherit" }}>{brand.contactEmail}</a>
          {error.digest ? <> and quote reference <code>{error.digest}</code></> : null}.
        </p>
      </div>
    </main>
  );
}
