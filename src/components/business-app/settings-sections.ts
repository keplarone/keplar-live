/** Settings sections (Settings.tsx), kept apart so the workspace can route to them without loading the settings page. */
export type SettingsSection = "general" | "plan" | "preferences" | "security" | "privacy" | "desktop";
export const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "general", label: "General" },
  { id: "plan", label: "Plan & usage" },
  { id: "preferences", label: "Preferences" },
  { id: "security", label: "Security" },
  { id: "privacy", label: "Privacy & data" },
  { id: "desktop", label: "Desktop app" },
];
export const isSettingsSection = (v: unknown): v is SettingsSection => SETTINGS_SECTIONS.some((x) => x.id === v);
