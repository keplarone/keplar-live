/**
 * English copy for the cookie banner and the "Cookie settings" button (src/components/consent). The source every other locale
 * translates. Keep "Keplar" and "Vercel" as they are. The banner is on every page, so each locale is its own small chunk
 * (loaders/consent.ts) instead of part of the larger common catalog.
 */
const en = {
  title: "Cookies",
  text: "Keplar always uses the cookies it needs to work: sign-in, security, your plan and usage counts, and your theme. Optional page-view and speed analytics stay off unless you allow them. Keplar also counts visits and who is online now on its own server without cookies or storing your IP address.",
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
