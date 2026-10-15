import { resourceMetadata } from "@/lib/chatgpt/config";
export function GET() { return Response.json(resourceMetadata(), { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } }); }
