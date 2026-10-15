import { authorizationMetadata } from "@/lib/chatgpt/config";
export function GET() { return Response.json(authorizationMetadata(), { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } }); }
