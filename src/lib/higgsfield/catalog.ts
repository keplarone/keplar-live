/**
 * Higgsfield model catalog used by Keplar (video + image). Every endpoint and parameter below was read from the model's
 * own API reference on open.higgsfield.ai (checked 2026-10-03). Add a model only after reading its reference page.
 *
 * PRICES. `listUsd` is a price Higgsfield publishes (higgsfield.ai/higgsfield-api catalog, checked 2026-10-03), at the
 * model's default settings, with no launch discount applied. `null` means TBD: the catalog line does not map to this exact
 * endpoint/tier, so Keplar does not guess. The account's own `/estimate/<model>` answer, when keys are set, always wins.
 * A model whose price is TBD and whose estimate is unavailable cannot be started (the UI says "Price TBD").
 */
export type HfKind = "video" | "image";
export type HfMode = "text-to-video" | "image-to-video" | "reference-to-video" | "video-to-video" | "text-to-image" | "image-to-image";

export type ModelOpts = {
  resolutions?: string[];
  defaultResolution?: string;
  /** Sound on/off: the request field and its style. */
  sound?: { param: string; style: "bool" | "onoff" };
  negativePrompt?: boolean;
  seed?: boolean;
};
/** What the user chose; each field is only applied when the model lists it in `opts`. */
export type GenOpts = { resolution?: string; sound?: boolean; negativePrompt?: string; seed?: number };

export type HfModel = {
  /** Keplar id: always `hf/<endpoint>`. */
  id: string;
  /** Path appended to https://api.higgsfield.ai/ */
  endpoint: string;
  kind: HfKind;
  mode: HfMode;
  label: string;
  note: string;
  /** Allowed durations in seconds (video). */
  durations?: number[];
  aspectRatios: string[];
  /** Published list price in USD: per second (video) or per image. null = TBD. */
  listUsd: number | null;
  unit: "second" | "image";
  /** Where listUsd came from, shown in the admin/docs. */
  priceSource: string;
  /** Reference inputs this model uses. Absent = text only: any reference the user attaches is ignored (and the UI says so). */
  refs?: { image?: { min: number; max: number }; video?: { min: number; max: number } };
  /** How references map onto the request body (see referenceFields). */
  refStyle?: "image_url" | "image_urls" | "video_and_images" | "reference";
  /** Shortest/longest accepted reference or source video, seconds (null = not documented). */
  /** Output length follows the source video (Genjutsu), so the plan's max seconds applies to the source. */
  durationFollowsSource?: boolean;
  /** User-selectable options this model documents. Anything not listed here is not offered for the model. */
  opts?: ModelOpts;
  /** Extra JSON fields Keplar sends for this model (documented defaults only). */
  fixed?: Record<string, unknown>;
  default?: boolean;
};

