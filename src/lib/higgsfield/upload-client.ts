/**
 * Browser side of reference uploads (shared by the video and image studios and by Create image in chat).
 * The ORIGINAL file is uploaded, never re-encoded: files up to 3 MB go through a Keplar function, larger ones go straight from the
 * browser to storage with a presigned URL, so the 4.5 MB request cap never limits quality.
 */
export type SignedRef = { kind: "image" | "video"; url: string; contentType: string; bytes: number; durationSec?: number; name: string; token: string };

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/create/media/reference", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw Object.assign(new Error(String(data.error ?? "Upload failed.")), { code: data.code });
  return data as T;
}

const toBase64 = (buf: ArrayBuffer) => {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export async function uploadReference(file: File, kind: "image" | "video", durationSec?: number): Promise<SignedRef> {
  const base = { kind, contentType: file.type, name: file.name, durationSec };
  if (file.size <= 3_000_000) {
    try {
      return (await post<{ reference: SignedRef }>({ ...base, mode: "inline", data: toBase64(await file.arrayBuffer()) })).reference;
    } catch (e) {
      if ((e as { code?: string }).code !== "use_presign") throw e;
    }
  }
  const p = await post<{ reference: SignedRef; upload: { url: string; headers: Record<string, string> } }>({ ...base, mode: "presign", bytes: file.size });
  const put = await fetch(p.upload.url, { method: "PUT", headers: p.upload.headers, body: file }).catch(() => null);
  if (!put?.ok) throw new Error("The upload didn't finish. Check your connection and try again.");
  return p.reference;
}
