/** Report ranges. Plain data with no server imports, so client components (the admin Traffic & revenue card) can use it. */
export const RANGES = ["today", "d7", "d30", "all"] as const;
export type RangeId = (typeof RANGES)[number];
export const RANGE_LABEL: Record<RangeId, string> = { today: "Today", d7: "7 days", d30: "30 days", all: "All time" };