const CATALOG_URL = "higgsfield.ai/higgsfield-api catalog, 2026-10-03";
const SEEDANCE_OPTS: ModelOpts = { resolutions: ["480p", "720p", "1080p", "4k"], defaultResolution: "720p", sound: { param: "generate_audio", style: "bool" } };
const KLING3_OPTS: ModelOpts = { sound: { param: "sound", style: "onoff" } };
const KLING25_OPTS: ModelOpts = { negativePrompt: true };
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const HF_MODELS: HfModel[] = [
  {
    id: "hf/bytedance/seedance-2.0/text-to-video", endpoint: "bytedance/seedance-2.0/text-to-video", kind: "video", mode: "text-to-video", label: "Seedance 2.0", default: true,
    note: "Text to video, 4–15 s, 720p, optional sound.", durations: range(4, 15), aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    listUsd: 0.1407, unit: "second", priceSource: `Seedance 2.0 list $0.1407/s (${CATALOG_URL}); resolution/audio effect on price unverified`, opts: SEEDANCE_OPTS,
  },
  {
    id: "hf/bytedance/seedance-2.0/image-to-video", endpoint: "bytedance/seedance-2.0/image-to-video", kind: "video", mode: "image-to-video", label: "Seedance 2.0", refs: { image: { min: 1, max: 1 } }, refStyle: "image_url", default: true,
    note: "Image to video, 4–15 s, 720p, optional sound.", durations: range(4, 15), aspectRatios: [],
    listUsd: 0.1407, unit: "second", priceSource: `Seedance 2.0 list $0.1407/s (${CATALOG_URL}); resolution/audio effect on price unverified`, opts: SEEDANCE_OPTS,
  },
  {
    id: "hf/bytedance/seedance-2.0/reference-to-video", endpoint: "bytedance/seedance-2.0/reference-to-video", kind: "video", mode: "reference-to-video", label: "Seedance 2.0 (references)",
    note: "Uses your reference image(s) and/or video as style, subject or motion guidance. 4–15 s, 720p.", durations: range(4, 15), aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    refs: { image: { min: 0, max: 4 }, video: { min: 0, max: 1 } }, refStyle: "reference",
    listUsd: null, unit: "second", priceSource: "TBD: pricing with reference video is not separately published", opts: SEEDANCE_OPTS,
  },
  {
    id: "hf/higgsfield/genjutsu/motion-transfer/v1.0", endpoint: "higgsfield/genjutsu/motion-transfer/v1.0", kind: "video", mode: "video-to-video", label: "Genjutsu motion transfer",
    note: "Moves the motion of your source video (at least 4 s) onto your reference image(s). Output length follows the source video.", durations: undefined, aspectRatios: [],
    refs: { image: { min: 1, max: 2 }, video: { min: 1, max: 1 } }, refStyle: "video_and_images", durationFollowsSource: true,
    listUsd: null, unit: "second", priceSource: "TBD: the published 'Genjutsu' lines ($0.318/s list) do not say which mode they price", opts: { resolutions: ["480p", "720p", "1080p"], defaultResolution: "720p" },
  },
  {
    id: "hf/kling-video/v3.0/std/text-to-video", endpoint: "kling-video/v3.0/std/text-to-video", kind: "video", mode: "text-to-video", label: "Kling 3.0 Standard",
    note: "Text to video, 3–15 s, optional sound.", durations: range(3, 15), aspectRatios: ["16:9", "9:16", "1:1"],
    listUsd: null, unit: "second", priceSource: "TBD: the published 'Kling 3.0' line does not name the Standard tier", opts: KLING3_OPTS,
  },
  {
    id: "hf/kling-video/v3.0/std/image-to-video", endpoint: "kling-video/v3.0/std/image-to-video", kind: "video", mode: "image-to-video", label: "Kling 3.0 Standard", refs: { image: { min: 1, max: 1 } }, refStyle: "image_url",
    note: "Image to video, 3–15 s, optional sound.", durations: range(3, 15), aspectRatios: [],
    listUsd: null, unit: "second", priceSource: "TBD: the published 'Kling 3.0' line does not name the Standard tier", opts: KLING3_OPTS,
  },
  {
    id: "hf/kling-video/v2.5-turbo/pro/text-to-video", endpoint: "kling-video/v2.5-turbo/pro/text-to-video", kind: "video", mode: "text-to-video", label: "Kling 2.5 Turbo Pro",
    note: "Text to video, 5 or 10 s.", durations: [5, 10], aspectRatios: [],
    listUsd: null, unit: "second", priceSource: "TBD: the published 'Kling 2.5' line does not name the Turbo Pro tier", opts: KLING25_OPTS,
  },
  {
    id: "hf/kling-video/v2.5-turbo/pro/image-to-video", endpoint: "kling-video/v2.5-turbo/pro/image-to-video", kind: "video", mode: "image-to-video", label: "Kling 2.5 Turbo Pro", refs: { image: { min: 1, max: 1 } }, refStyle: "image_url",
    note: "Image to video, 5 or 10 s.", durations: [5, 10], aspectRatios: [],
    listUsd: null, unit: "second", priceSource: "TBD: the published 'Kling 2.5' line does not name the Turbo Pro tier", opts: KLING25_OPTS,
  },
  {
    id: "hf/minimax/hailuo-2.3/standard/text-to-video", endpoint: "minimax/hailuo-2.3/standard/text-to-video", kind: "video", mode: "text-to-video", label: "MiniMax Hailuo 2.3 Standard",
    note: "Text to video, 6 or 10 s.", durations: [6, 10], aspectRatios: [],
    listUsd: null, unit: "second", priceSource: "TBD: the published 'Hailuo 2.3' line does not name the Standard tier",
  },
  {
    id: "hf/minimax/hailuo-2.3/standard/image-to-video", endpoint: "minimax/hailuo-2.3/standard/image-to-video", kind: "video", mode: "image-to-video", label: "MiniMax Hailuo 2.3 Standard", refs: { image: { min: 1, max: 1 } }, refStyle: "image_url",
    note: "Image to video, 6 or 10 s.", durations: [6, 10], aspectRatios: [],
    listUsd: null, unit: "second", priceSource: "TBD: the published 'Hailuo 2.3' line does not name the Standard tier",
  },
  {
    id: "hf/z-image/turbo", endpoint: "z-image/turbo", kind: "image", mode: "text-to-image", label: "Z-Image Turbo", default: true,
    note: "Text to image, PNG at 1k or 2k, prompts up to 800 characters.", aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "7:9", "9:7", "9:16", "16:9", "21:9"],
    listUsd: 0.015, unit: "image", priceSource: `Z-Image Turbo $0.015/image at 1k and 2k (open.higgsfield.ai playground price table, ${CATALOG_URL})`, opts: { resolutions: ["1k", "2k"], defaultResolution: "1k", seed: true },
  },
  {
    id: "hf/alibaba/qwen-image-3/text-to-image", endpoint: "alibaba/qwen-image-3/text-to-image", kind: "image", mode: "text-to-image", label: "Qwen Image 3",
    note: "Text to image (English or Chinese), PNG at 1k or 2k, with a negative prompt.", aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "7:9", "9:7", "9:16", "16:9", "21:9"],
    listUsd: 0.075, unit: "image", priceSource: "Qwen Image 3 $0.04–$0.075/image across 1k–2k (open.higgsfield.ai); upper bound used because the split is not published",
    opts: { resolutions: ["1k", "2k"], defaultResolution: "1k", negativePrompt: true, seed: true },
  },
  {
    id: "hf/alibaba/qwen-image-3/edit", endpoint: "alibaba/qwen-image-3/edit", kind: "image", mode: "image-to-image", label: "Qwen Image 3 Edit",
    note: "Edits or restyles from 1–3 reference images (used automatically when you attach a reference).", aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"],
    refs: { image: { min: 1, max: 3 } }, refStyle: "image_urls", opts: { negativePrompt: false },
    // Published as a range ($0.04 to $0.075 per image across 1k to 2k); the split per resolution is not published, so the upper bound is used until the account estimate says otherwise.
    listUsd: 0.075, unit: "image", priceSource: "Qwen Image 3 Edit $0.04–$0.075/image across 1k–2k (open.higgsfield.ai); upper bound used because the split is not published", fixed: { resolution: "1k" },
  },
];

