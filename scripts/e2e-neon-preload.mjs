// node --import ./scripts/e2e-neon-preload.mjs: sends the (fake) Neon host to the local PGlite emulator. E2E_NEON_PORT defaults to 5565.
const real = globalThis.fetch;
const port = process.env.E2E_NEON_PORT || "5565";
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (new URL(url).hostname === "ep-fake-123.us-east-2.aws.neon.tech") return real(`http://127.0.0.1:${port}/sql`, init);
  return real(input, init);
};
