"use client";

/**
 * Last-resort boundary: renders only when the root layout itself fails, so it brings its own <html> and no app styles.
 * The server has already logged the error with this digest (Vercel logs); the digest lets a person point us at it.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0b0d", color: "#f3f3f4", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", textAlign: "center", padding: "2rem" }}>
        <main style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: "1.6rem", margin: "0 0 .75rem", fontWeight: 500 }}>Keplar hit a problem.</h1>
          <p style={{ opacity: 0.75, margin: "0 0 1.5rem" }}>Nothing you did caused this. Try again, or reload the page.</p>
          <p style={{ display: "flex", gap: "1rem", justifyContent: "center", margin: 0 }}>
            <button type="button" onClick={reset} style={{ font: "inherit", padding: ".6rem 1.2rem", borderRadius: 999, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer" }}>Try again</button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global error boundary renders outside the router; a full reload is the point */}
            <a href="/" style={{ padding: ".6rem 1.2rem", color: "inherit" }}>Back to Keplar</a>
          </p>
          <p style={{ opacity: 0.6, fontSize: ".85rem", margin: "1.5rem 0 0" }}>
            Still stuck? Email <a href="mailto:team@keplar.one" style={{ color: "inherit" }}>team@keplar.one</a>
            {error.digest ? <> and quote reference <code>{error.digest}</code></> : null}.
          </p>
        </main>
      </body>
    </html>
  );
}
