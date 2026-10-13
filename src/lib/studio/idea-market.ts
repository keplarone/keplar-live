/**
 * Market signals behind Studio's game idea generator (src/lib/studio/ideas.ts, /api/studio/ideas, IdeasPanel.tsx). Client-safe.
 *
 * Every number and claim here comes from the source page it names, as read on MARKET_AS_OF. The model is given these signals and
 * may only point at them by id; the page shows the words from here, never figures written by the model. Refresh the list
 * (and MARKET_AS_OF) when the sources update: trends on Roblox move in weeks.
 */
export const MARKET_AS_OF = "2026-10-13";

export const MARKET_SOURCES = {
  genres: { name: "creation.dev: trending Roblox game genres 2026", url: "https://www.creation.dev/learn/trending-roblox-game-genres-2026" },
  mechanics: { name: "creation.dev: trending Roblox game mechanics 2026", url: "https://www.creation.dev/learn/what-roblox-game-mechanics-are-trending-2026" },
} as const;

export type SignalKind = "gap" | "trend" | "risk";

export type MarketSignal = {
  id: string;
  kind: SignalKind;
  /** What the signal is about, as the page shows it. */
  label: string;
  /** The evidence, short, from the source. */
  stat: string;
  /** One line of context for the model and the page. */
  note: string;
  source: keyof typeof MARKET_SOURCES;
};

export const MARKET_SIGNALS: readonly MarketSignal[] = [
  { id: "gap-horror-escape", kind: "gap", label: "Horror escape", stat: "~78K concurrent players across only 5 games", note: "High demand and low supply.", source: "genres" },
  { id: "gap-brainrot-fighting", kind: "gap", label: "Brainrot and fighting hybrids", stat: "Few strong competitors", note: "Brainrot leads all genres at ~1.4M concurrent players across 29 games; fighting hybrids are flagged as high-upside.", source: "genres" },
  { id: "gap-city-rp-systems", kind: "gap", label: "City roleplay with real systems", stat: "Town and city roleplay: +65% growth, 34% saturation", note: "Crime systems, school social hierarchies and disaster survival are underserved angles.", source: "genres" },
  { id: "gap-horror-td", kind: "gap", label: "Horror tower defense", stat: "An undersaturated subgenre", note: "Tower defense draws ~59K concurrent players; the horror blend is named as undersaturated.", source: "genres" },
  { id: "gap-dress-up-competition", kind: "gap", label: "Dress-up competitions", stat: "An undersaturated subgenre", note: "Dress To Impress draws ~77K concurrent players; competitions are named as undersaturated.", source: "genres" },
  { id: "gap-coop-obby", kind: "gap", label: "Co-op obstacle courses", stat: "A fresh angle on escape and obby games", note: "Escape games draw ~764K concurrent players across 15 games; cooperative courses are named as a fresh angle.", source: "genres" },
  { id: "gap-story-escape", kind: "gap", label: "Story-driven escape rooms", stat: "A fresh angle on escape games", note: "Named as a fresh angle for escape and obby games.", source: "genres" },
  { id: "trend-cozy-loop", kind: "trend", label: "Five-minute cozy loops", stat: "Grow a Garden reached ~10M concurrent players", note: "Short, AFK-friendly daily loops that fit into about five minutes.", source: "mechanics" },
  { id: "trend-income-raid", kind: "trend", label: "Fast income with raiding", stat: "Steal a Brainrot's model: generators plus raids", note: "Automated income that never stalls, plus raiding other players' bases.", source: "mechanics" },
  { id: "trend-mobile-rounds", kind: "trend", label: "Mobile-first short rounds", stat: "Rounds of about 3 to 5 minutes (Parkour Champions)", note: "Compact maps, touch-friendly controls, a complete loop per session.", source: "mechanics" },
  { id: "trend-narrative-horror", kind: "trend", label: "Narrative horror", stat: "Multi-chapter stories (The Mimic)", note: "Earned scares and a story, not cheap jump scares.", source: "mechanics" },
  { id: "trend-competitive-onramp", kind: "trend", label: "Competitive with a gentle on-ramp", stat: "RIVALS: ~274K concurrent players", note: "Matchmaking that protects newcomers while keeping a high skill ceiling.", source: "mechanics" },
  { id: "risk-scifi-military", kind: "risk", label: "Sci-fi and military themes", stat: "About one game each, yet among the least-visited themes", note: "Open space, but medieval, western, naval and sci-fi themes draw the fewest visits.", source: "genres" },
];

const BY_ID = new Map(MARKET_SIGNALS.map((s) => [s.id, s]));
export const marketSignal = (id: string): MarketSignal | undefined => BY_ID.get(id);
export const MARKET_SIGNAL_IDS: readonly string[] = MARKET_SIGNALS.map((s) => s.id);

export type IdeaScope = "weekend" | "full";
export const IDEA_SCOPES: readonly { value: IdeaScope; label: string }[] = [
  { value: "weekend", label: "Weekend build" },
  { value: "full", label: "Full game" },
];

/** Limits shared by the page and the server. */
export const IDEA_LIMITS = { briefChars: 300, count: 3, signalsPerIdea: 2 } as const;

/** One idea as the server returns it (checked by parseIdeas in ideas.ts). */
export type GameIdea = {
  title: string;
  hook: string;
  /** Ids from MARKET_SIGNALS, known ones only. */
  signals: string[];
  coreLoop: string;
  twist: string;
  session: string;
  monetization: string;
  firstBuild: string;
};

/** The text "Build this" puts in the composer: the person reads it, edits it if they like, then presses Build. */
export function ideaBuildPrompt(idea: GameIdea): string {
  return [
    `Build the first playable version of "${idea.title}": ${idea.hook}`,
    `Core loop: ${idea.coreLoop}`,
    `Twist: ${idea.twist}`,
    `Start with: ${idea.firstBuild}`,
  ].join("\n");
}
