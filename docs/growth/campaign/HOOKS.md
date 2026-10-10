# 10 hooks tied to real problems

Each hook names a **user problem**, the **capability actually demonstrated** (run ids in [DEMO-RUNS.md](DEMO-RUNS.md), 3 Oct 2026, Free plan, free models), and a **measurable next step**. Do not alter the numbers. All destination links use `/for-developers` with utm tags (`?utm_source=<platform>&utm_medium=post&utm_campaign=<hook-id>`).

| ID | Hook (first line a reader sees) | User problem | Demonstrated capability | Measurable next step |
|---|---|---|---|---|
| H1 | "Three AI models split 2-1 on the current Node.js LTS. All three were out of date." | Stale version facts presented confidently | R6: split detected and shown; majority was still wrong (nodejs.org 3 Oct 2026: Node 24 LTS) | `/for-developers` visit -> first question; activated rate |
| H2 | "I asked three models if a two-person startup should rewrite its Node backend in Rust before its first customer. Here is the counterargument they gave." | Fear of a premature rewrite; no one to argue with | R3: the answer includes the strongest counterargument; verifier revised the draft; one of three models failed and the answer said 2 of 3 responded | Clip views -> visits; clicks on example 3 |
| H3 | "JSONB or a normalized table? Three models, one answer, and what would change their mind." | Schema decision for changing preferences | R1: 3 of 3 picked JSONB; answer states when to switch | Visits -> `ask_started` with the example prompt |
| H4 | "localStorage or httpOnly cookies for JWTs? 3 of 3 models said cookies. Agreement is not proof; here is how to check." | Security decision where wrong confidence is costly | R2: 3 of 3 agreed in 9.5 s; copy to checklist | Guide visits; copy/share actions |
| H5 | "One model counted the r's in 'strawberry raspberry cranberry' and said 7. It is 9." | Trust: easy questions get no cross-check | R7: simple question went to one model (known limit) | Trust: feedback-form "problem" submissions (honesty test) |
| H6 | "When AI models disagree, that is the part worth reading." | Single answer hides a minority view | R6, R8: the Disagreements section lists who said what | Share of runs where users open Disagreements (`answer_action`) |
| H7 | "Postgres, DynamoDB or MongoDB for a two-person multi-tenant app: 3 of 3 said Postgres. Ask 'what would change your mind'." | Database choice for a small team | R4: 3 of 3 agreed in 40.5 s | Guide visits; activated rate |
| H8 | "Monorepo or separate repos? I stopped pasting the same question into three chat windows." | Manual comparison across tabs | R5: one question, three models, one answer, 9.7 s | Visit -> first answer time (median) |
| H9 | "A model failed mid-question. The answer still arrived and told me only two of three responded." | Reliability anxiety | R3 (Gemma 4 31B failed; 2 of 3 answered; labelled) | Error-recovery: `ask_error` vs `ask_done` ratio |
| H10 | "You can send one answer to a teammate without sharing your whole chat, and revoke the link later." | Sharing AI advice with a co-founder safely | Share link built and tested in code (revocable, noindex, 90-day expiry); **record a live demo before using this hook** | `share_created` events; visits with `utm_source=share` |

Words not to use: "smartest", "always accurate", "better than ChatGPT/Claude/etc.", any percentage as accuracy, "verified true". Say instead: "see where models agree and split", "one answer", "agreement is a signal, not proof".
