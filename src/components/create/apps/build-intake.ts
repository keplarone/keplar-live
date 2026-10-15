export const BUILD_TYPES = ["Website", "Web app", "Store", "Booking app", "Dashboard", "Community", "Game"] as const;
export const BUILD_AUDIENCES = ["Customers", "My team", "A community", "Just me"] as const;
export const BUILD_PRIORITIES = ["Core features", "Visual design", "A quick prototype"] as const;
export type BuildIntake = { type: string; audience: string; priority: string };
export const EMPTY_INTAKE: BuildIntake = { type: "", audience: "", priority: "" };

/** Only UI-owned choices enter the prompt. Blank choices keep an existing detailed brief intact. */
export function withBuildIntake(prompt: string, intake: BuildIntake, edit = false): string {
  if (edit) return prompt;
  const rows = [
    BUILD_TYPES.some((v) => v === intake.type) ? `Build type: ${intake.type}` : "",
    BUILD_AUDIENCES.some((v) => v === intake.audience) ? `Audience: ${intake.audience}` : "",
    BUILD_PRIORITIES.some((v) => v === intake.priority) ? `First priority: ${intake.priority}` : "",
  ].filter(Boolean);
  return rows.length ? `${prompt}\n\nMy selected brief:\n${rows.join("\n")}\nKeep all specific requirements in my description. A store needs real payment configuration before taking payments; do not simulate a successful payment.` : prompt;
}
