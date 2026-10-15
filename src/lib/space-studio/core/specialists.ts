// Synced from keplarone/space-studio src/core — edit there, then copy.
/**
 * Specialist tracks: six focused instruction blocks, one of which is added to the model's system prompt for each request.
 * Shared by the desktop app (Local engine, which builds its own prompt) and keplar.one (cloud models, where the server classifies
 * the prompt itself and never trusts a track sent by a client).
 *
 * HOW TO UPDATE A TRACK
 * - `instructions`: how the model should work in this area. Keep it short and imperative; it is sent with every matching request,
 *   so every line costs tokens (and, for cloud models, credits).
 * - `notes`: reference facts the model tends to get wrong. Only add facts you have checked against the official Roblox Creator
 *   Docs or the Blender Python API docs for the versions people actually use; remove a note as soon as it goes stale.
 * - `keywords`: words that pull a prompt toward this track. A weight of 3 is a strong signal (a class or API name), 1 a weak one.
 *   Matching is whole-word and case-insensitive; multi-word phrases match as written.
 * - After changing anything: run `npm test` (test/specialists.test.ts holds the routing examples; add one for every new keyword
 *   you rely on), copy src/core to keplar-live (src/lib/space-studio/core, see that folder's header) and release both.
 */
import type { Workload } from "./models";

export type TrackId = "luau" | "blender" | "vfx" | "ui" | "retention" | "audio";

export type Track = {
  id: TrackId;
  name: string;
  /** One line for the UI ("Answered as: Roblox Luau systems"). */
  summary: string;
  keywords: Record<string, 1 | 2 | 3>;
  instructions: string;
  notes: string[];
};

