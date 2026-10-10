/**
 * Hard spend cap for live runs. Before every live call the guard reserves that
 * call's WORST CASE (estimated input + the full max_tokens as output, plus any
 * web searches, with a safety margin). If committed spend + open reservations +
 * this call would exceed --max-usd, the call is never sent and the run aborts.
 * After the call, the reservation is replaced by the cost counted for it
 * (the max of OpenRouter's billed cost, the BYOK upstream cost and a token-price estimate).
 */
import { tokenCost } from "./estimate";

export class CapExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapExceededError";
  }
}

export const RESERVE_SAFETY = 1.15;

export class SpendGuard {
  private committed = 0;
  private reserved = 0;
  private calls = 0;
  private tripped: string | null = null;

  constructor(readonly capUsd: number, readonly at: string) {
    if (!(capUsd > 0)) throw new Error("--max-usd must be a positive number");
  }

  worstCase(modelId: string, inputTokens: number, maxTokens: number, searches = 0, perSearchUsd = 0): number {
    return tokenCost(modelId, inputTokens, maxTokens, this.at) * RESERVE_SAFETY + searches * perSearchUsd;
  }

  /** Reserve or throw. Once tripped, every later call throws too (the run stops). */
  reserve(usd: number, what: string): () => void {
    if (this.tripped) throw new CapExceededError(this.tripped);
    if (this.committed + this.reserved + usd > this.capUsd) {
      this.tripped = `Spend cap: next call (${what}, worst case $${usd.toFixed(4)}) would exceed --max-usd $${this.capUsd.toFixed(2)} (spent $${this.committed.toFixed(4)}, in flight $${this.reserved.toFixed(4)}). Aborted before sending.`;
      throw new CapExceededError(this.tripped);
    }
    this.reserved += usd;
    let open = true;
    return () => {
      if (open) { this.reserved -= usd; open = false; }
    };
  }

  commit(usd: number) {
    this.committed += usd;
    this.calls++;
  }

  get spent() { return this.committed; }
  get inFlight() { return this.reserved; }
  get callCount() { return this.calls; }
  get abortedReason() { return this.tripped; }
}
