/** Settings sections (the Settings popover), kept apart so the workspace can open one without loading the popover. */
export type SettingsSection = "general" | "ai" | "editor" | "agents" | "connections" | "security" | "computer" | "billing" | "team";
export const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "general", label: "General" },
  { id: "ai", label: "AI" },
  { id: "editor", label: "Editor" },
  { id: "agents", label: "Agents" },
  { id: "connections", label: "Connections" },
  { id: "security", label: "Security" },
  { id: "computer", label: "Computer" },
  { id: "billing", label: "Billing" },
  { id: "team", label: "Team" },
];
export const isSettingsSection = (v: unknown): v is SettingsSection => SETTINGS_SECTIONS.some((x) => x.id === v);

/** Links saved before the popover (?v=settings&s=plan …) still open the section that took that content over. */
const LEGACY: Record<string, SettingsSection> = { plan: "billing", preferences: "editor", privacy: "security", desktop: "computer" };
export const settingsSectionFrom = (v: string | null): SettingsSection => (isSettingsSection(v) ? v : (v && LEGACY[v]) || "general");

/** Device preferences (localStorage) shared by the workspace and the Settings popover. */
export const SIDE_KEY = "keplar-biz-side";
export const MODE_KEY = "keplar-biz-mode";
