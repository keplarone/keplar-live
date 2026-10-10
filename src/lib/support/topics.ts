/** Support ticket topics (client-safe). */
export const TICKET_TOPICS = ["account", "billing", "bug", "connectors", "safety", "privacy", "other"] as const;
export type TicketTopic = (typeof TICKET_TOPICS)[number];
export const TICKET_TOPIC_LABEL: Record<TicketTopic, string> = { account: "My account or sign-in", billing: "Billing or plans", bug: "Something is broken", connectors: "Connected apps", safety: "Safety or abuse", privacy: "Privacy or my data", other: "Something else" };

