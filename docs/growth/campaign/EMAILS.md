# 3 onboarding email drafts (INACTIVE: not wired to any sender)

Status: drafts only. Nothing sends them. Before any activation the founders must approve: copy, sender name/domain (SPF/DKIM), a lawful basis and consent (the cookie banner does not cover email), an unsubscribe link in every message, and a physical-address line if required by the sending jurisdiction. Each email links to a user problem, a capability and a measurable action. Plain text, no tracking pixels. Cancel/feedback link must be present and must never make cancelling harder.

## E1. Day 1 - "Your first decision" (trigger: account created, no answer yet)
Subject: One decision you've been putting off?
Hi [first name], welcome to Keplar. The quickest way to see what it does is to ask it a decision, not a fact: a stack choice, a schema, a build-or-rewrite call. Try: "I'm a solo developer. [your choice]. Pick one and say what would change your mind." You'll see how many models agreed, and where they split, if they did.
[Open Keplar] - Not useful? Tell us why: keplar.one/feedback
Measure: sessions with `ask_started` within 24 h of send.

## E2. Day 4 - "Check where they split" (trigger: at least 1 answer, no detail section opened)
Subject: Where did the models disagree?
Hi [first name], your answers include a Disagreements section and a Verification note. When the models agree, that's a good sign, not proof. When they split, that's the part to check before you act. Open the last answer and read both. If something looked wrong, tell us: keplar.one/feedback?kind=problem
Measure: `answer_action` (open_disagreements/open_verification) within 7 days.

## E3. Day 10 - "What would make this useful?" (trigger: activated or not; one email only)
Subject: Two questions
Hi [first name], we're a two-person team and read every reply. What decision are you facing that Keplar could not help with yet? And what would make you come back weekly? Reply to this email or use keplar.one/feedback. Free plan limits and plans are on keplar.one/pricing; you don't need to upgrade for anything here. To stop these messages: [unsubscribe]. To cancel a paid plan at any time: [account link].
Measure: replies and feedback submissions; unsubscribes tracked as a guardrail (>2% of sends = stop the series).
