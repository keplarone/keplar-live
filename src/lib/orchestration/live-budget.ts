/**
 * Hard daily spend cap for live model calls (server-only).
 *
 * Every live call reserves its WORST case first (estimated input + the full
 * max_tokens as output, at list price, ×1.15). If today's committed spend +
 * in-flight reservations + this worst case would exceed the cap, the call is
 * never sent and the model shows as failed ("daily live budget reached").
 * After the call, the reservation is replaced by the billed cost (OpenRouter
 * usage.cost) or the token-priced estimate. Timeouts/aborts count the worst case.
 *
 * The cap covers every live provider and every plan: KEPLAR_LIVE_DAILY_USD_CAP
 * (default $5, UTC day). State is shared per process and persisted to the
 * platform store so a restart doesn't reset the day.
 */
import { collection } from "@/lib/create/platform/store";
import { callCostUsd } from "./pricing";
import type { ModelSpec } from "./types";

type Row = { id: string; workspaceId: string; usd: number; calls: number; updatedAt: string };
const SYSTEM = "system";
const utcDay = () => new Date().toISOString().slice(0, 10);
const SAFETY = 1.15;

export const estimateTokens = (s: string) => Math.ceil(s.length / 3.5) + 40;

export class DailySpendGuard {
  private day = "";
  private spent = 0;
  private calls = 0;
  private inflight = 0;
  private loaded: Promise<void> | null = null;
  private writing: Promise<unknown> = Promise.resolve();

  constructor(readonly capUsd: number, private readonly persist = true) {}

  private rows() {
    return collection<Row>("live_model_spend");
  }

  private async ensureDay() {
    const d = utcDay();
    if (d !== this.day) {
      this.day = d;
      this.spent = 0;
      this.calls = 0;
      this.loaded = this.persist
        ? this.rows()
            .get(SYSTEM, d)
            .then((r) => {
              if (r && this.day === d) {
                this.spent += r.usd;
                this.calls += r.calls;
              }
            })
            .catch(() => undefined)
        : Promise.resolve();
    }
    await this.loaded;
  }

  worstCase(model: ModelSpec, inputTokens: number, maxOutputTokens: number): number {
    return (callCostUsd(model, inputTokens, maxOutputTokens, new Date().toISOString()) ?? 0.05) * SAFETY;
  }

  /** Reserve before sending. Returns a release/commit handle, or null if the cap would be exceeded. */
  async reserve(worst: number): Promise<((actualUsd: number) => void) | null> {
    await this.ensureDay();
    if (this.spent + this.inflight + worst > this.capUsd) return null;
    this.inflight += worst;
    const day = this.day;
    let done = false;
    return (actual: number) => {
      if (done) return;
      done = true;
      this.inflight = Math.max(0, this.inflight - worst);
      if (day !== this.day) return; // the day rolled over mid-call; count it on the old day only
      this.spent += Math.max(0, actual);
      this.calls += 1;
      if (this.persist) this.save(Math.max(0, actual));
    };
  }

  /** Persist this call's spend as an atomic add, so several instances' totals add up instead of overwriting each other. */
  private save(usd: number) {
    const day = this.day;
    this.writing = this.writing.then(async () => {
      await this.rows().increment(SYSTEM, day, { usd, calls: 1 }, { id: day, workspaceId: SYSTEM, usd: 0, calls: 0, updatedAt: new Date().toISOString() });
    }).catch(() => undefined);
  }

  async status() {
    await this.ensureDay();
    return { day: this.day, spentUsd: this.spent, inflightUsd: this.inflight, calls: this.calls, capUsd: this.capUsd };
  }
}

const g = globalThis as unknown as { __keplarLiveGuard?: DailySpendGuard };

/** Process-wide guard (one cap for all requests). */
export function liveSpendGuard(capUsd: number): DailySpendGuard {
  if (!g.__keplarLiveGuard || g.__keplarLiveGuard.capUsd !== capUsd) g.__keplarLiveGuard = new DailySpendGuard(capUsd);
  return g.__keplarLiveGuard;
}
