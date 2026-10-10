# 3 landing-page message variants (for `/for-developers` or the home hero)

Selected hypothesis: **V1**. The others are held for X5 and are used only once there are at least 500 qualified visits per variant. Pricing, limits and models stay as on the site; none of these claims accuracy.

| | V1 (chosen) - decision | V2 - disagreement | V3 - stop copy-pasting |
|---|---|---|---|
| H1 | Get a second opinion before you commit to the technical decision. | See where AI models disagree before you ship. | Stop pasting one question into three chatbots. |
| Sub | Ask once. Keplar sends your question to several AI models, shows how many agreed and exactly where they split, and writes one answer. | Several models answer independently. Keplar shows the split, checks a draft, and gives you one answer. | One question goes to several models. You get one answer and a list of where they differed. |
| Primary CTA | Try a decision, free, no signup | Ask your own question | Ask once, compare in one place |
| Proof shown | Three example decisions and "what we saw when we tested it" including failures (3 Oct 2026) | Node.js LTS split and the Disagreements section | The 9-40 s run: one prompt, three models |
| Strength | Names the job and audience | Names the differentiator | Names the existing manual behavior |
| Risk | Narrow | Splits are uncommon (2 of 12 runs), may over-promise | Weaker novelty (many multi-model comparison tools exist) |
| Metric | visit -> activated | CTA click -> first answer | visit -> first answer |
Decision rule: see EXPERIMENTS.md X5; without 500 visits per variant record only descriptively.

Implemented: V1 on `/for-developers` (live). Home hero and pricing copy belong to other workstreams (COORDINATION.md).
