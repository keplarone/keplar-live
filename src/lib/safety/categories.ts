/** Report categories (client-safe: no server imports). */
export const REPORT_CATEGORIES = ["harmful", "wrong", "sexual", "hateful", "private", "other"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export const REPORT_LABEL: Record<ReportCategory, string> = { harmful: "Harmful or dangerous", wrong: "Wrong or misleading", sexual: "Sexual or inappropriate", hateful: "Hateful or harassing", private: "Reveals private information", other: "Something else" };

