# Differentiation build plan (short copy)

Full plan: `/workspace/keplar-assets/DIFF-BUILD-PLAN.md` (Oct 6, 2026). Plan only, no product code.

- **Phase 0 Foundations:** claim graph (`src/lib/claims/`, `claim_nodes`/`claim_edges`, built from existing comparator/verifier/sourcing output, zero extra model calls), role packs (`src/lib/roles/`), dial (`src/lib/dial.ts`, 0–4, default hard), belief log (`src/lib/beliefs/`, explicit beliefs only).
- **Phase 1 Ask:** #1 receipts (disagreement map + per-sentence source trail), #9 anti-sycophant dial, #10 `/lawyer /nurse /founder /skeptic` role stacks.
- **Phase 2 Sticky truth:** #2 belief-log contradiction flags (`/app/views`, `/api/beliefs`), #3 Team Absolute (multi-model agreed + two human confirms → team truth vault, `/api/team/[id]/vault`).
- **Phase 3:** #5 Decision mode (`/app/decide`, sign / don't / renegotiate card), #4 oral Study quiz + skill map (`/api/study/sets/[id]/oral`).
- **Phase 4 Heavy infra:** #7 Creator co-op (Stripe + support agent + weekly digest), #6 local-first desktop debate (keplar-desktop repo, cloud only for disputed sentences), #8 Keplar Score on `topics/[slug]`.
- **Next 2 weeks:** A) claim graph + map, B) dial (hard default) + sycophancy bench, C) three roles (`/lawyer /founder /skeptic`).
- **User-owned:** API keys, Stripe/Whop live, legal disclaimers, pricing/`TODO(founder approval)` numbers, public topic publication, desktop signing.
- **Constraints:** graphite #0b0b0d B/W/grey, Google Sans, no blue/purple, dark default, no vibe SaaS, never publish creator ages, local Vercel deploy, never git push.
