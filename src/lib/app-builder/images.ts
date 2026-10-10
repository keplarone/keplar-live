/**
 * Real imagery for generated apps: the spec's image slots are generated with Keplar's image generation (Higgsfield / OpenAI via
 * lib/images/provider) when it is configured, otherwise with an OpenRouter image model; stored as Keplar images and made public
 * at /i/<id> so the sandboxed app can load them. Paid plans only (the planner gives Free builds no slots).
 */
import { newBlobId, putImage, setPublic } from "@/lib/images/blob";
import { imagesConfigured, MAX_IMAGE_BYTES, type ImageSize } from "@/lib/images/config";
import { generateImage, sniffImage } from "@/lib/images/provider";
import { OPENROUTER_BASE } from "@/lib/site-builder/generate";
import type { ImageSlot } from "./types";

const sizeFor = (a: ImageSlot["aspect"]): ImageSize => (a === "1:1" ? "1024x1024" : a === "3:4" || a === "2:3" ? "1024x1536" : "1536x1024");
const OR_IMAGE_MODEL = "google/gemini-3.1-flash-image";

async function viaOpenRouter(prompt: string, aspect: string, signalMs: number): Promise<{ bytes: Buffer; usd: number }> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("no key");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), signalMs);
  try {
    const res = await fetch(`${OPENROUTER_BASE()}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "http-referer": "https://keplar.one", "x-title": "Keplar" },
      body: JSON.stringify({ model: OR_IMAGE_MODEL, modalities: ["image", "text"], image_config: { aspect_ratio: aspect }, messages: [{ role: "user", content: `${prompt}\n\nNo text, letters, logos or watermarks in the image.` }], usage: { include: true }, provider: { data_collection: "deny" } }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`image model ${res.status}`);
    const j = (await res.json()) as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[]; usage?: { cost?: number } };
    const url = j.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
    const m = /^data:image\/[a-z]+;base64,(.+)$/.exec(url);
    if (!m) throw new Error("no image");
    return { bytes: Buffer.from(m[1], "base64"), usd: typeof j.usage?.cost === "number" ? j.usage.cost : 0.04 };
  } finally {
    clearTimeout(t);
  }
}

export async function generateSlotImages(o: { slots: ImageSlot[]; workspaceId: string; origin: string; styleHint: string; deadline: number; onImage?: (slot: string, url: string | null) => void }): Promise<{ images: Record<string, string>; usd: number }> {
  const images: Record<string, string> = {};
  let usd = 0;
  await Promise.all(
    o.slots.map(async (s) => {
      const prompt = `${s.prompt}\nArt direction: ${o.styleHint}`.slice(0, 1000);
      const left = o.deadline - Date.now();
      if (left < 30_000) return o.onImage?.(s.slot, null);
      try {
        let bytes: Buffer;
        if (imagesConfigured()) {
          const g = await generateImage({ prompt, size: sizeFor(s.aspect), quality: "medium", workspaceId: o.workspaceId, timeoutMs: Math.min(left - 5_000, 120_000) });
          bytes = g.bytes;
          usd += g.usd;
        } else {
          const g = await viaOpenRouter(prompt, s.aspect, Math.min(left - 5_000, 120_000));
          bytes = g.bytes;
          usd += g.usd;
        }
        const type = sniffImage(bytes);
        if (!type || bytes.length > MAX_IMAGE_BYTES) throw new Error("bad image");
        const id = newBlobId();
        await putImage(id, o.workspaceId, bytes, type);
        await setPublic(o.workspaceId, id, true);
        images[s.slot] = `${o.origin.replace(/\/$/, "")}/i/${id}`;
        o.onImage?.(s.slot, images[s.slot]);
      } catch {
        o.onImage?.(s.slot, null);
      }
    }),
  );
  return { images, usd };
}
