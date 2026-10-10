# 6 short video scripts (20-45 s each)

Rules: record the **real live product** (Free plan, anonymous is fine), screen only or with the founder's own voice; speed up waiting time only if the clip says "sped up"; show the date; never edit the answer text. Each clip links one hook ([HOOKS.md](HOOKS.md)), one run in [DEMO-RUNS.md](DEMO-RUNS.md), and one measurable next step. Re-run the prompt on the day of recording and show that day's result; if the result differs from the run record, use the new one and save its stream. End card: "keplar.one/for-developers - free, no signup". On-screen disclosure: "Free plan, free models. Results vary."

### V1 - "Three models, all out of date" (H1, R6) - 40 s
1. (0-5 s) Screen: `keplar.one/app` empty composer. Voice: "I asked three AI models: what is the current Node.js LTS?"
2. (5-12 s) Paste the exact R6 prompt, press send; the stages run (understand, select, compare). Voice: "Keplar sends it to several models and compares."
3. (12-22 s) Result: badge "2 of 3 models", callout "did not fully agree"; click the callout to open Disagreements. Voice: "Two said 22, one said 20."
4. (22-32 s) Cut to nodejs.org/en/about/previous-releases showing the real LTS table of the day. Voice: "Both were out of date. Agreement is not proof."
5. (32-40 s) End card. Metric: clicks to `/for-developers`; activated rate of that utm.

### V2 - "Rust rewrite before the first customer" (H2, R3) - 45 s
Screen: paste the R3 prompt; show 2-3 model rows (one "failed" if it happens again; say so); scroll to the strongest counterargument paragraph; open Verification to show the reviewer's note ("1 issue found, resolved"). Voice: "No by default, and the counterargument it gives: if the current backend is already failing under measured load. Check that before you rewrite." Metric: clip -> visit -> `ask_started` on example 3.

### V3 - "What would change your mind" (H3, R1) - 30 s
Screen: R1 prompt; answer "Pick JSONB" with the switch conditions. Voice: "Adding 'say what would change your mind' turns an opinion into a checklist: complex joins, strict constraints, measured JSONB size problems." Show Copy -> paste in a notes file. Metric: copy actions (`answer_action: copy`).

### V4 - "The miss: strawberry raspberry cranberry" (H5, R7) - 25 s
Screen: R7 prompt; the answer says 7 and "single model, nothing to compare"; then type the phrase into a code editor/console to count 9 (`"strawberry raspberry cranberry".split("r").length - 1` = 9). Voice: "Easy questions are sent to one model and not cross-checked. Here it was wrong. That is a limit, and we say so." Metric: feedback submissions of kind "problem"; no growth claim.

### V5 - "How to read the badge" (H6, R8) - 35 s
Screen: R8 mortgage run (or a fresh trade-off prompt). Point at "N of M models" and "Models agree / split"; open Disagreements; read the minority position. Voice: "This is not a score. It is how many models took the same position. Agreement is a good sign, not proof." Metric: share of runs where Disagreements is opened.

### V6 - "Share one answer, keep the chat private" (H10) - 40 s
Needs a signed-in account (record on a test account). Screen: finish an answer; press Share; show the preview of exactly what is in the link; tick/untick the question; Create link; open it in a private window (page says noindex in the source); revoke; reload to show the 404. Voice: "Nothing is shared until you create the link, and you can revoke it." **Before recording, confirm in the live product that the Share button appears and works** (verified only by tests and API checks in this work). Metric: `share_created`.

## Reuse
Each clip becomes: a vertical Short/Reel (cut to 25-45 s), an animated GIF for the guide, an embed in the DEV/Hashnode cross-post, and a still frame for the post image. Reuse the same saved run in the guide ([POSTS.md](POSTS.md)).