export const TRACKS: Record<TrackId, Track> = {
  luau: {
    id: "luau",
    name: "Roblox Luau systems",
    summary: "Server-authoritative Luau, networking, data and performance",
    keywords: {
      luau: 3, lua: 2, script: 1, modulescript: 3, localscript: 3, remoteevent: 3, remotefunction: 3, datastore: 3, datastoreservice: 3,
      profilestore: 3, replication: 3, replicate: 2, server: 1, client: 1, exploit: 3, exploiter: 3, "anti-cheat": 3, anticheat: 3,
      runservice: 3, heartbeat: 2, coroutine: 2, "task.spawn": 3, pcall: 3, oop: 2, metatable: 3, leaderstats: 3, "game pass": 2,
      gamepass: 2, marketplaceservice: 3, processreceipt: 3, teleport: 2, teleportservice: 3, memorystore: 3, messagingservice: 3,
      lag: 1, memory: 1, bug: 1, error: 1, nil: 2, cooldown: 2, inventory: 2, "pathfinding": 2, pathfindingservice: 3,
    },
    instructions: [
      "You are working on Roblox experience code in Luau.",
      "Treat the client as untrusted: validate every RemoteEvent/RemoteFunction argument on the server (type, range, ownership, rate) and keep authoritative state on the server.",
      "Prefer the task library (task.wait, task.spawn, task.defer) over the deprecated wait/spawn/delay.",
      "Wrap every DataStore call in pcall with bounded retries; use UpdateAsync for read-modify-write and save on PlayerRemoving and game:BindToClose.",
      "Show complete, runnable scripts with where each one goes (ServerScriptService, ReplicatedStorage, StarterPlayerScripts). Add type annotations where they help.",
      "Point out performance costs (per-frame loops, many connections, unanchored parts) and disconnect what you connect.",
    ].join("\n"),
    notes: [
      "RemoteFunction:InvokeClient can yield forever or error if the client leaves; avoid it on the server.",
      "MarketplaceService.ProcessReceipt must return Enum.ProductPurchaseDecision.PurchaseGranted only after the grant is saved, and there can be only one ProcessReceipt callback per experience.",
      "DataStore keys are limited to 50 characters and values to 4 MB; requests are throttled per server, so batch and cache.",
      "Use CollectionService tags and attributes instead of deep FindFirstChild chains for systems that act on many instances.",
    ],
  },
  blender: {
    id: "blender",
    name: "Blender modeling and materials",
    summary: "bpy and bmesh scripts, clean topology, UVs, baking and PBR",
    keywords: {
      blender: 3, bpy: 3, bmesh: 3, mesh: 2, topology: 3, "low poly": 3, lowpoly: 3, "high poly": 3, retopo: 3, retopology: 3, uv: 3,
      unwrap: 3, bake: 3, baking: 3, normal: 1, "normal map": 3, pbr: 3, "principled bsdf": 3, material: 2, texture: 2, procedural: 2,
      "geometry nodes": 3, modifier: 2, subdivision: 2, decimate: 3, fbx: 3, obj: 2, gltf: 3, export: 1, rig: 2, armature: 3, cycles: 3,
      eevee: 3, sculpt: 2, vertex: 2, polygon: 2, polycount: 3, triangles: 2, "shader nodes": 3,
    },
    instructions: [
      "You are writing Blender Python (bpy/bmesh) or explaining Blender workflows for game-ready assets.",
      "Target a recent Blender 4.x API and say so; avoid operators that need a specific UI context when a data-API equivalent exists.",
      "Keep topology clean (quads where it deforms, no n-gons on curved surfaces, no stray loose geometry) and state the triangle budget.",
      "For game export, apply scale/rotation, set the origin deliberately, and give Roblox-friendly sizes (Roblox imports FBX/OBJ/glTF; 1 stud ≈ 0.28 m by default scale).",
      "For materials, use Principled BSDF with metallic/roughness maps; explain which maps to bake and at what resolution.",
    ].join("\n"),
    notes: [
      "In Blender 4.x the Principled BSDF socket names changed (for example 'Specular' became 'Specular IOR Level'); look sockets up by name defensively.",
      "Baking runs in Cycles: set the render engine to CYCLES, select the source then the target object, and give the target an Image Texture node selected as active.",
      "Roblox MeshParts have a per-mesh triangle limit (currently 20,000 for imported meshes); split or decimate above that.",
    ],
  },
  vfx: {
    id: "vfx",
    name: "Lighting, graphics and VFX",
    summary: "Lighting setups, post-processing, particles and beams",
    keywords: {
      lighting: 3, light: 1, shadow: 2, shadows: 2, atmosphere: 3, sky: 2, skybox: 3, fog: 2, bloom: 3, "color correction": 3,
      colorcorrection: 3, sunrays: 3, "depth of field": 3, blur: 1, particle: 3, particles: 3, particleemitter: 3, beam: 3, trail: 3,
      vfx: 3, effect: 1, effects: 1, explosion: 2, glow: 2, neon: 2, "future lighting": 3, pointlight: 3, spotlight: 3, surfacelight: 3,
      "post processing": 3, postprocessing: 3, mood: 1, ambient: 2, emission: 2, flipbook: 3,
    },
    instructions: [
      "You are designing Roblox lighting and visual effects.",
      "Give concrete property values (Lighting.Technology, Brightness, ClockTime, Ambient/OutdoorAmbient, Atmosphere Density/Haze, post-processing instances) and explain the look each change produces.",
      "Build effects from ParticleEmitter, Beam and Trail with exact properties (Rate, Lifetime, Speed, Size/Transparency NumberSequences, LightEmission) and trigger them from code with :Emit(n) where bursts fit.",
      "Keep effects cheap: cap particle counts, reuse emitters, and disable effects far from the camera.",
    ].join("\n"),
    notes: [
      "Lighting.Technology 'Future' gives the most accurate local lights and shadows but costs the most; 'ShadowMap' is the usual middle ground.",
      "Post-processing objects (BloomEffect, ColorCorrectionEffect, SunRaysEffect, DepthOfFieldEffect, BlurEffect) go under Lighting or the Camera.",
      "ParticleEmitter.LightEmission blends additively (1 = fully additive); FlipbookLayout animates sprite sheets.",
    ],
  },
  ui: {
    id: "ui",
    name: "UI and TweenService animation",
    summary: "Responsive Roblox UI, layout, and smooth tweens",
    keywords: {
      ui: 3, gui: 3, screengui: 3, frame: 1, button: 2, textbutton: 3, imagebutton: 3, textlabel: 3, menu: 2, hud: 3, shop: 1,
      tween: 3, tweenservice: 3, tweeninfo: 3, animation: 1, animate: 1, uiscale: 3, uiaspectratioconstraint: 3, uilistlayout: 3,
      uigridlayout: 3, uicorner: 3, uistroke: 3, uipadding: 3, layout: 2, responsive: 3, mobile: 2, scale: 1, offset: 1, anchorpoint: 3,
      "ui pack": 3, icon: 1, notification: 2, popup: 2, "health bar": 3, healthbar: 3, inventory: 1,
    },
    instructions: [
      "You are building Roblox UI and UI animation.",
      "Lay out with Scale (not Offset) plus AnchorPoint, UIAspectRatioConstraint, UIListLayout/UIGridLayout and UIPadding so it works on phones, tablets, PC and console; mention safe areas (ScreenGui.ScreenInsets).",
      "Animate with TweenService:Create(instance, TweenInfo.new(time, easingStyle, easingDirection), goals), cancel or reuse running tweens, and keep animations short (0.15–0.4 s for feedback).",
      "UI code runs in LocalScripts; anything that grants items or currency must be verified on the server.",
      "Make interactive elements large enough to tap and readable at small sizes; support gamepad selection where it matters.",
    ].join("\n"),
    notes: [
      "TweenInfo.new(time, EasingStyle, EasingDirection, repeatCount, reverses, delayTime); repeatCount -1 loops forever.",
      "UIStroke and UICorner render on top of the GuiObject's own properties; UIScale scales a whole subtree including strokes.",
    ],
  },
  retention: {
    id: "retention",
    name: "Retention and game-loop design",
    summary: "Core loops, onboarding and fair monetization, measured honestly",
    keywords: {
      retention: 3, retain: 2, "game loop": 3, "core loop": 3, loop: 1, onboarding: 3, tutorial: 2, viral: 3, trending: 3, trend: 2,
      engagement: 3, "daily reward": 3, "daily rewards": 3, streak: 2, progression: 3, rebirth: 3, prestige: 3, quest: 2, quests: 2,
      monetization: 3, monetize: 3, "game pass": 1, robux: 2, ccu: 3, players: 1, "session length": 3, d1: 3, d7: 3, analytics: 3,
      funnel: 3, "first time user": 3, ftue: 3, grow: 1, growth: 2, marketing: 3, thumbnail: 2, icon: 1, "front page": 3, algorithm: 2,
    },
    instructions: [
      "You are advising on Roblox game design for retention and growth.",
      "Reason from the core loop (what the player does every 30 seconds, every session, every week) and the first five minutes of a new player.",
      "Tie every suggestion to a metric the creator can actually see (Creator Dashboard retention D1/D7, session length, conversion, paying users) and say how to test it (A/B or before/after with dates).",
      "Do not invent statistics or claim what 'the algorithm' rewards beyond what Roblox has published; say when something is an assumption to test.",
      "Keep monetization fair and within Roblox policy: no deceptive offers, clear value, and paid random items must show their odds as Roblox requires.",
    ].join("\n"),
    notes: [
      "Roblox's discovery documentation emphasises engagement and retention signals (for example playtime and return visits); treat specific weightings as unknown.",
      "Experience Guidelines/age ratings affect who can see an experience; recommend completing the maturity questionnaire.",
    ],
  },
  audio: {
    id: "audio",
    name: "Audio and level geometry",
    summary: "Spatial sound, collisions and map performance",
    keywords: {
      sound: 3, sounds: 3, audio: 3, music: 3, sfx: 3, "spatial audio": 3, soundgroup: 3, soundservice: 3, rolloff: 3, reverb: 3, volume: 1,
      footsteps: 3, ambience: 3, map: 2, level: 1, terrain: 3, geometry: 2, collision: 3, collisions: 3, collisionfidelity: 3,
      "collision group": 3, collisiongroup: 3, physics: 2, anchored: 2, cancollide: 3, streaming: 2, streamingenabled: 3, parts: 1,
      "part count": 3, "draw calls": 3, lod: 3, csg: 3, union: 2, "level design": 3, obby: 2,
    },
    instructions: [
      "You are working on Roblox audio and level construction.",
      "For sound: parent Sounds to parts for 3D positional audio (or SoundService for 2D), set RollOffMode, RollOffMinDistance/MaxDistance, group them with SoundGroups for mixing, and preload what plays immediately.",
      "For geometry: keep part and union counts down, anchor static parts, choose CollisionFidelity deliberately (Box/Hull for props), turn off CanCollide/CanTouch/CanQuery where they aren't needed, and use CollisionGroups via PhysicsService.",
      "Recommend StreamingEnabled for large maps and explain what must be streamed carefully (things scripts reference at start).",
    ].join("\n"),
    notes: [
      "Sound.RollOffMode InverseTapered is the usual choice for natural falloff; Linear ends exactly at RollOffMaxDistance.",
      "Unions are rendered and collided as meshes; many small unions can cost more than plain parts.",
    ],
  },
};

