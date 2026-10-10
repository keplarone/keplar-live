/** Window events the UI emits for the spatial layer. Payloads carry only layout geometry and counts, never prompt text. */
export const SEND_EVENT = "keplar:send";
export type SendDetail = { rect: { x: number; y: number; w: number; h: number }; chars: number };
