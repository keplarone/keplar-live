"use client";
/** "Build something like this": hands the showcase brief to Create (read once by AppBuilder) and opens it. */
import { useRouter } from "next/navigation";
import { giveAppHandoff } from "@/components/create/apps/handoff";
import s from "./Showcase.module.css";

export function BuildLikeThis({ prompt, slug, label = "Build something like this" }: { prompt: string; slug: string; label?: string }) {
  const router = useRouter();
  return (
    <button type="button" className={s.btn} onClick={() => { giveAppHandoff({ prompt }); router.push(`/app/create?utm_source=showcase&utm_content=${encodeURIComponent(slug)}`); }}>
      {label}
    </button>
  );
}
