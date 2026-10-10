"use client";
import { useCallback, useMemo, useState } from "react";
import type { Answers, Question, SiteBrief } from "@/lib/site-builder/brief";
import type { ProductInfo } from "@/lib/site-builder/product/types";
import type { AssetView, Draft } from "../ProductImport";
import { discardAssets, emptyProduct } from "../ProductImport";

export type Direction = { id: string; name: string; tagline: string; swatch: string[]; mode: string; display: string; body: string; effect: string };
export type Estimate = { units: number; low: number; high: number; free: boolean; modelLabel: string };
export type Discover = { kind: string; questions: Question[]; brief: SiteBrief; structure: { label: string; value: string }[]; directions: Direction[]; estimate: Estimate; needsConfirm: boolean; limits: { pages: number } };
export type Enhanced = { idea: string; adds: string[]; missing: string[] };
export type EnhanceState = { status: "idle" | "working" | "ready" | "unavailable" | "failed"; enhanced: Enhanced | null; message?: string; used: boolean };

export async function discover(body: Record<string, unknown>): Promise<Discover> {
  const res = await fetch("/api/sites/discover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? `Request failed (${res.status})`));
  return data as unknown as Discover;
}

export type Stage = "idle" | "product" | "understand" | "asking" | "review";

/** The conversation that happens in the chat before anything is built. Free: no model is called until the build (except the optional, cheap prompt improvement). */
export function useFlow() {
  const [stage, setStage] = useState<Stage>("idle");
  const [idea, setIdea] = useState("");
  const [name, setName] = useState("");
  const [info, setInfo] = useState<Discover | null>(null);
  const [q, setQ] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [brief, setBrief] = useState<SiteBrief | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [enh, setEnh] = useState<EnhanceState>({ status: "idle", enhanced: null, used: false });
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [pNotes, setPNotes] = useState<string[]>([]);
  const [excerpt, setExcerpt] = useState<string | undefined>();
  const [maxImages, setMaxImages] = useState(3);
  const [dirPick, setDirPick] = useState<string | null>(null);

  const enhance = useCallback(async (b: SiteBrief) => {
    setEnh({ status: "working", enhanced: null, used: false });
    try {
      const res = await fetch("/api/sites/enhance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief: b }) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(data.error ?? "Couldn't improve the description."));
      if (data.available === false) setEnh({ status: "unavailable", enhanced: null, message: String(data.message ?? ""), used: false });
      else if (!data.enhanced) setEnh({ status: "failed", enhanced: null, message: String(data.message ?? ""), used: false });
      else setEnh({ status: "ready", enhanced: data.enhanced as Enhanced, used: false });
    } catch (e) {
      setEnh({ status: "failed", enhanced: null, message: e instanceof Error ? e.message : "Couldn't improve the description.", used: false });
    }
  }, []);

  const toReview = useCallback(
    async (a: Answers, base?: { idea: string; name?: string; product?: ProductInfo | null }) => {
      const i = base?.idea ?? idea;
      setWorking(true);
      setErr(null);
      try {
        const r = await discover({ idea: i, name: base?.name ?? (name || undefined), answers: a, product: (base?.product ?? product) ?? undefined });
        setInfo(r);
        const b = dirPick ? { ...r.brief, direction: dirPick as SiteBrief["direction"] } : r.brief;
        setBrief(b);
        setEstimate(r.estimate);
        setStage("review");
        void enhance(b);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setWorking(false);
      }
    },
    [idea, name, product, enhance, dirPick],
  );

  /** The first message: ask questions (or go straight to the brief). */
  const begin = useCallback(
    async (text: string, skip: boolean) => {
      const t = text.trim();
      if (t.length < 3) return;
      setIdea(t);
      setWorking(true);
      setErr(null);
      try {
        const r = await discover({ idea: t, name: name || undefined, product: product ?? undefined });
        setInfo(r);
        if (skip || !r.questions.length) {
          setBrief(r.brief);
          setEstimate(r.estimate);
          setStage("review");
          void enhance(r.brief);
          return;
        }
        setQ(0);
        setAnswers({});
        setPicked([]);
        setDirPick(null);
        setStage("understand");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setWorking(false);
      }
    },
    [name, product, enhance],
  );

  /** From "How I read your idea" to the first question (or straight to the brief when there is nothing to ask). */
  const continueFromUnderstand = useCallback(() => {
    if (info?.questions.length) { setQ(0); setAnswers({}); setPicked([]); setStage("asking"); }
    else void toReview({});
  }, [info, toReview]);

  const questions = useMemo(() => info?.questions ?? [], [info]);
  const cur = stage === "asking" ? questions[q] : undefined;

  const answer = useCallback(
    (text: string, skipped = false) => {
      if (!cur) return;
      const next: Answers = { ...answers, [cur.id]: skipped ? { skipped: true } : { chips: picked, text: text.trim() || undefined } };
      setAnswers(next);
      setPicked([]);
      if (q + 1 >= questions.length) void toReview(next);
      else setQ(q + 1);
    },
    [cur, answers, picked, q, questions.length, toReview],
  );
  const skipAll = useCallback((text: string) => {
    const next: Answers = cur && (picked.length || text.trim()) ? { ...answers, [cur.id]: { chips: picked, text: text.trim() || undefined } } : answers;
    void toReview(next);
  }, [cur, answers, picked, toReview]);
  const back = useCallback(() => {
    if (q === 0) return;
    const prev = questions[q - 1];
    setPicked(answers[prev.id]?.chips ?? []);
    setQ(q - 1);
  }, [q, questions, answers]);
  const toggle = useCallback((chip: string) => setPicked((p) => (p.includes(chip) ? p.filter((x) => x !== chip) : cur?.multi ? [...p, chip] : [chip])), [cur]);

  const reroll = useCallback(async () => {
    if (!brief) return;
    setWorking(true);
    try {
      const r = await discover({ idea: brief.idea || idea, brief: { ...brief, recipe: undefined }, reroll: true });
      setBrief((b) => (b ? { ...b, recipe: r.brief.recipe } : b));
      setInfo((i) => (i ? { ...i, structure: r.structure } : i));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't draw a new structure.");
    } finally {
      setWorking(false);
    }
  }, [brief, idea]);

  const takeDraft = useCallback((dr: Draft) => {
    setProduct(dr.product);
    setAssets(dr.assets);
    setPNotes(dr.notes);
    setExcerpt(dr.excerpt);
    setMaxImages(dr.maxImages);
    setName((n) => n || dr.product.brand || dr.product.name);
    setErr(null);
    setStage("product");
  }, []);
  const manualProduct = useCallback(() => {
    setProduct(emptyProduct());
    setAssets([]);
    setPNotes([]);
    setExcerpt(undefined);
    setStage("product");
  }, []);
  const removeProduct = useCallback(() => {
    void discardAssets(assets.map((a) => a.id));
    setProduct(null);
    setAssets([]);
    setPNotes([]);
    setExcerpt(undefined);
    setStage("idle");
  }, [assets]);

  const reset = useCallback(() => {
    if (assets.length) void discardAssets(assets.map((a) => a.id));
    setStage("idle");
    setIdea("");
    setName("");
    setInfo(null);
    setQ(0);
    setAnswers({});
    setPicked([]);
    setBrief(null);
    setEstimate(null);
    setErr(null);
    setEnh({ status: "idle", enhanced: null, used: false });
    setProduct(null);
    setAssets([]);
    setPNotes([]);
    setExcerpt(undefined);
    setDirPick(null);
  }, [assets]);

  return {
    stage, setStage, idea, name, setName, info, setInfo, q, questions, cur, answers, picked, toggle, brief, setBrief, estimate, setEstimate, working, err, setErr, enh, setEnh,
    product, setProduct, assets, setAssets, pNotes, excerpt, maxImages, dirPick, setDirPick, continueFromUnderstand, begin, answer, skipAll, back, reroll, takeDraft, manualProduct, removeProduct, reset, toReview, enhance,
  };
}
export type Flow = ReturnType<typeof useFlow>;
