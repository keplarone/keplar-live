export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { mcpPost as POST } from "@/lib/chatgpt/mcp-http";
export function GET() { return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", "cache-control": "no-store" } }); }
export function OPTIONS() { return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id", "cache-control": "no-store" } }); }
