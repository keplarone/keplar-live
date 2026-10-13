/**
 * The roblox_docs tool, client-safe: Keplar's own read-only tool for Roblox Studio mode. The server offers it to the model next to
 * Studio's MCP tools (src/app/api/studio/agent/route.ts); the page answers it from /api/studio/docs instead of the desktop bridge
 * (useStudioAgent.ts). The search itself lives in src/lib/studio/roblox-docs.ts (server only).
 */
export const ROBLOX_DOCS_TOOL_NAME = "roblox_docs";

export const ROBLOX_DOCS_MAX_RESULTS = 8;

export const ROBLOX_DOCS_TOOL = {
  name: ROBLOX_DOCS_TOOL_NAME,
  description:
    "Search the official Roblox Creator Docs and Engine API reference (create.roblox.com/docs, mirrored by Keplar). Use it before relying on any class, property, method, event, enum or Studio feature you are not certain of, to get exact signatures and to check whether something is deprecated. Query with API names (\"TweenService:Create\", \"ScreenGui.ScreenInsets\") or plain words (\"flipbook particle layout\"). Returns the best matching sections with their links. Free and fast: prefer it to guessing.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "API names or plain words to look up." },
      limit: { type: "integer", minimum: 1, maximum: ROBLOX_DOCS_MAX_RESULTS, description: `How many sections to return (default 5, at most ${ROBLOX_DOCS_MAX_RESULTS}).` },
    },
    required: ["query"],
    additionalProperties: false,
  },
} as const;
