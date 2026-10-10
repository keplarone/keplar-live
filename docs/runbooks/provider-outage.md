# Model provider outage or degradation

Signals: `/admin` Providers table shows rising errors / p95 latency; users see "no response" messages; `x-request-id` lines with `rate_limited` / `timeout`.

1. Confirm on the provider's status page (OpenRouter, OpenAI, NVIDIA).
2. The router already falls back to other models/providers (up to 3 substitutes) and never bills a run where no model answered.
3. If one provider is failing hard: `/admin` -> Disabled providers or vendors -> add `openrouter` (route provider) or a vendor (`openai`, `anthropic`...). The registry skips it immediately and picks the next route/model.
4. If everything is down: leave as is (users get a plain error and are not charged), or Global AI stop with reason "provider outage" to avoid retry load.
5. Free-plan chat depends on OpenRouter `:free` models only; during an outage Free shows "free models are busy".
6. Recovery: remove the switch, watch error rate fall in `/admin`.
