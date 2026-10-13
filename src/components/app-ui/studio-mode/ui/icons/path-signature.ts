/**
 * SVG path structure helpers for MorphIcon. A browser can only interpolate the CSS `d` property between two paths whose
 * commands match one for one (same letters, same number of arguments, same arc flags). Anything else snaps. These helpers let
 * tests (tests/studio-ui-icons.test.ts) prove every morph pair is interpolable, so no morph silently degrades into a swap.
 */

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

export interface PathCommand {
  /** Command letter as written (case kept: relative and absolute commands do not interpolate with each other). */
  cmd: string;
  args: number[];
}

/** Parses a path string into commands. Implicit repeats ("L 1 2 3 4") are expanded into explicit commands. Throws on junk. */
export function parsePath(d: string): PathCommand[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const rest = d.replace(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?|[\s,]/g, "");
  if (rest.length) throw new Error(`Unparseable path data near "${rest.slice(0, 12)}"`);
  const out: PathCommand[] = [];
  let i = 0;
  let current: string | null = null;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/[a-zA-Z]/.test(tok)) {
      current = tok;
      i++;
      if (ARITY[tok.toUpperCase()] === undefined) throw new Error(`Unknown path command "${tok}"`);
      if (tok.toUpperCase() === "Z") {
        out.push({ cmd: tok, args: [] });
        current = null;
        continue;
      }
    } else if (!current) {
      throw new Error("Path data must start with a command");
    }
    const cmd = current as string;
    const n = ARITY[cmd.toUpperCase()];
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length !== n || args.some((v) => !Number.isFinite(v))) throw new Error(`Command "${cmd}" needs ${n} numbers`);
    out.push({ cmd, args });
    i += n;
    // After a moveto, implicit pairs are linetos (SVG spec).
    if (cmd === "M") current = "L";
    else if (cmd === "m") current = "l";
  }
  return out;
}

/**
 * Structural signature of a path: command letters, with arc flags inlined because they cannot interpolate
 * (e.g. "M L L Z" or "M A[0,1,1] A[0,1,1]"). Two paths with equal signatures can be morphed by a CSS `d` transition.
 */
export function pathSignature(d: string): string {
  return parsePath(d)
    .map(({ cmd, args }) => (cmd.toUpperCase() === "A" ? `${cmd}[${args[2]},${args[3]},${args[4]}]` : cmd))
    .join(" ");
}

/** True when the two paths can interpolate into each other. */
export function canInterpolate(a: string, b: string): boolean {
  return pathSignature(a) === pathSignature(b);
}

/** Every coordinate of an absolute path, as [x, y] pairs (arc radii and flags excluded). For bounds checks in tests. */
export function pathPoints(d: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (const { cmd, args } of parsePath(d)) {
    const C = cmd.toUpperCase();
    if (C === "Z") continue;
    if (C === "H") pts.push([args[0], NaN]);
    else if (C === "V") pts.push([NaN, args[0]]);
    else if (C === "A") pts.push([args[5], args[6]]);
    else for (let k = 0; k < args.length; k += 2) pts.push([args[k], args[k + 1]]);
  }
  return pts;
}
