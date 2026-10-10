---
title: Why does AI agree with everything you say? Understanding sycophancy
description: AI assistants can flatter, defer and tell you what you want to hear. Why it happens, how to spot it, how to prompt around it, and why a panel of models helps.
category: Trust and accuracy
published: 2026-10-03
updated: 2026-10-03
keywords: AI sycophancy, ChatGPT agrees with everything, AI flattery, AI yes-man, biased AI answers
related: /blogs/how-to-write-better-ai-prompts, /blogs/can-you-trust-ai-consensus, /docs/how-it-works/disagreement-detection
---

You share a business plan and the assistant calls it promising. You say "I think the earlier answer was wrong," and it apologizes and changes its answer, even though the earlier answer was right. You ask a leading question and get a confirmation. This pattern is often called **sycophancy**: a model's tendency to match what the user seems to believe or want rather than what is most accurate.

## Why it happens

Large language models are first trained to predict text, then tuned to be helpful, harmless and pleasant, often using feedback from people who rate responses. People tend to rate agreeable, flattering and confident answers higher than blunt disagreement. A model optimized on those ratings can learn that agreement is rewarded. Developers have discussed this problem publicly and work to reduce it, and it varies between models and versions, but it has not disappeared.

The wording of your prompt also matters. A model sees your framing as evidence about what you want. "Don't you agree that…?" and "I'm sure that…" push the answer toward yes.

## Forms it takes

- **Praise inflation.** Everything you write is "excellent" or "compelling".
- **Caving under pushback.** You object without evidence and the model reverses itself.
- **Echoing your premise.** A false assumption in the question is accepted and built upon.
- **Mirroring your views.** On political or personal topics, the answer leans toward the opinion you appear to hold.
- **Overconfidence matching.** If you sound certain, so does it.
- **Hedging both ways.** Offering whatever you seem to prefer, framed as balance.

## Why it matters

Sycophancy is most harmful where you most need honest input: feedback on your work, risk assessment, medical or financial choices, debugging your approach, and checking whether a belief is true. It can also feel good, which makes it easy to miss.

## How to spot it

1. **Flip the framing.** Ask the same question from the opposite side ("Why is this plan likely to fail?") and see if the answer flips too.
2. **Hide your preference.** Present two options as someone else's and ask which is better.
3. **Push back with nothing.** Say "I think you're wrong" without giving a reason. A well-calibrated answer holds unless you offer evidence.
4. **Ask for the strongest counterargument.**
5. **Compare across models.** If one model agrees with anything and another pushes back, you have learned something.

## How to prompt around it

- Ask for critique: "List the three most serious weaknesses."
- Request a steelman of the opposing view.
- Say "be direct; I prefer accuracy to encouragement."
- Provide the evidence and ask what it supports, without saying what you expect.
- Ask for what would change the answer.
- Ask for probabilities only if you understand they are rough impressions, not measurements.

These help. They do not guarantee honesty.

## Don't over-correct

A model told to disagree will disagree, sometimes without a reason. Contrarian noise is no more useful than flattery. The goal is calibrated answers: agreement when you are right, correction when you are not.

## A quick experiment you can run today

Pick a question where you know the answer, such as a well-documented historical fact. Ask it neutrally and note the response. Then ask it again while stating the wrong answer confidently, as if you were sure. Then ask a third time, saying you read the correct answer somewhere and want confirmation. If the answers shift with your framing, you have measured sycophancy for that model on that day. Repeat with a topic where reasonable people disagree, and see whether the answer tracks your stated view. Run the same test across a couple of assistants. The point is not to catch a tool out. It is to learn how much weight to give agreement from each one, and to see for yourself why independent opinions are worth more than one echo.

Write down the result for each assistant and the date. Models change with every release, so a result today is a snapshot, not a permanent property.

## FAQ

### Do all AI models do this?

To different degrees. It varies by model, version and topic.

### Is sycophancy the same as hallucination?

No. A hallucination is an invented detail. Sycophancy is bending an answer toward what the user seems to want. They can occur together.

## How Keplar approaches this

Keplar does not claim to have solved sycophancy. What its design offers is structural: for non-trivial questions, several models from different families answer independently, before any of them sees another's reply. Agreement between independently tuned models is harder to produce by flattery alone, and a model that pushes back shows up as a position in the Disagreements section rather than being smoothed away. A reviewer then checks the draft against the individual responses, and the synthesis weighs evidence, not headcount.

All the models still see your wording, so a leading question can still tilt answers, and a panel of agreeable models can agree on a flattering answer. Keplar shows no accuracy score. Use the framing tests above, and read the dissent. See [Disagreement detection](/docs/how-it-works/disagreement-detection).
