/**
 * One latency budget shared by a whole live run. The panel may use up to
 * `panelShare` of it; once a quorum has answered, stragglers get a short grace
 * period instead of the full panel window. Review, synthesis and extraction
 * then run on whatever is left, each with a floor so a slow panel can't starve
 * the answer. A model that misses the budget is a missing vote, never dissent.
 */
export class BudgetExceeded extends Error {
  constructor(what: string) {
    super(`${what} didn't finish within the latency budget.`);
  }
}

export class LatencyBudget {
  private startedAt = 0;
  constructor(
    public totalMs: number,
    readonly opts: { panelShare?: number; minStageMs?: number; graceMinMs?: number; graceMaxMs?: number } = {},
  ) {}

  /** A run that legitimately needs longer (a full how-to guide) raises its own budget; never lowers it. */
  atLeast(ms: number) {
    this.totalMs = Math.max(this.totalMs, ms);
    return this;
  }

  start(now = Date.now()) {
    this.startedAt = now;
    return this;
  }

  get started() {
    return this.startedAt > 0;
  }

  elapsed(now = Date.now()) {
    return this.startedAt ? now - this.startedAt : 0;
  }

  remaining(now = Date.now()) {
    return Math.max(0, this.totalMs - this.elapsed(now));
  }

  /** Absolute deadline for the panel. */
  panelDeadline() {
    return this.startedAt + this.totalMs * (this.opts.panelShare ?? 0.55);
  }

  /**
   * Deadline for panel stragglers once `responded` of `asked` have answered:
   * with a quorum (≥ 2 and ≥ half), wait at most max(graceMin = 6 s, 75% of the time
   * the panel has taken so far), never past the panel deadline.
   */
  stragglerDeadline(responded: number, asked: number, now = Date.now()): number {
    const panel = this.panelDeadline();
    if (responded < 2 || responded * 2 < asked) return panel;
    const grace = Math.min(this.opts.graceMaxMs ?? Infinity, Math.max(this.opts.graceMinMs ?? 6000, (now - this.startedAt) * 0.75));
    return Math.min(panel, now + grace);
  }

  /** Time for a post-panel stage: what's left, but at least the floor. */
  stageMs(share = 1, now = Date.now()) {
    return Math.max(this.opts.minStageMs ?? 8000, Math.floor(this.remaining(now) * share));
  }

  /** Signal that aborts after `ms` or when the parent aborts. */
  static signal(ms: number, parent?: AbortSignal): AbortSignal {
    const t = AbortSignal.timeout(Math.max(1, ms));
    return parent ? AbortSignal.any([parent, t]) : t;
  }
}

/** True when the error is an abort caused by our own timer rather than the caller. */
export function isBudgetAbort(e: unknown, parent?: AbortSignal): boolean {
  if (parent?.aborted) return false;
  return e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError");
}
