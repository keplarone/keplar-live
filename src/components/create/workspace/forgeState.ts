/** Plain data the Create workspace feeds the three.js forge. No three.js here, so importing it never pulls the 3D bundle. */
export type ForgeFile = { path: string; done: boolean };
export type ForgeState = {
  /** 0..1, computed from real events (characters received, files written, checks done). */
  progress: number;
  /** Increments for every real event (a status line, a test step); each one throws a few sparks. */
  pulse: number;
  /** The files the model has really started (`done` = its closing tag arrived). One block per file; nothing is invented. */
  files: ForgeFile[];
  /** How many files the plan expects (the brief's pages + stylesheet), drawn as faint ghost outlines until a real file takes the slot. */
  planned: number;
  /** 0 while building; set to 1 when the build is finished: the blocks dissolve upward into the real preview. */
  dissolve: number;
};
export const newForgeState = (): ForgeState => ({ progress: 0, pulse: 0, files: [], planned: 0, dissolve: 0 });
