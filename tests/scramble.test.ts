import assert from "node:assert/strict";
import { test } from "node:test";
import { runScramble, scrambleAt, type ScrambleClock } from "../src/lib/typing/scramble";

/** A manual clock: frames only run when the test calls frame(); timers only when advance() passes them. */
function fakeClock() {
  let t = 0, id = 0;
  const frames = new Map<number, (t: number) => void>();
  const timers = new Map<number, { at: number; cb: () => void }>();
  const clock: ScrambleClock = {
    now: () => t,
    raf: (cb) => { frames.set(++id, cb); return id; },
    caf: (h) => { frames.delete(h as number); },
    setTimeout: (cb, ms) => { timers.set(++id, { at: t + ms, cb }); return id; },
    clearTimeout: (h) => { timers.delete(h as number); },
  };
  return {
    clock,
    pending: () => frames.size + timers.size,
    /** Deliver one animation frame at the current time. */
    frame() { const f = [...frames.entries()]; frames.clear(); f.forEach(([, cb]) => cb(t)); },
    /** Move time forward WITHOUT frames (throttled tab); fire due timers. */
    advance(ms: number) {
      t += ms;
      for (const [k, v] of [...timers]) if (v.at <= t) { timers.delete(k); v.cb(); }
    },
  };
}

/** Minimal screen state for the interrupted-run test. */
function view(target: string) {
  const state = { shown: target, running: false, done: 0 };
  return state;
}

test("a run ends on p = 1 and calls onDone once, from frames", () => {
  const f = fakeClock();
  const ps: number[] = [];
  let done = 0;
  runScramble({ duration: 760, onFrame: (p) => ps.push(p), onDone: () => done++ }, f.clock);
  for (let i = 0; i < 60; i++) { f.advance(16); f.frame(); }
  assert.equal(done, 1);
  assert.equal(ps[ps.length - 1], 1);
  assert.equal(f.pending(), 0, "no frame or timer left behind");
});

test("throttled RAF (background tab): the timeout still finishes the run on the final frame", () => {
  const f = fakeClock();
  let last = -1, done = 0;
  runScramble({ duration: 760, onFrame: (p) => (last = p), onDone: () => done++ }, f.clock);
  f.advance(500); // no frame is ever delivered
  assert.equal(done, 0);
  f.advance(600);
  assert.equal(done, 1);
  assert.equal(last, 1);
  assert.equal(f.pending(), 0);
});

test("cancel stops the run: no further frames, no onDone, no leftover timers", () => {
  const f = fakeClock();
  let frames = 0, done = 0;
  const cancel = runScramble({ duration: 760, onFrame: () => frames++, onDone: () => done++ }, f.clock);
  f.advance(100); f.frame();
  const before = frames;
  cancel();
  f.advance(2000); f.frame();
  assert.equal(frames, before);
  assert.equal(done, 0);
  assert.equal(f.pending(), 0);
});

test("rapid target changes always end on the final target", () => {
  const f = fakeClock();
  const targets = ["Keplar-One decides who to ask.", "Each answers on its own.", "Evaluation, not voting.", "ONE ANSWER."];
  let shown = "";
  let sawScramble = false;
  let cancel: (() => void) | null = null;
  const show = (target: string, p: number) => {
    // exactly what the component renders: the real text once p >= 1, otherwise the scramble of it
    if (p < 1) sawScramble = true;
    shown = p >= 1 ? target : scrambleAt(target, p, target.length).map((c) => c.ch).join("");
  };
  const change = (target: string) => {
    cancel?.(); // effect cleanup
    shown = target; // cleanup shows the real text
    cancel = runScramble({ duration: 760, onFrame: (p) => show(target, p), onDone: () => show(target, 1) }, f.clock);
  };
  // switch headings faster than any run can finish, with a mix of delivered and dropped frames
  targets.forEach((t, i) => { change(t); f.advance(40 + i * 20); if (i % 2 === 0) f.frame(); });
  assert.ok(sawScramble, "frames were delivered mid-run");
  f.advance(5000); // throttled tab: timers only
  assert.equal(shown, targets[targets.length - 1]);
  assert.equal(f.pending(), 0);
});

test("interrupted runs leave the real text (the cleanup contract), then a new run can complete", () => {
  const f = fakeClock();
  const st = view("Each answers on its own.");
  const c1 = runScramble({ duration: 760, onFrame: () => (st.running = true), onDone: () => (st.running = false, st.done++) }, f.clock);
  f.advance(200); f.frame();
  assert.equal(st.running, true);
  c1(); st.running = false; // scene scrolled away mid-run: cleanup cancels and settles
  assert.equal(st.done, 0);
  runScramble({ duration: 760, onFrame: () => (st.running = true), onDone: () => (st.running = false, st.done++) }, f.clock);
  f.advance(3000);
  assert.deepEqual([st.running, st.done], [false, 1]);
});

test("the stagger delay is honoured and the run still ends", () => {
  const f = fakeClock();
  const ps: number[] = [];
  let done = 0;
  runScramble({ duration: 1100, delay: 340, onFrame: (p) => ps.push(p), onDone: () => done++ }, f.clock);
  f.advance(300); f.frame();
  assert.equal(ps[0], 0, "still waiting on the delay");
  f.advance(5000);
  assert.equal(done, 1);
});

test("scrambleAt settles to the exact text at p = 1 for every real headline, and keeps length and spaces", () => {
  for (const text of ["Keplar-One decides who to ask.", "Each answers on its own.", "Evaluation, not voting.", "ONE ANSWER.", "One question.", "Multiple intelligences."]) {
    for (let seed = 0; seed < 12; seed++) {
      assert.equal(scrambleAt(text, 1, seed).map((c) => c.ch).join(""), text);
      assert.ok(scrambleAt(text, 1, seed).every((c) => c.settled));
      const mid = scrambleAt(text, 0.3, seed).map((c) => c.ch).join("");
      assert.equal(mid.length, text.length);
      assert.deepEqual([...mid].map((c) => c === " "), [...text].map((c) => c === " "));
    }
  }
});
