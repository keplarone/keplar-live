// Synced from keplarone/space-studio src/core — edit there, then copy.
/**
 * Model routing. An explicit choice is always honored: routing only SUGGESTS escalation, and only when the person allowed it
 * does the server switch, recording which configuration actually answered. The plan check happens before any call.
 */
import { modelById, type ModelId, type ModelProfile } from "./models";

const HARD = /\b(architect|architecture|refactor (the|our|my) (whole|entire)|multiplayer|replicat|anti[- ]?cheat|exploit|datastore|memory leak|performance|optimi[sz]e|race condition|rig(ging)?|geometry nodes|multi[- ]file|entire (game|project)|system design)\b/i;

export function complexityScore(text: string): number {
  let s = 0;
  if (text.length > 1_500) s += 1;
  if (text.length > 6_000) s += 1;
  if (HARD.test(text)) s += 1;
  if ((text.match(/```/g)?.length ?? 0) >= 4) s += 1;
  return s;
}

export type Route = { served: ModelProfile; requested: ModelProfile; escalated: boolean; suggestion: { to: ModelId; reason: string } | null };

export function route(requestedId: ModelId, lastUserText: string, opts: { allowEscalation: boolean; allowed: (id: ModelId) => boolean }): Route {
  const requested = modelById(requestedId);
  if (!requested) throw new Error("unknown model");
  const score = complexityScore(lastUserText);
  const target = requested.escalateTo ? modelById(requested.escalateTo) : null;
  const wants = !!target && ((requested.id === "orbit" && score >= 1) || (requested.id === "nebula" && score >= 2) || (requested.id === "solar" && score >= 3));
  if (!wants || !target) return { served: requested, requested, escalated: false, suggestion: null };
  const reason = `${target.name} handles this kind of task more reliably.`;
  if (opts.allowEscalation && opts.allowed(target.id)) return { served: target, requested, escalated: true, suggestion: null };
  return { served: requested, requested, escalated: false, suggestion: { to: target.id, reason } };
}

/** Orbit and Nebula may flag escalation in their reply ("ESCALATE: reason"); strip it from the text and surface it. */
export function extractEscalation(text: string): { text: string; reason: string | null } {
  const m = text.match(/^\s*ESCALATE:\s*(.+)$/m);
  if (!m) return { text, reason: null };
  return { text: text.replace(m[0], "").trim(), reason: m[1]!.trim().slice(0, 300) };
}
