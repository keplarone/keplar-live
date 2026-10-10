/**
 * Front-page story: "One question. Multiple intelligences. One answer." Pure maths (no DOM, no three), shared by the space layer
 * (what the planets and light paths do) and the DOM captions (which beat is on screen). `a` is the act position 0..6 (= damped
 * scroll progress x 6): 0 hero, 1 question, 2 distribution, 3 responses, 4 disagreement, 5 verification, 6 convergence.
 */
import { clamp, smooth } from "./math";

export type Beat = { id: string; text: string; short: string; from: number };

/** Caption beats. `from` is the act position where the beat takes over (the hero, below 0.55, shows no caption). */
export const STORY_BEATS: readonly Beat[] = [
  { id: "question", from: 0.55, text: "It starts with a question.", short: "It starts with a question." },
  { id: "minds", from: 1.6, text: "Keplar asks several minds at once.", short: "Several minds, at once." },
  { id: "disagree", from: 3.5, text: "It finds where they disagree.", short: "Where they disagree." },
  { id: "verify", from: 4.5, text: "It checks what holds up.", short: "What holds up." },
  { id: "answer", from: 5.5, text: "And gives you one answer you can trust.", short: "One answer you can trust." },
];

/** Index into STORY_BEATS for act position a, or -1 on the hero. */
export function beatAt(a: number): number {
  let i = -1;
  for (let k = 0; k < STORY_BEATS.length; k++) if (a >= STORY_BEATS[k].from) i = k;
  return i;
}

/** The light (the question) travels from the monolith core to here: past every planet, nearest first. */
export const SPARK_END: [number, number, number] = [0, 10, -95];

/** One light path per "intelligence" planet. strength: how well its answer holds up. dissent: the one that bends away. */
export type PathRole = { planet: string; strength: number; dissent: boolean; bend: [number, number, number] };
export const PATHS: readonly PathRole[] = [
  { planet: "venus", strength: 0.95, dissent: false, bend: [0.6, 1, 0.1] },
  { planet: "mars", strength: 0.9, dissent: false, bend: [1, -0.4, 0.2] },
  { planet: "saturn", strength: 1, dissent: false, bend: [0.5, 0.8, -0.2] },
  { planet: "jupiter", strength: 1, dissent: false, bend: [-0.7, 0.9, 0] },
  { planet: "uranus", strength: 0.45, dissent: false, bend: [-1, -0.3, 0.2] },
  { planet: "neptune", strength: 0.2, dissent: true, bend: [1, 0.9, 0.3] },
];

export type PathState = { draw: number; alpha: number; bend: number; boost: number; pulse: number; scan: number; collapse: number };
export type StoryState = {
  /** 0..1 how far the question light has travelled along core -> SPARK_END */
  travel: number;
  /** brightness of the travelling light */
  spark: number;
  /** base planet brightness before the light reaches them (darkness of the opening) */
  dark: number;
  /** 0..1: paths' origin moves from the monolith to the answer point near Earth */
  converge: number;
  /** 0..1: the answer point and its orbit around Earth */
  answer: number;
  /** 0..1: Earth comes forward */
  earth: number;
  paths: PathState[];
};

/** Fraction of the spark's travel at which a planet at depth z is passed. */
export const passAt = (z: number) => clamp(-z / -SPARK_END[2]);

/** Story state at act position a. `depth[i]` is the z of PATHS[i]'s planet. */
export function storyAt(a: number, depth: number[]): StoryState {
  const travel = smooth(1.0, 2.7, a);
  const spark = smooth(0.45, 1.0, a) * (1 - 0.75 * smooth(2.7, 3.2, a)) * (1 - smooth(5.3, 5.6, a));
  const dark = 0.55 - 0.37 * smooth(0.2, 1.0, a);
  const diverge = smooth(3.3, 4.05, a) * (1 - smooth(5.4, 5.95, a));
  const verify = smooth(4.35, 5.0, a);
  const converge = smooth(5.35, 5.85, a);
  const collapse = smooth(5.65, 6.0, a);
  const answer = smooth(5.55, 6.0, a);
  const earth = smooth(5.25, 6.0, a);
  const flow = smooth(2.4, 2.9, a) * (1 - smooth(5.5, 5.9, a));
  const paths = PATHS.map((p, i) => {
    const at = passAt(depth[i] ?? -50);
    const draw = smooth(at - 0.02, at + 0.22, travel);
    const weak = 1 - p.strength;
    // disagreement: every path wavers, the weak ones dim, the dissenter bends hard
    let alpha = 0.55 + 0.25 * p.strength;
    alpha *= 1 - diverge * (p.dissent ? 0.35 : weak * 0.6);
    // verification: what holds up brightens, the rest fades (the dissenter almost completely)
    const holds = p.strength >= 0.6;
    alpha *= holds ? 1 : 1 - verify * (p.dissent ? 0.96 : 0.85);
    const boost = holds ? verify * 0.8 : 0;
    return {
      draw, alpha: clamp(alpha), bend: diverge * (p.dissent ? 1 : 0.18 + weak * 0.5), boost,
      pulse: flow, scan: verify * (1 - converge), collapse: holds ? collapse : 1,
    };
  });
  return { travel, spark, dark, converge, answer, earth, paths };
}
