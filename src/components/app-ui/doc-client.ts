import type { Attachment } from "@/lib/orchestration/types";
import type { DocKind } from "@/lib/attachments/kinds";

/**
 * Text Keplar read for attachments in this browser tab: files (read on the server), links (fetched on the server) and
 * transcripts of attached video/audio. It is sent with the question and never saved with the chat (only the name is).
 */
type Stored = { name: string; text: string; truncated: boolean; source: "file" | "link" | "transcript"; url?: string };
const store = new Map<string, Stored>();
const key = (a: { name: string; size: number }) => `${a.name}\u0000${a.size}`;

export class DocUploadError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

export type DocRead = { text: string; truncated: boolean; pages: number; kind: DocKind; summary: string; notes: string[]; title?: string };

/** Send the file to be read on the server (PDF, Office, data, code, archives). Throws DocUploadError with a message that is safe to show. */
export async function readDocument(file: File, signal?: AbortSignal): Promise<DocRead> {
  const body = new FormData();
  body.append("file", file);
  let res: Response;
  try {
    res = await fetch("/api/keplar/extract", { method: "POST", body, signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new DocUploadError(`Couldn't send ${file.name}. Check your connection and try again.`);
  }
  if (res.status === 401) throw new DocUploadError("Sign in to attach documents. Images, video, audio and links work without an account.", "signin");
  const data = (await res.json().catch(() => null)) as (Partial<DocRead> & { error?: string; code?: string }) | null;
  if (!res.ok || !data?.text) throw new DocUploadError(data?.error ?? `Couldn't read ${file.name}.`, data?.code);
  store.set(key(file), { name: file.name, text: data.text, truncated: Boolean(data.truncated), source: "file" });
  return { text: data.text, truncated: Boolean(data.truncated), pages: data.pages ?? 1, kind: (data.kind ?? "text") as DocKind, summary: data.summary ?? "", notes: data.notes ?? [], title: data.title };
}

export type LinkPreview = {
  url: string;
  finalUrl: string;
  host: string;
  kind: "page" | "pdf" | "youtube" | "image" | "data";
  title: string;
  siteName?: string;
  description?: string;
  favicon?: string;
  image?: string;
  text: string;
  summary: string;
  truncated: boolean;
  dataUrl?: string;
  design?: { palette: string[]; fonts: string[]; nav: string[]; ctas: string[]; sections: string[] };
  notes: string[];
};

/** Ask the server to read a link. The attachment it returns is what the message lists; the text stays in this tab. */
export async function readLink(url: string, opts: { purpose?: "answer" | "reference"; signal?: AbortSignal } = {}): Promise<{ read: LinkPreview; attachment: Attachment }> {
  let res: Response;
  try {
    res = await fetch("/api/keplar/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, purpose: opts.purpose ?? "answer" }), signal: opts.signal });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new DocUploadError("Couldn't reach Keplar to read that link. Check your connection.");
  }
  const data = (await res.json().catch(() => null)) as (LinkPreview & { error?: string; code?: string }) | null;
  if (!res.ok || !data || data.error) throw new DocUploadError(data?.error ?? "Couldn't read that link.", data?.code);
  const attachment: Attachment = { name: `${data.host} — ${data.title}`.slice(0, 180), size: 0, type: "text/uri-list" };
  if (data.text) store.set(key(attachment), { name: attachment.name, text: data.text, truncated: data.truncated, source: "link", url: data.finalUrl });
  return { read: data, attachment };
}

/** Keep a transcript for the message; returns the attachment that lists it. */
export function keepTranscript(mediaName: string, text: string, truncated = false): Attachment {
  const attachment: Attachment = { name: `${mediaName} · transcript`.slice(0, 180), size: text.length, type: "text/x-transcript" };
  store.set(key(attachment), { name: attachment.name, text, truncated, source: "transcript" });
  return attachment;
}

/** `docs` for a request: the text of each attachment that was read in this tab. */
export function docsFor(attachments: Attachment[] | undefined) {
  const out: { name: string; text: string; truncated?: boolean; source?: "file" | "link" | "transcript"; url?: string }[] = [];
  for (const a of attachments ?? []) {
    const d = store.get(key(a));
    if (d) out.push({ name: d.name, text: d.text, ...(d.truncated ? { truncated: true } : {}), ...(d.source !== "file" ? { source: d.source } : {}), ...(d.url ? { url: d.url } : {}) });
  }
  return out.length ? out : undefined;
}

export const forgetDocument = (a: { name: string; size: number }) => void store.delete(key(a));
