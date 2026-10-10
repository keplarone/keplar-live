/** Where to send someone who still owes a second-factor code. Not under /signin on purpose: the auth redirect sanitizer refuses /signin* targets. */
export const twoFactorPath = (next: string) => `/two-factor?next=${encodeURIComponent(next)}`;