export const hfModel = (id: string | undefined) => HF_MODELS.find((m) => m.id === id);
export const hfModels = (kind: HfKind, mode?: HfMode) => HF_MODELS.filter((m) => m.kind === kind && (!mode || m.mode === mode));
/** Higgsfield is the default for both: the first `default` model of the kind (video: Seedance 2.0 text-to-video). */
export const defaultHfModel = (kind: HfKind, mode?: HfMode) => hfModels(kind, mode).find((m) => m.default) ?? hfModels(kind, mode)[0];

/** Price for the chosen settings from the published list price, or null (TBD). */
export function listPriceUsd(m: HfModel, durationSec?: number): number | null {
  if (m.listUsd === null) return null;
  return m.unit === "second" ? Math.round(m.listUsd * (durationSec ?? 5) * 1e6) / 1e6 : m.listUsd;
}

export type RefUrls = { imageUrls: string[]; videoUrls: string[] };

/** Does this model use the attached reference types? Text-only models ignore them. */
export function usesRefs(m: HfModel, have: { image: boolean; video: boolean }) {
  return { image: Boolean(m.refs?.image) && have.image, video: Boolean(m.refs?.video) && have.video };
}

/** Request fields for the model's reference style. Only called for models that declare `refs`. */
export function referenceFields(m: HfModel, r: RefUrls): Record<string, unknown> {
  switch (m.refStyle) {
    case "image_url": return { image_url: r.imageUrls[0] };
    case "image_urls": return { image_urls: r.imageUrls };
    case "video_and_images": return { video_url: r.videoUrls[0], image_urls: r.imageUrls };
    case "reference": return { ...(r.imageUrls.length ? { image_urls: r.imageUrls } : {}), ...(r.videoUrls.length ? { video_urls: r.videoUrls } : {}) };
    default: return {};
  }
}

