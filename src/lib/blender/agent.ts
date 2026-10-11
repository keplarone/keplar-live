/**
 * Blender mode: Keplar builds models and textures in the person's Blender through the Keplar add-on (keplar-desktop:
 * build/blender/keplar_blender.py), with the same turn machinery as Roblox Studio mode (src/lib/studio/agent.ts runStudioTurn
 * with BLENDER_PROFILE). Kept cheap on purpose: a short system prompt (cached), short tool definitions, small thinking and
 * output budgets, and text tools first (a viewport image only when the model truly needs one).
 *
 * Blender's Python is not sandboxed the way Studio's Luau is: it can reach files and the network. So Python that imports system,
 * file or network modules, opens files, or quits/saves Blender is blocked (the add-on's own tools do downloads and export), and
 * Python that deletes things always waits for the person. This is a check on the code's text, not a sandbox: the real gate is
 * that changes wait for approval unless the person turned on auto-approve for safe changes.
 */
import type { Risk, TurnProfile } from "@/lib/studio/agent";

export const BLENDER_TOOL_POLICY: Record<string, Risk | "blocked"> = {
  scene: "read",
  object: "read",
  view: "read",
  ph_search: "read",
  python: "change",
  ph_texture: "change",
  ph_hdri: "change",
  ph_model: "change",
  export: "change",
};

/** Modules and calls that reach outside Blender (files, processes, network, the add-on system itself). */
const OUTSIDE = /\b(?:import|from)\s+(?:os|sys|subprocess|shutil|socket|ctypes|importlib|pathlib|requests|urllib|http|ftplib|smtplib|webbrowser|winreg|multiprocessing|threading|asyncio|pickle|marshal|zipfile|tarfile|tempfile|glob|io|builtins|addon_utils|_winapi|nt|posix)\b|__import__|__builtins__|__subclasses__|\bopen\s*\(|\beval\s*\(|\bexec\s*\(|\bcompile\s*\(|\bgetattr\s*\(\s*bpy\s*,|bpy\.ops\.wm\.(?:quit|save|open|read|append|link|recover|url_open|path_open)|bpy\.ops\.(?:preferences|script|extensions)\.|bpy\.utils\.(?:register|unregister|execfile)|bpy\.app\.handlers|bpy\.app\.timers|\.filepath(?:_raw)?\s*=|bpy\.ops\.(?:export_scene|export_mesh|wm\.\w+_export)|\.save\s*\(|\.save_render\s*\(/;
/** Deleting or wiping things: shown and approved every time. */
const DELETES = /\.remove\s*\(|bpy\.ops\.object\.delete|bpy\.ops\.outliner\.delete|bpy\.ops\.mesh\.delete|\.clear\s*\(\s*\)|orphans_purge|bpy\.ops\.wm\.read_homefile/;

export function blenderRiskOf(name: string, args: Record<string, unknown>): Risk | "blocked" {
  const base = BLENDER_TOOL_POLICY[name] ?? "blocked";
  if (name !== "python") return base;
  const code = typeof args.code === "string" ? args.code : "";
  if (!code.trim()) return "blocked";
  if (OUTSIDE.test(code)) return "blocked";
  if (DELETES.test(code)) return "destructive";
  return "change";
}

/** Short on purpose: it is part of every request (cached after the first). */
export const BLENDER_SYSTEM = `You are Keplar, an expert 3D modeller and texture artist working in the person's Blender through tools. Be efficient: few turns, compact code, short messages.

How you work:
1. Each request starts with a compact scene summary. Plan in 2 to 6 numbered lines ("1. ..."), then build every step; start each step's message with "Step N:".
2. Model with python (bpy, bmesh, mathutils are imported): primitives or bmesh plus modifiers (bevel, subdivision, solidify, array, mirror, boolean, weld), real-world scale in metres, clean quad topology, smooth shading with weighted normals where it helps, sensible origins, every object named and kept in a collection named after the asset. Build a whole asset or part per call, not one vertex at a time. Apply what should be applied before export.
3. Textures: for realistic surfaces use ph_search then ph_texture (full PBR set, free CC0). For stylised or custom looks write procedural Principled BSDF node materials (noise, voronoi, wave, musgrave-style layers into color ramps for colour and roughness, bump for detail). Meshes need UVs before image textures.
4. Lighting only when asked or for a scene: ph_hdri. Imported props: ph_model.
5. Check with scene and object (text). Use view only when you cannot tell from them. If python returns an error, fix that line and continue.
6. Game assets (Roblox): under 10k triangles per mesh, transforms applied, then export as fbx.
7. Finish in 1 to 3 lines: what you made, the object names, and one idea for what to add.

Python is for bpy only: never import os, sys, subprocess, network or file modules, never open or write files, never quit or save Blender. Use the tools for downloads and export. If a call is blocked, say what you need. Print only short results.`;

export const BLENDER_PROFILE: TurnProfile = {
  system: BLENDER_SYSTEM,
  riskOf: blenderRiskOf,
  meter: "blender.agent",
  title: "Keplar Blender mode",
  // A whole asset's code fits; thinking stays small (both are billed as output, the expensive side).
  maxOutputTokens: 8_000,
  reasoningTokens: 1_500,
};
