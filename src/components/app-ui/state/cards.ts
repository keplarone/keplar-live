/**
 * The cards in a thread, as the chat's intent router sees them: which card a follow-up acts on ("make slide 3 shorter" -> the
 * latest deck), what an earlier question was ("turn this into slides"), and the one line each card adds to the model's history.
 * Pure (no React), so it is unit-tested.
 */
import type { LastCard } from "@/lib/chat-actions/intent";
import type { KeplarMessage, Message, UserMessage } from "./types";

/** The most recent card in the thread a follow-up can act on. Plain answers in between don't hide it. */
export function lastCardOf(messages: Message[]): LastCard | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "keplar") continue;
    if (m.studio?.kind === "slides" && m.studio.id && (m.studio.phase === "ready" || m.studio.phase === "working")) return { kind: "slides", deckId: m.studio.id, ...(m.studio.count ? { count: m.studio.count } : {}) };
    if (m.studio?.kind === "study" && m.studio.id && m.studio.phase === "ready") return { kind: "study", setId: m.studio.id };
    if (m.create?.appId && (m.create.phase === "ready" || m.create.phase === "working" || m.create.phase === "confirm")) return { kind: "create", appId: m.create.appId, ...(m.create.name ? { name: m.create.name } : {}) };
    if (m.workspace && m.workspace.kind !== "choose") return { kind: "workspace", card: m.workspace.kind };
  }
  return null;
}

/** The latest plain question asked before (for "turn this into slides" / "quiz me on this"). */
export function previousQuestion(messages: Message[]): UserMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "keplar" || !m.answer) continue;
    const u = messages.find((x): x is UserMessage => x.role === "user" && x.id === m.replyTo);
    if (u) return u;
  }
  return null;
}

/** The latest Keplar answer with text (what "quiz me on this" studies). */
export function previousAnswer(messages: Message[]): KeplarMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "keplar" && m.status === "done" && m.answer?.markdown) return m;
  }
  return null;
}

const WORKSPACE_LINE: Record<string, string> = {
  apps: "your apps", approvals: "your pending approvals", crm: "your CRM contacts and deals", leads: "your leads", dashboard: "your business dashboard numbers", orders: "your orders",
  agents: "your agents", projects: "your projects", deployments: "your deployments", history: "your past chats",
};

/** One line of model history for a card turn (cards have no panel answer), or null. */
export function cardHistoryLine(m: KeplarMessage): string | null {
  if (m.workspace && m.workspace.kind !== "choose") return `[Keplar showed ${WORKSPACE_LINE[m.workspace.kind]} here${m.workspace.acted ? `: ${m.workspace.acted.text.slice(0, 160)}` : ""}]`;
  if (m.studio?.kind === "slides" && m.studio.phase === "ready") {
    if (m.studio.op?.type === "slide") return `[Keplar rewrote slide ${m.studio.op.index + 1} of the deck "${(m.studio.title ?? "").slice(0, 120)}"]`;
    if (m.studio.op?.type === "theme") return `[Keplar switched the deck to the ${m.studio.op.theme} theme]`;
    if (m.studio.op?.type === "move") return `[Keplar moved slide ${m.studio.op.from + 1} to position ${m.studio.op.to + 1} in the deck "${(m.studio.title ?? "").slice(0, 120)}"]`;
    if (m.studio.op?.type === "delete") return m.studio.opDone === "done" ? `[Keplar deleted slide ${m.studio.op.index + 1} from the deck "${(m.studio.title ?? "").slice(0, 120)}"]` : `[Keplar offered to delete slide ${m.studio.op.index + 1}; it was not deleted]`;
    return `[Keplar made a ${m.studio.count ?? ""}-slide deck here: ${(m.studio.title ?? "").slice(0, 200)}]`;
  }
  if (m.studio?.kind === "study" && m.studio.standalone && m.studio.phase === "ready") {
    const st = m.studio;
    if (st.examDate !== undefined && st.opDone === "done") return st.examDate ? `[Keplar set the exam date to ${st.examDate} and showed the day-by-day study plan here]` : "[Keplar cleared the exam date on the study set]";
    return `[Keplar showed the study set ${st.focus === "quiz" ? "quiz" : st.focus === "cards" ? "flashcards" : st.focus === "plan" ? "study plan" : st.focus === "placement" ? "placement quiz" : "overview"} here]`;
  }
  if (m.create?.op && m.create.phase === "ready") {
    const op = m.create.op;
    if (op.type === "domain") return `[Keplar showed the domains of the app ${m.create.name ?? ""}${op.hostname ? `, ready to connect ${op.hostname}` : ""}]`;
    return `[Keplar ${op.type === "edit" ? `changed the app ${m.create.name ?? ""}: ${op.instruction.slice(0, 160)}` : op.type === "theme" ? `restyled the app ${m.create.name ?? ""}` : `${m.create.opDone === "done" ? (op.type === "publish" ? "published" : "unpublished") : "offered to " + op.type} the app ${m.create.name ?? ""}`}]`;
  }
  if (m.create?.phase === "ready") return `[Keplar built an app here: ${(m.create.name ?? "").slice(0, 200)}]`;
  return null;
}
