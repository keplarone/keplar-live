import type { Thread, UserMessage, KeplarMessage } from "./state/types";

/** A whole chat as Markdown: your questions, Keplar's answers, and for each answer how many models agreed. Nothing leaves the browser. */
export function threadToMarkdown(thread: Thread, now = new Date()): string {
  const out: string[] = [`# ${thread.title || "Keplar chat"}`, "", `Exported from Keplar on ${now.toISOString().slice(0, 10)}.`, ""];
  for (const m of thread.messages) {
    if (m.role === "user") {
      const u = m as UserMessage;
      out.push(`## You`, "", u.text, "");
      if (u.attachments.length) out.push(`_Attached: ${u.attachments.map((a) => a.name).join(", ")}_`, "");
      continue;
    }
    const k = m as KeplarMessage;
    const body = k.answer?.markdown ?? (k.status === "error" ? "" : k.draft);
    if (!body) continue;
    out.push(`## Keplar`, "", body.trim(), "");
    const c = k.answer?.consensus;
    if (c && c.level !== "single" && c.level !== "unscored") out.push(`_${c.agree} of ${c.agree + c.disagree} models agreed._`, "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export const exportFileName = (thread: Thread) =>
  `${(thread.title || "keplar-chat").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "keplar-chat"}.md`;

export function downloadText(name: string, text: string, type = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
