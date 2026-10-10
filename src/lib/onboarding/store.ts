/**
 * Onboarding state in Neon: columns on keplar_users (added idempotently by ensureAuthSchema in ../accounts/persist.ts).
 *
 *   onboarding_required     true only for accounts created after this shipped (and after "Replay"). Existing rows get
 *                           false from the column default, so nobody who already has an account is pushed through it.
 *   onboarding_step         0..4, saved on every change so a refresh resumes
 *   onboarding_started_at   first time the flow was shown
 *   onboarding_completed_at / onboarding_skipped_at
 *   onboarding_answers      JSON: uses, role, name, theme, insertKey, memory
 *   onboarding_progress     JSON: checklist facts that are not derivable from data (viewedPlan, triedCreate, dismissals)
 *
 * No DATABASE_URL: nothing is stored, `enabled` is false and nobody is sent to the flow.
 */
import { neonConfigured } from "@/lib/create/platform/neon";
import { ensureAuthSchema } from "@/lib/accounts/persist";
import { neonQuery } from "@/lib/create/platform/neon";
import { readAnswers, readProgress, statusOf, type Answers, type OnboardingState, type ProgressKey } from "./model";

export const onboardingEnabled = () => neonConfigured();

const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
const bool = (v: unknown) => v === true || v === "t" || v === "true";

const COLS = "onboarding_required, onboarding_step, onboarding_started_at, onboarding_completed_at, onboarding_skipped_at, onboarding_answers, onboarding_progress";

const q = async (sql: string, params: unknown[] = []) => {
  await ensureAuthSchema();
  return neonQuery(sql, params);
};

const disabled = (): OnboardingState => ({ enabled: false, required: false, status: "legacy", step: 0, answers: {}, progress: {}, startedAt: null, completedAt: null, skippedAt: null });

function toState(r: Record<string, unknown> | undefined): OnboardingState {
  if (!r) return disabled();
  const row = {
    required: bool(r.onboarding_required),
    step: Math.max(0, Math.min(4, Number(r.onboarding_step) || 0)),
    startedAt: iso(r.onboarding_started_at),
    completedAt: iso(r.onboarding_completed_at),
    skippedAt: iso(r.onboarding_skipped_at),
  };
  return { enabled: true, ...row, status: statusOf(row), answers: readAnswers(r.onboarding_answers), progress: readProgress(r.onboarding_progress) };
}

/** The saved state, or a disabled one when there is no database or the user row can't be read (never throws). */
export async function getOnboarding(userId: string): Promise<OnboardingState> {
  if (!onboardingEnabled()) return disabled();
  try {
    const rows = await q(`SELECT ${COLS} FROM keplar_users WHERE id = $1`, [userId]);
    return toState(rows[0]);
  } catch {
    return disabled();
  }
}

/** Same lookup by verified email (used right after a sign-in, before the session exists). */
export async function onboardingForEmail(email: string): Promise<OnboardingState> {
  if (!onboardingEnabled()) return disabled();
  try {
    const rows = await q(`SELECT ${COLS} FROM keplar_users WHERE email = $1`, [email.trim().toLowerCase()]);
    return toState(rows[0]);
  } catch {
    return disabled();
  }
}

/** Save the step and merge answers in one statement; marks the flow as started. Does nothing once finished or skipped. */
export async function saveProgress(userId: string, patch: { step?: number; answers?: Answers }): Promise<OnboardingState> {
  const rows = await q(
    `UPDATE keplar_users SET
       onboarding_step = COALESCE($2::int, onboarding_step),
       onboarding_answers = onboarding_answers || $3::jsonb,
       onboarding_started_at = COALESCE(onboarding_started_at, now())
     WHERE id = $1 AND onboarding_completed_at IS NULL AND onboarding_skipped_at IS NULL
     RETURNING ${COLS}`,
    [userId, patch.step ?? null, JSON.stringify(patch.answers ?? {})],
  );
  return rows[0] ? toState(rows[0]) : getOnboarding(userId);
}

/** Answers can also be changed after the flow (Settings, the "Personalize" link): merge only. */
export async function mergeAnswers(userId: string, answers: Answers): Promise<OnboardingState> {
  const rows = await q(`UPDATE keplar_users SET onboarding_answers = onboarding_answers || $2::jsonb WHERE id = $1 RETURNING ${COLS}`, [userId, JSON.stringify(answers)]);
  return rows[0] ? toState(rows[0]) : getOnboarding(userId);
}

export async function finish(userId: string, how: "completed" | "skipped"): Promise<OnboardingState> {
  const col = how === "completed" ? "onboarding_completed_at" : "onboarding_skipped_at";
  const rows = await q(
    `UPDATE keplar_users SET ${col} = COALESCE(${col}, now()), onboarding_started_at = COALESCE(onboarding_started_at, now()),
       onboarding_step = CASE WHEN $2 = 'completed' THEN 4 ELSE onboarding_step END
     WHERE id = $1 RETURNING ${COLS}`,
    [userId, how],
  );
  return rows[0] ? toState(rows[0]) : getOnboarding(userId);
}

/** Start again from Settings: step 0, finished/skipped cleared, earlier answers kept as the starting point. */
export async function replay(userId: string): Promise<OnboardingState> {
  const rows = await q(
    `UPDATE keplar_users SET onboarding_required = true, onboarding_step = 0, onboarding_started_at = NULL, onboarding_completed_at = NULL, onboarding_skipped_at = NULL
     WHERE id = $1 RETURNING ${COLS}`,
    [userId],
  );
  return rows[0] ? toState(rows[0]) : getOnboarding(userId);
}

/** Record a real action (opened the plan page, tried Create, hid the checklist). Keeps the first timestamp. */
export async function markProgress(userId: string, key: ProgressKey): Promise<OnboardingState> {
  const rows = await q(
    `UPDATE keplar_users SET onboarding_progress = jsonb_build_object($2::text, COALESCE(onboarding_progress ->> $2::text, $3::text)) || onboarding_progress
     WHERE id = $1 RETURNING ${COLS}`,
    [userId, key, new Date().toISOString()],
  );
  return rows[0] ? toState(rows[0]) : getOnboarding(userId);
}

/** The display name chosen in step 3 also becomes the account name. */
export async function setAccountName(userId: string, name: string) {
  await q("UPDATE keplar_users SET name = $2 WHERE id = $1", [userId, name.slice(0, 100)]);
}
