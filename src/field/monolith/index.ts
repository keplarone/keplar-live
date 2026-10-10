/** Public surface of the Monolith scene, for reuse (home, page backgrounds, the simulation page). Import the heavy class lazily: `await import("@/field/monolith/scene")`. */
export { VARIANTS, variantFor, sample, nodePos, glitchAt, budget, scenePose, NODE_NAMES, NODE_COUNT } from "./math";
export type { Key, Variant, VariantId, Budget, V3 } from "./math";
export type { MonolithOptions, MonolithFrame } from "./scene";
