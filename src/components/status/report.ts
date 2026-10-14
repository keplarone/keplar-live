/** Report a client-side crash to the error tracker (scrubbed and rate limited server-side). Best effort: never throws. */
export function reportClientError(error: Error & { digest?: string }) {
  void fetch("/api/client-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: error.name, message: error.message, digest: error.digest, path: window.location.pathname }), keepalive: true }).catch(() => undefined);
}
