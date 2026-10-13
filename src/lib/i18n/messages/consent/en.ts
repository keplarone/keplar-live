/**
 * English copy for the cookie banner and the "Cookie settings" button (src/components/consent). The source every other locale
 * translates. Keep "Keplar" and "Vercel" as they are. The banner is on every page, so each locale is its own small chunk
 * (loaders/consent.ts) instead of part of the larger common catalog.
 */
const en = {
  title: "Cookies",
  // One decision, said plainly; the cookie-free visit counting and the full cookie list live behind Details (/privacy#cookies).
  text: "Keplar uses the cookies it needs to work, like sign-in and your theme. Analytics stay off unless you allow them.",
  details: "Details",
  categories: "Cookie categories",
  essential: "Essential",
  essentialDesc: "Always on. Sign-in session, security, plan and usage counters, theme, and this choice.",
  analytics: "Analytics",
  analyticsDesc: "Page views, button clicks and page speed on the public site (Vercel), plus which page a visit started on and whether it led to a sign-up or answer. Never your questions. No ads, no cross-site tracking.",
  save: "Save choices",
  acceptAll: "Accept all",
  reject: "Reject non-essential",
  customize: "Customize",
  saved: "Cookie choices saved.",
  accepted: "All cookies accepted.",
  rejected: "Only essential cookies in use.",
  settings: "Cookie settings",
};

export default en;
