/**
 * The one plain-language statement about training, shown in Account > Your data. It mirrors the Privacy Policy
 * ("Our approach to AI training", "AI providers") and must stay true to the code: Keplar itself never trains models;
 * Plus/Pro OpenRouter requests carry provider.data_collection = "deny" (src/lib/orchestration/config.ts); Free requests do not,
 * because free endpoints are mostly flagged as collecting prompts. tests/training-statement.test.ts checks both.
 */
import { FREE_PRIVACY_NOTE } from "./free-gate";

export const TRAINING_STATEMENT = [
  "Keplar does not use your chats, files or memory to train AI models, and does not sell your data.",
  "Your questions are sent to the model providers Keplar picks for each request. On Free, those are free open models hosted by third parties that may log prompts and may use them to improve their models, so keep sensitive information out of Free questions. On Plus and Pro, requests through OpenRouter are limited to endpoints that say they do not collect or train on prompts; requests sent directly to OpenAI or NVIDIA follow their API terms, and providers may keep requests for a limited time, for example to detect abuse.",
  FREE_PRIVACY_NOTE,
  "Help improve Keplar is off unless you turn it on. Even then, the models are not retrained: it only lets Keplar keep a shortened, cleaned copy of a question that went wrong to test its own routing.",
] as const;
