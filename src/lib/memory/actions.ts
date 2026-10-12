/** Runs a memory command from chat and returns the plain-text confirmation. Deterministic; no model; zero cost. */
import type { Workspace } from "@/lib/create/platform/workspace";
import { cleanFact, kindOfNote } from "./facts";
import type { MemoryIntent } from "./intent";
import { eraseAllDigests } from "./digest";
import { deleteAllChats } from "./delete-chat";
import { eraseAllProjectNotes } from "@/lib/projects/repo";
import { addItems, eraseAllMemory, deleteItem, lastAdded, listItems, memoryEnabled, setMemoryEnabled } from "./repo";

export const SIGNED_OUT_REPLY = "Memory only works when you're signed in, so I haven't saved or deleted anything. Signed-out chats aren't remembered after you leave. Sign in and I can remember your name, goals and preferences across chats, and you can delete any of it at any time.";

export async function runMemoryIntent(ws: Pick<Workspace, "id" | "anonymous">, intent: MemoryIntent): Promise<string> {
  if (ws.anonymous) return SIGNED_OUT_REPLY;
  switch (intent.kind) {
    case "forget-last": {
      const last = await lastAdded(ws.id);
      if (!last.length) return "There's nothing recent in my memory to forget. If you want something specific gone, open Account → Memory, or say \"erase my memory\" to delete everything.";
      for (const i of last) await deleteItem(ws.id, i.id);
      return last.length === 1 ? `Done. I've deleted this from my memory: "${last[0].text}"` : `Done. I've deleted these ${last.length} things from my memory:\n${last.map((i) => `- ${i.text}`).join("\n")}`;
    }
    case "erase-all": {
      const n = await eraseAllMemory(ws.id);
      const summaries = await eraseAllDigests(ws.id); // saved summaries of past chats are memory too
      await eraseAllProjectNotes(ws.id); // and so are the notes saved inside projects
      const c = intent.chats ? await deleteAllChats(ws.id) : 0;
      const mem = n || summaries ? `I've permanently deleted everything I had remembered about you (${n} ${n === 1 ? "item" : "items"}${summaries ? `, plus the saved summaries of ${summaries} past ${summaries === 1 ? "chat" : "chats"}` : ""}).` : "I wasn't remembering anything about you, so there was nothing to delete.";
      return intent.chats ? `${mem} I also deleted your saved chat history (${c} ${c === 1 ? "chat" : "chats"}) from our servers. Chats stored in this browser can be removed from History.` : `${mem} Your saved chats weren't touched. To delete them too, say "erase my memory and chat history", or use Account → Memory.`;
    }
    case "toggle": {
      await setMemoryEnabled(ws.id, intent.enabled);
      return intent.enabled ? "Memory is on. I'll remember durable things you tell me, like your name, goals and preferences. You can see and delete them in Account → Memory." : "Memory is off. I won't save anything new and I won't use anything I saved before. Your existing items are still stored until you delete them in Account → Memory, or say \"erase my memory\".";
    }
    case "list": {
      const all = await listItems(ws.id);
      const on = await memoryEnabled(ws.id);
      if (!all.length) return on ? "I'm not remembering anything about you yet." : "Memory is off, and I have nothing saved.";
      return `Here's what I remember${on ? "" : " (memory is off, so I'm not using any of it)"}:\n${all.slice(0, 30).map((i) => `- ${i.text}`).join("\n")}\n\nSay "forget that" to remove the latest, or "erase my memory" to delete all of it.`;
    }
    case "remember": {
      if (!(await memoryEnabled(ws.id))) return "Memory is turned off, so I didn't save that. Say \"turn memory on\" or switch it on in Account → Memory.";
      const text = cleanFact(intent.text.startsWith("I ") || /^(i'm|im|my|we|our)\b/i.test(intent.text) ? `The user says: ${intent.text}` : intent.text);
      if (!text) return "I can't save that one. I only keep short, personal facts like your name, goals and preferences, not instructions, links or sensitive details like passwords or card numbers.";
      const added = await addItems(ws.id, [{ text, kind: kindOfNote(intent.text) }], "user");
      return added.length ? `Got it. I'll remember: "${text}" You can delete it any time by saying "forget that".` : "I already have that in my memory.";
    }
  }
}
