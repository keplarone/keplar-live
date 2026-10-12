# Luau analyzer (official WebAssembly build)

`Luau.Web.js` is the unmodified `Luau.Web.js` asset from the official Luau release **0.742**
(https://github.com/luau-lang/luau/releases/tag/0.742), published by the Luau team at Roblox under the MIT license
(`LICENSE.txt`, copied from the same tag).

- SHA-256: `b3f74781394ca5b8a5bf8075821cb9af3e93b5b53fd2e9383ce87c8d0452a5d2` (checked by `tests/roblox-cloud.test.ts`)
- Used by: `src/lib/roblox-cloud/luau-check.ts`, which calls its exported `checkScript` (Luau's own parser and type checker)
  in a worker thread, so Roblox Cloud can check edited scripts on Keplar's servers without Roblox Studio.
- Known limit: the build passes source through Emscripten's stack, so scripts over about 32 KB crash it. Keplar only sends
  scripts up to 28 KB and reports larger ones as not checked in the cloud.

To update: download `Luau.Web.js` and `LICENSE.txt` from a newer release tag, update the version and hash here and in
`luau-check.ts`, and run the tests.
