/**
 * Sitewide switch for the three.js scenes (Oct 2026: off). Every 3D scene asks its own "can this device run WebGL?" question
 * (src/field/caps.ts probeCaps, src/components/spatial/stage.ts detectCaps, WorkingHard, create/workspace/glow3d webglOk). Each of
 * those now returns "no" while this is false, so every scene shows the still / CSS fallback it already has for devices without
 * WebGL, and three.js is never downloaded. The page background is the shared procedural cloud sky.
 */
export const THREE_D_ENABLED = false;
