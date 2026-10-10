/**
 * Business (with Agents and Approvals, which are business-mode only) is moving to its own site. Until that version is built here,
 * every way into it (sidebar, search, links, the old /app/business, /app/agents, /app/approvals, /enterprise and /agents URLs)
 * goes to the business.keplar.one landing page.
 */
export const BUSINESS_URL = "https://business.keplar.one";
export const BUSINESS_VIEWS = new Set(["business", "agents", "approvals"]);
