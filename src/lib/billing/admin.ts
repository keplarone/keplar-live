/** Admin accounts: unlimited use, with a daily USD safety cap (spend.ts). */
export const adminEmails = (): string[] =>
  (process.env.KEPLAR_ADMIN_EMAILS || "team@keplar.one")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const isAdminEmail = (email: string | null | undefined): boolean => Boolean(email) && adminEmails().includes(String(email).trim().toLowerCase());

/** Daily provider-spend cap for admin accounts, in USD. */
export const adminDailyCapUsd = (): number => {
  const n = Number(process.env.KEPLAR_ADMIN_DAILY_USD_CAP ?? 25);
  return Number.isFinite(n) && n > 0 ? n : 25;
};
