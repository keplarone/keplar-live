/**
 * The privacy gate for Free-plan requests, in one place so the route, the UI notes and the tests say the same thing.
 *
 * Free questions are answered by free open models on OpenRouter. Their hosts may log prompts and some may use them to improve their
 * models, which is why those requests carry provider.data_collection = "allow" (setting "deny" filters out nearly every free endpoint, so
 * the request fails: src/lib/orchestration/config.ts). So while that is the case, a Free request carries ONLY:
 *   - the question itself (and any image or video frames the person attached to it),
 *   - the recent messages of the same chat (the question's own context).
 * It never carries: saved memory notes, summaries of past chats, snippets of past chats, or the text of attached documents.
 * Memory is also not learned by a model from Free chats (no fact extraction, no model-written chat summaries).
 * KEPLAR_FREE_DATA_COLLECTION=deny restores them (hosts that don't train are the only ones used).
 */
export const FREE_DOCS_NOT_SENT =
  "Documents can't be used on Free. Free questions are answered by free models whose hosts may log prompts and learn from them, so Keplar doesn't send your files there. Remove the attachment (or paste only the lines you need into your question), or upgrade to a paid plan.";

/** One sentence for the app and the Account page. */
export const FREE_PRIVACY_NOTE =
  "On Free, your saved memory and attached documents are never sent to the free models, and no model learns new memory from your Free chats. Only your question and the recent messages of this chat are sent (plus any image or video you attach), and the hosts of free models may log them and use them to improve their models, so keep sensitive details out of Free questions.";