export const TRACK_IDS = Object.keys(TRACKS) as TrackId[];

/** Without a clear signal, the workspace decides. */
const DEFAULT_BY_WORKLOAD: Record<Workload, TrackId> = { roblox: "luau", blender: "blender", general: "luau" };

export type Classification = { track: TrackId; confidence: "strong" | "weak" | "default"; scores: Record<TrackId, number> };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Compiled once: one whole-word, case-insensitive pattern per keyword.
const PATTERNS: [TrackId, RegExp, number][] = TRACK_IDS.flatMap((id) =>
  Object.entries(TRACKS[id].keywords).map(([k, w]) => [id, new RegExp(`(?:^|[^a-z0-9_])${escape(k.toLowerCase())}(?:$|[^a-z0-9_])`), w] as [TrackId, RegExp, number]),
);

/**
 * Picks the track for a prompt: keyword weights per track, plus a small bias toward the workspace's own track. Runs in well
 * under a millisecond for a 20,000-character prompt (only the first 4,000 characters are read).
 */
export function classifyIntent(text: string, workload: Workload): Classification {
  const t = ` ${String(text ?? "").slice(0, 4_000).toLowerCase()} `;
  const scores = Object.fromEntries(TRACK_IDS.map((id) => [id, 0])) as Record<TrackId, number>;
  for (const [id, re, w] of PATTERNS) if (re.test(t)) scores[id] += w;
  scores[DEFAULT_BY_WORKLOAD[workload]] += 0.5;
  const ranked = [...TRACK_IDS].sort((a, b) => scores[b] - scores[a]);
  const best = ranked[0]!;
  const top = scores[best];
  const second = scores[ranked[1]!];
  if (top < 2) return { track: DEFAULT_BY_WORKLOAD[workload], confidence: "default", scores };
  return { track: best, confidence: top >= 4 && top - second >= 2 ? "strong" : "weak", scores };
}

/** The block appended to the system prompt for a track. */
export function specialistBlock(id: TrackId): string {
  const t = TRACKS[id];
  return `Specialist focus: ${t.name}.\n${t.instructions}\nReference notes (checked facts; prefer them over memory):\n${t.notes.map((n) => `- ${n}`).join("\n")}`;
}
