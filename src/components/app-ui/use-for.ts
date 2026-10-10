/**
 * "What will you use Keplar for?" — a light, first-visit preference that
 * tailors /app's example prompts and how prominent the Business tab is.
 * No database: stored in localStorage only. Default: personal.
 */
export type UseFor = "personal" | "business" | "both";

export const USE_FOR_KEY = "keplar:use-for";

export const useForOptions: { id: UseFor; label: string; hint: string }[] = [
  { id: "personal", label: "Personal", hint: "Study, health, money, travel, writing, projects" },
  { id: "business", label: "Business", hint: "Research, customers, sales, and operations" },
  { id: "both", label: "Both", hint: "A bit of everything" },
];

export const isUseFor = (v: unknown): v is UseFor => v === "personal" || v === "business" || v === "both";

/** null = not chosen yet (show the question). */
export function readUseFor(): UseFor | null {
  try {
    const v = window.localStorage.getItem(USE_FOR_KEY);
    return isUseFor(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeUseFor(v: UseFor) {
  try {
    window.localStorage.setItem(USE_FOR_KEY, v);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

export type ExamplePrompt = { label: string; hint: string };

export const personalPrompts: ExamplePrompt[] = [
  { label: "Explain how photosynthesis works, like I'm studying for a biology test.", hint: "Study" },
  { label: "What should I ask my doctor about a new blood pressure prescription?", hint: "Health · not medical advice" },
  { label: "Should I lease or buy my next car?", hint: "Money · big purchase" },
  { label: "Plan five days in Lisbon on a mid-range budget.", hint: "Travel" },
  { label: "Do we really only use 10% of our brains?", hint: "Fact-check" },
  { label: "Help me write a firm but friendly note to my landlord about a repair.", hint: "Writing" },
];

export const businessPrompts: ExamplePrompt[] = [
  { label: "Should our company expand into Japan next year?", hint: "Strategy · several models" },
  { label: "Compare Postgres, DynamoDB and MongoDB for a multi-tenant SaaS.", hint: "Analysis · table" },
  { label: "Draft a clear refund policy for my online store.", hint: "Operations · writing" },
  { label: "Will remote work still be the default for tech companies in 2030?", hint: "Forecast · contested" },
  { label: "Write a debounce hook in TypeScript.", hint: "Code" },
];

export function examplesFor(useFor: UseFor | null): ExamplePrompt[] {
  if (useFor === "business") return businessPrompts;
  if (useFor === "both") return [personalPrompts[0], businessPrompts[0], personalPrompts[1], businessPrompts[2], personalPrompts[2], businessPrompts[1]];
  return personalPrompts;
}

/** Business tab near the top for business/both; tucked at the bottom for personal. */
export const businessProminent = (useFor: UseFor | null) => useFor === "business" || useFor === "both";
