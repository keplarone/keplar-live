import { errorResponse, json } from "@/lib/create/platform/http";
import { DEFAULT_SOLAR_MODE, SOLAR_TECHNICAL_DETAILS } from "@/lib/studio/solar-modes";
import { RESERVE_INPUT_TOKENS, solarModeTable } from "@/lib/studio/solar-modes-server";

export const runtime = "nodejs";

/**
 * The Solar mode table for Roblox Studio and Blender, priced with the same numbers a turn is charged with
 * (src/lib/studio/solar-modes-server.ts). Public: it holds no account data, only budgets, prices and the provider disclosure.
 * `outputCreditsMax` is a hard ceiling for what the model generates in one step; input depends on the conversation and is not
 * included. A surface whose price is not known right now is `null`, never a guess.
 */
export async function GET() {
  try {
    const at = new Date().toISOString();
    const [studio, blender] = await Promise.all([solarModeTable("studio", at), solarModeTable("blender", at)]);
    return json(
      { defaultMode: DEFAULT_SOLAR_MODE, pricedAt: at, reserveInputTokens: RESERVE_INPUT_TOKENS, modes: { studio, blender }, technical: SOLAR_TECHNICAL_DETAILS },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
