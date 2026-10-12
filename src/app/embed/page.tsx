import { headers } from "next/headers";
import { EmbedAsk } from "@/components/embed/EmbedAsk";
import { isAccent, isTheme, looksLikeEmbedId } from "@/lib/embed/config";
import { signEmbedGrant } from "@/lib/embed/grant";
import { embedWidgets, normalizeOrigin, widgetAllows } from "@/lib/embed/store";
import { pageMeta } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = pageMeta("/embed", "Keplar Ask", "Embeddable Ask widget.");

type Props = { searchParams: Promise<{ id?: string; theme?: string; accent?: string; parent?: string }> };

export default async function EmbedPage({ searchParams }: Props) {
  const sp = await searchParams;
  const id = typeof sp.id === "string" ? sp.id : "";
  if (!looksLikeEmbedId(id)) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "#e8e8ea" }}>
        <p>Missing or invalid widget id. Create one in Account → Embed on keplar.one.</p>
      </main>
    );
  }
  const w = await embedWidgets().findSystemBy("id", id);
  if (!w || w.revokedAt) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "#e8e8ea" }}>
        <p>This widget is no longer available.</p>
      </main>
    );
  }
  const theme = isTheme(sp.theme) ? sp.theme : w.theme;
  const accent = isAccent(sp.accent) ? sp.accent : w.accent;
  const h = await headers();
  let refererOrigin: string | null = null;
  const referer = h.get("referer");
  if (referer) {
    try { refererOrigin = normalizeOrigin(new URL(referer).origin); } catch { refererOrigin = null; }
  }
  const locked = w.origins.length > 0;
  const originDenied = locked && !widgetAllows(w, refererOrigin);
  const parent = originDenied ? null : refererOrigin ?? (!locked ? normalizeOrigin(sp.parent) : null);
  const grant = !originDenied && locked && refererOrigin ? signEmbedGrant(w.id, refererOrigin) : null;
  return <EmbedAsk widgetId={w.id} theme={theme} accent={accent} models={w.models} parent={parent} grant={grant} originDenied={originDenied} />;
}
