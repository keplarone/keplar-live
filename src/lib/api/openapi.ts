/** OpenAPI 3.1 description of the public API (BETA). Served at /api/v1/openapi.json and rendered on /developers. */
import { API_ASK_LIMITS } from "./policy";

const err = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });

export function openApiSpec(origin = "https://keplar.one") {
  return {
    openapi: "3.1.0",
    info: {
      title: "Keplar API (beta)",
      version: "1.0.0-beta",
      description: "Ask Keplar a question and get one final answer plus a summary of where the models disagreed. BETA: fields may be added; existing fields won't be renamed or removed within v1. Paid plans only (Lite and above); answers spend the same credits as in the app.",
    },
    servers: [{ url: origin }],
    security: [{ bearer: [] }],
    paths: {
      "/api/v1/ask": {
        post: {
          operationId: "ask",
          summary: "Ask a question",
          description: "Runs the same multi-model pipeline as the app. Stateless: nothing is saved to memory or chats. With `stream: true` (or `Accept: text/event-stream`) the response is Server-Sent Events: `progress`, `delta` (a live preview only; the `answer` event is the authoritative final text), `answer`, then `done`, or `error`.",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AskRequest" } } } },
          responses: {
            "200": { description: "The answer (JSON), or an event stream when streaming.", content: { "application/json": { schema: { $ref: "#/components/schemas/Answer" } }, "text/event-stream": { schema: { type: "string", description: "SSE events: progress, delta, answer, done, error." } } } },
            "400": err("Invalid request."),
            "401": err("Missing, invalid, revoked or expired key."),
            "402": err("The plan's credits or a rolling limit are used up (resets are in the message)."),
            "403": err("The key lacks the scope, or the plan no longer includes the API."),
            "413": err("Body too large."),
            "429": err("Per-key or per-plan rate limit. See the Retry-After header."),
            "502": err("No model answered. Nothing is charged."),
            "503": err("Keplar is temporarily unavailable."),
          },
        },
      },
      "/api/v1/usage": {
        get: {
          operationId: "usage",
          summary: "Plan, credits and this key's counters",
          description: "Needs the `usage` scope. Spends nothing.",
          responses: { "200": { description: "Usage.", content: { "application/json": { schema: { $ref: "#/components/schemas/Usage" } } } }, "401": err("Invalid key."), "403": err("Missing scope.") },
        },
      },
      "/api/v1/openapi.json": { get: { operationId: "spec", summary: "This document", security: [], responses: { "200": { description: "OpenAPI 3.1 JSON." } } } },
    },
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "A key created in Account → Developer API. Shown once; stored only as a hash." } },
      schemas: {
        AskRequest: {
          type: "object",
          required: ["question"],
          properties: {
            question: { type: "string", maxLength: API_ASK_LIMITS.questionChars },
            image: { type: "object", required: ["data_url", "width", "height"], description: "Optional: one image the question is about (a screenshot, a photo, an area of a page). Answered only by models that can see; never stored.", properties: { data_url: { type: "string", maxLength: API_ASK_LIMITS.imageChars, description: "data:image/png, image/jpeg or image/webp, base64." }, width: { type: "integer", minimum: 1, maximum: 8192 }, height: { type: "integer", minimum: 1, maximum: 8192 } } },
            history: { type: "array", maxItems: API_ASK_LIMITS.historyTurns, description: "Earlier turns, for follow-ups. Stateless: you send them each time.", items: { type: "object", required: ["role", "content"], properties: { role: { enum: ["user", "assistant"] }, content: { type: "string", maxLength: API_ASK_LIMITS.historyTurnChars } } } },
            routing: { type: "object", properties: { strategy: { enum: ["auto", "fast", "balanced", "deep"] } } },
            stream: { type: "boolean", default: false },
            tools: {
              type: "array",
              maxItems: 6,
              description: "Built-in tools. A string or an object per tool. web_search and deep_research need retrieval switched on for this service; x_search needs the X connection; read_url reads up to 3 public links (counts toward the daily link reads). Each tool's outcome is reported in the answer's `tools`.",
              items: { oneOf: [{ enum: ["web_search", "deep_research", "reason", "debate", "read_url", "x_search"] }, { type: "object", required: ["type"], properties: { type: { enum: ["web_search", "deep_research", "reason", "debate", "read_url", "x_search"] }, urls: { type: "array", maxItems: 3, items: { type: "string", format: "uri" } }, query: { type: "string", maxLength: 256 } } }] },
            },
          },
        },
        Answer: {
          type: "object",
          required: ["object", "id", "answer", "agreement", "disagreement", "models", "sources", "usage", "created"],
          properties: {
            object: { const: "answer" },
            id: { type: "string" },
            answer: { type: "string", description: "Final answer, Markdown." },
            agreement: { type: "object", properties: { level: { type: "string" }, agree: { type: "integer" }, disagree: { type: "integer" }, responded: { type: "integer" }, consulted: { type: "integer" }, summary: { type: "string" } } },
            disagreement: {
              oneOf: [{ type: "null" }, { type: "object", properties: { headline: { type: "string" }, topic: { type: "string" }, tie: { type: "boolean" }, positions: { type: "array", items: { type: "object", properties: { stance: { type: "string" }, summary: { type: "string" }, models: { type: "array", items: { type: "string" } }, count: { type: "integer" }, of: { type: "integer" } } } }, agreed: { type: "array", items: { type: "string" } }, differ: { type: "array", items: { type: "string" } }, why: { type: "object", properties: { recorded: { type: "boolean" }, text: { type: "string" } } } } }],
              description: "null when there was nothing to compare.",
            },
            models: { type: "array", items: { type: "object", properties: { name: { type: "string" }, provider: { type: "string" }, status: { type: "string" } } } },
            sources: { type: "array", description: "As cited by the models; not checked unless `source_check` is present.", items: { type: "object", properties: { kind: { type: "string" }, title: { type: "string" }, url: { type: ["string", "null"] } } } },
            source_check: { type: ["object", "null"], description: "Present only when Keplar checked claims against retrieved pages." },
            usage: { type: "object", properties: { credits: { type: "number" } } },
            created: { type: "string", format: "date-time" },
            tools: { type: "array", description: "Present only when the request listed tools.", items: { type: "object", properties: { type: { type: "string" }, status: { enum: ["used", "requested", "unavailable", "failed"] }, detail: { type: "string" } } } },
          },
        },
        Usage: { type: "object", properties: { object: { const: "usage" }, plan: { type: "string" }, credits: { type: "object", properties: { used: { type: "number" }, total: { type: ["number", "null"] }, left: { type: ["number", "null"] }, resets_at: { type: "string" } } }, windows: { type: "array", items: { type: "object" } }, key: { type: "object" } } },
        Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string", enum: ["invalid_api_key", "insufficient_scope", "plan_required", "invalid_request", "too_large", "key_rate_limited", "rate_limited", "limit_reached", "no_response", "unavailable", "upstream_error", "forbidden", "internal"] }, message: { type: "string" }, retry_after: { type: "integer" } } } } },
      },
    },
  } as const;
}
