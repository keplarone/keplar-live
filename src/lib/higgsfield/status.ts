import { HF_MODELS } from "./catalog";
import { HF_ENV, higgsfieldBase, higgsfieldPresence } from "./client";
import { VIDEO_LIMITS } from "./video";

/** What the admin panel shows. Never contains a credential value. */
export function higgsfieldAdminStatus() {
  const p = higgsfieldPresence();
  const tbd = HF_MODELS.filter((m) => m.listUsd === null).length;
  return {
    configured: p.configured,
    label: p.killSwitch ? "Switched off" : p.configured ? "Configured" : "Not configured",
    source: p.source,
    shape: p.shape,
    killSwitch: p.killSwitch,
    envNames: { primary: HF_ENV.combined, fallbackKey: HF_ENV.key, fallbackSecret: HF_ENV.secret },
    base: higgsfieldBase(),
    defaults: { video: "Seedance 2.0", image: "Z-Image Turbo", imageFallback: "OpenAI gpt-image-1-mini (automatic)" },
    models: { video: HF_MODELS.filter((m) => m.kind === "video").length, image: HF_MODELS.filter((m) => m.kind === "image").length, priceTbd: tbd },
    videoPlans: Object.entries(VIDEO_LIMITS).filter(([, v]) => v).map(([k]) => k),
  };
}
