import "./setup";
import { jsonReq, signIn } from "./helpers/session"; // before the route: it sets the test auth secret the auth module reads at load
import { POST } from "../src/app/api/blender/agent/route";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLENDER_PROFILE, BLENDER_SYSTEM, BLENDER_TOOL_POLICY, blenderRiskOf } from "../src/lib/blender/agent";
import { buildTools, STUDIO_PROFILE } from "../src/lib/studio/agent";
import { placeKey } from "../src/components/app-ui/studio-mode/saved-session";

const py = (code: string) => blenderRiskOf("python", { code });

test("blender: modelling and materials run with approval; deletes always ask; escapes from Blender are blocked", () => {
  assert.equal(py("import bpy\nbpy.ops.mesh.primitive_cube_add(size=2)\nm=bpy.data.materials.new('Wood')"), "change");
  assert.equal(py("import bmesh\nbm = bmesh.new()\nbmesh.ops.create_cube(bm, size=1)"), "change");
  for (const code of ["bpy.data.objects.remove(o)", "bpy.ops.object.delete()", "bpy.ops.outliner.orphans_purge()", "obj.modifiers.clear()"]) assert.equal(py(code), "destructive", code);
  for (const code of [
    "import os\nos.remove('x')", "from subprocess import run", "import urllib.request", "import socket", "__import__('os')", "open('C:/x.txt','w')",
    "eval('1')", "exec('x=1')", "bpy.ops.wm.quit_blender()", "bpy.ops.wm.save_mainfile()", "bpy.ops.preferences.addon_enable(module='x')",
    "img.filepath_raw = 'C:/Windows/x.png'", "img.save()", "bpy.ops.export_scene.fbx(filepath='C:/x.fbx')", "bpy.app.handlers.load_post.append(f)",
    "getattr(bpy, 'ops')", "x.__class__.__subclasses__()", "import importlib", "",
  ]) assert.equal(py(code), "blocked", code || "(empty)");
  assert.equal(blenderRiskOf("scene", {}), "read");
  assert.equal(blenderRiskOf("ph_texture", { id: "rock", objects: ["A"] }), "change");
  assert.equal(blenderRiskOf("export", { format: "fbx" }), "change", "the add-on's export tool is the way to write files");
  assert.equal(blenderRiskOf("anything_else", {}), "blocked");
});

test("blender: only the add-on's tools are offered, and Roblox tools are not", () => {
  const defs = [...Object.keys(BLENDER_TOOL_POLICY), "execute_luau", "mystery"].map((name) => ({ name, description: "d", inputSchema: { type: "object" } }));
  const names = buildTools(defs, (n) => BLENDER_TOOL_POLICY[n]).map((t) => t.function.name);
  assert.deepEqual(names, Object.keys(BLENDER_TOOL_POLICY));
});

test("blender: cheap by design (short cached prompt, small budgets, text look, no auto screenshots)", () => {
  assert.ok(BLENDER_SYSTEM.length < 2500, `prompt ${BLENDER_SYSTEM.length} chars`);
  assert.ok(BLENDER_PROFILE.reasoningTokens <= 1500 && BLENDER_PROFILE.maxOutputTokens <= 8000);
  assert.ok(BLENDER_PROFILE.reasoningTokens < STUDIO_PROFILE.reasoningTokens);
  assert.equal(BLENDER_PROFILE.meter, "blender.agent");
  assert.match(BLENDER_SYSTEM, /never import os, sys, subprocess/);
  const hook = readFileSync("src/components/app-ui/studio-mode/useStudioAgent.ts", "utf8");
  assert.match(hook, /bridge\.call\("scene", \{\}\)/, "Blender looks with the text scene summary");
  assert.match(hook, /fetch\(blender \? "\/api\/blender\/agent" : "\/api\/studio\/agent"/);
  assert.match(hook, /flags\.current\.changed && !blender\) void refreshViewport\(\)/, "no Studio viewport refresh in Blender");
});

test("blender: one saved chat per .blend file, synced like Studio's", () => {
  assert.equal(placeKey({ name: "crate.blend", saveKey: "name:blender/crate.blend" }), "keplar-studio-chat:name:blender/crate.blend");
});

test("blender: the route needs a signed-in Lite-and-up account", async () => {
  assert.equal((await POST(jsonReq(null, "/api/blender/agent", "POST", { messages: [], tools: [] }))).status, 401);
  const free = await signIn("blender-free@example.com", "free");
  const r = await POST(jsonReq(free.cookie, "/api/blender/agent", "POST", { messages: [{ role: "user", content: "a chair" }], tools: [] }));
  assert.equal(r.status, 402);
  assert.match(((await r.json()) as { error: string }).error, /Lite, Plus and Pro/);
});
