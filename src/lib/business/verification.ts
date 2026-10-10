/**
 * Which connectors have been verified end-to-end with a REAL provider account. The UI labels everything else honestly.
 * Flip an entry to true only after someone has completed the real sign-in and a real read/write against the live provider,
 * and record the date in `verifiedOn`. Mocked tests (tests/connectors-*.test.ts, tests/mcp-*.test.ts) never count.
 */
export const LIVE_VERIFIED: Record<string, { verified: boolean; verifiedOn?: string }> = {
  // src/lib/business/connectors.ts CONNECTORS
  gmail: { verified: false },
  outlook: { verified: false },
  gcal: { verified: false },
  stripe: { verified: false },
  social: { verified: false },
  slack: { verified: false },
  github: { verified: false },
  sheets: { verified: false }, // built-in tables in our own database; still not exercised through the live UI by a person
  // Connected apps (MCP) and bank links
  notion: { verified: false },
  linear: { verified: false },
  plaid: { verified: false },
  "stripe-fc": { verified: false },
  mcp: { verified: false },
};

export const isLiveVerified = (id: string): boolean => LIVE_VERIFIED[id]?.verified === true;

export const UNVERIFIED_LABEL = "Not verified with live accounts";
export const UNVERIFIED_NOTE =
  "Connected apps are in beta. They are tested here with simulated provider responses, but have not yet been verified end-to-end with real accounts. If a connection or an action fails, Keplar says so and does nothing else. Anything that writes or sends something outside Keplar waits for your approval.";
