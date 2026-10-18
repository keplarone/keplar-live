import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("software WebGL renderers are recognised; real GPUs are not", async () => {
  const { isSoftwareRendererName } = await import("@/field/caps");
  for (const n of ["ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)", "llvmpipe (LLVM 15.0.7, 256 bits)", "Microsoft Basic Render Driver", "Mesa softpipe"]) assert.ok(isSoftwareRendererName(n), n);
  for (const n of ["ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)", "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)", "Adreno (TM) 740", "Mali-G78"]) assert.ok(!isSoftwareRendererName(n), n);
});

test("both particle layers consult the software-renderer guard", () => {
  assert.match(readFileSync("src/components/field/PageField.tsx", "utf8"), /softwareRenderer\(\)/);
  assert.match(readFileSync("src/field/engine.ts", "utf8"), /softwareRenderer\(\)/);
});

test("the particle layer is skipped when WebGL is missing, and error pages give a reference to quote", () => {
  assert.match(readFileSync("src/components/field/PageField.tsx", "utf8"), /noWebGL\(\)/);
  const err = readFileSync("src/app/error.tsx", "utf8");
  const glob = readFileSync("src/app/global-error.tsx", "utf8");
  for (const src of [err, glob]) {
    assert.match(src, /error\.digest/);
    assert.match(src, /team@keplar\.one|brand\.contactEmail/);
  }
  assert.match(glob, /<html lang="en">/);
});

test("probeCaps().webgl is false on a CPU renderer, and the chat does not mount the old orb", () => {
  const caps = readFileSync("src/field/caps.ts", "utf8");
  assert.match(caps, /webglOk = Boolean\(gl\) && !soft/);
  assert.match(caps, /isSoftwareRendererName\(String\(gl\.getParameter/);
  const home = readFileSync("src/components/app-ui/ChatHome.tsx", "utf8") + readFileSync("src/app/(chat)/page.tsx", "utf8");
  assert.doesNotMatch(home, /OrbHero|field\/orb|PageField/);
});
