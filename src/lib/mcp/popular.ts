/**
 * Well-known PUBLIC remote MCP servers, listed so people don't have to hunt for the address. Each URL was checked on 2026-10-02
 * with a real `initialize` request (no-auth servers answered 200 with an MCP handshake; the two token servers answered 401
 * asking for a credential). Keplar does not operate, review or endorse them: tools start OFF and unclassified (= approval needed).
 * Linear, Notion and Sentry only offer OAuth sign-in. Their discovery documents (RFC 9728 / 8414, with dynamic client
 * registration and PKCE S256) were fetched and parsed on 2026-10-02, but a full sign-in with a real account has NOT been
 * tested, so they are listed as BETA. Asana and PayPal need a pre-registered app, which Keplar doesn't support, so they aren't listed.
 */
export type PopularConnector = { id: string; name: string; url: string; auth: "none" | "bearer" | "oauth"; what: string; tokenHint?: string };

export const POPULAR_CONNECTORS: PopularConnector[] = [
  { id: "context7", name: "Context7", url: "https://mcp.context7.com/mcp", auth: "none", what: "Up-to-date library documentation and code examples." },
  { id: "deepwiki", name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp", auth: "none", what: "Ask questions about public GitHub repositories." },
  { id: "ms-learn", name: "Microsoft Learn", url: "https://learn.microsoft.com/api/mcp", auth: "none", what: "Search Microsoft's official documentation." },
  { id: "cf-docs", name: "Cloudflare Docs", url: "https://docs.mcp.cloudflare.com/mcp", auth: "none", what: "Search Cloudflare's developer documentation." },
  { id: "hf", name: "Hugging Face", url: "https://huggingface.co/mcp", auth: "none", what: "Search models, datasets and Spaces on the Hub." },
  { id: "exa", name: "Exa", url: "https://mcp.exa.ai/mcp", auth: "none", what: "Web search built for AI." },
  { id: "linear", name: "Linear (BETA)", url: "https://mcp.linear.app/mcp", auth: "oauth", what: "Issues, projects and comments. Signs in with your Linear account (OAuth, BETA)." },
  { id: "notion", name: "Notion (BETA)", url: "https://mcp.notion.com/mcp", auth: "oauth", what: "Search and read your Notion pages. Signs in with your Notion account (OAuth, BETA)." },
  { id: "sentry", name: "Sentry (BETA)", url: "https://mcp.sentry.dev/mcp", auth: "oauth", what: "Errors and issues. Signs in with your Sentry account (OAuth, BETA)." },
  { id: "github", name: "GitHub", url: "https://api.githubcopilot.com/mcp/", auth: "bearer", what: "Repositories, issues and pull requests.", tokenHint: "A GitHub personal access token with only the scopes you need." },
  { id: "stripe", name: "Stripe", url: "https://mcp.stripe.com", auth: "bearer", what: "Stripe objects and docs.", tokenHint: "A Stripe restricted API key (rk_…). Use a read-only one first." },
];