/** Applies only the options the model documents. Unsupported choices are dropped, never sent. */
export function optionFields(m: HfModel, o: GenOpts = {}): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  const c = m.opts;
  if (!c) return f;
  if (c.resolutions && o.resolution && c.resolutions.includes(o.resolution)) f.resolution = o.resolution;
  else if (c.resolutions && c.defaultResolution) f.resolution = c.defaultResolution;
  if (c.sound && o.sound !== undefined) f[c.sound.param] = c.sound.style === "bool" ? o.sound : o.sound ? "on" : "off";
  if (c.negativePrompt && o.negativePrompt?.trim()) f.negative_prompt = o.negativePrompt.trim().slice(0, 500);
  if (c.seed && Number.isInteger(o.seed) && o.seed! >= 0 && o.seed! <= 2147483647) f.seed = o.seed;
  return f;
}

/** True when the choices still match the settings the published list price describes (default resolution, sound left on). */
export function atListBasis(m: HfModel, o: GenOpts = {}): boolean {
  const def = m.opts?.defaultResolution;
  if (def && o.resolution && o.resolution !== def) return false;
  if (m.opts?.sound && o.sound === false) return false;
  return true;
}

/** The exact JSON body sent to Higgsfield for a video model. */
export function videoBody(m: HfModel, i: { prompt: string; durationSec?: number; aspectRatio?: string; refs?: RefUrls; opts?: GenOpts }): Record<string, unknown> {
  const body: Record<string, unknown> = { prompt: i.prompt, ...(m.fixed ?? {}), ...optionFields(m, i.opts) };
  if (!m.durationFollowsSource && i.durationSec) body.duration = i.durationSec;
  if (m.aspectRatios.length) body.aspect_ratio = m.aspectRatios.includes(i.aspectRatio ?? "") ? i.aspectRatio : m.aspectRatios[0];
  if (m.refs && i.refs) Object.assign(body, referenceFields(m, i.refs));
  return body;
}

/** Image body for text-to-image models and for the edit (reference) model. */
export function imageBody(m: HfModel, i: { prompt: string; aspectRatio: string; resolution?: string; refs?: RefUrls; opts?: GenOpts }): Record<string, unknown> {
  const body: Record<string, unknown> = { prompt: i.prompt, ...(m.fixed ?? {}), ...optionFields(m, { ...i.opts, resolution: i.resolution ?? i.opts?.resolution }), aspect_ratio: m.aspectRatios.includes(i.aspectRatio) ? i.aspectRatio : "1:1" };
  if (m.refs && i.refs?.imageUrls.length) Object.assign(body, referenceFields(m, i.refs));
  return body;
}
