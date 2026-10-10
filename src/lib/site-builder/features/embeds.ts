/**
 * Embeds as link cards (BETA). The site sandbox allows no frames and no third-party scripts, so an inline player, an interactive map
 * or a live-chat widget cannot run on a published page (listed as coming soon). What does work, with real providers and no setup:
 * a video card that opens YouTube or Vimeo, a map card that opens the address in a maps app, a calendar card that opens the owner's
 * Calendly / Cal.com / Google booking page, and a chat card that opens a WhatsApp chat. Every link is built here from a validated
 * value on an allow-list of hosts, never copied from model output.
 */
export type EmbedKind = "video" | "map" | "calendar" | "chat";
export type Embed = { kind: EmbedKind; href: string; label: string; cta: string; thumb?: string; provider: string; secondary?: { href: string; cta: string } };

const CALENDAR_HOSTS = ["calendly.com", "cal.com", "savvycal.com", "tidycal.com", "calendar.app.google", "calendar.google.com"];
const onHost = (h: string, base: string) => h === base || h.endsWith(`.${base}`);

function parseUrl(v: string): URL | null {
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" && !u.username && !u.password && !u.port ? u : null;
  } catch {
    return null;
  }
}

export function parseVideo(src: string): { provider: "YouTube" | "Vimeo"; href: string; thumb?: string } | null {
  const u = parseUrl(src);
  if (!u) return null;
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  let id = "";
  if (h === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (h === "youtube.com" || h === "m.youtube.com" || h === "youtube-nocookie.com") id = u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : u.searchParams.get("v") ?? "";
  if (/^[\w-]{11}$/.test(id)) return { provider: "YouTube", href: `https://www.youtube.com/watch?v=${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  if (h === "vimeo.com" || h === "player.vimeo.com") {
    const m = u.pathname.match(/(?:^|\/)(\d{5,12})(?:\/|$)/);
    if (m) return { provider: "Vimeo", href: `https://vimeo.com/${m[1]}` };
  }
  return null;
}

export function parseCalendar(src: string): string | null {
  const u = parseUrl(src);
  if (!u) return null;
  const h = u.hostname.toLowerCase();
  if (!CALENDAR_HOSTS.some((b) => onHost(h, b))) return null;
  const href = `https://${h}${u.pathname}${u.search}`;
  return href.length <= 200 ? href : null;
}

export function parseEmbed(attrs: Record<string, string>): Embed | null {
  const kind = attrs.kind as EmbedKind;
  const label = (attrs.title || "").slice(0, 120);
  if (kind === "video") {
    const v = parseVideo(attrs.src ?? "");
    return v ? { kind, href: v.href, label: label || "Watch the video", cta: `Watch on ${v.provider}`, thumb: v.thumb, provider: v.provider } : null;
  }
  if (kind === "map") {
    const a = (attrs.address ?? "").trim();
    if (!a) return null;
    const q = encodeURIComponent(a);
    return { kind, href: `https://www.google.com/maps/search/?api=1&query=${q}`, label: label || a, cta: "Open in Google Maps", provider: "Google Maps", secondary: { href: `https://www.openstreetmap.org/search?query=${q}`, cta: "OpenStreetMap" } };
  }
  if (kind === "calendar") {
    const href = parseCalendar(attrs.src ?? "");
    return href ? { kind, href, label: label || "Book a time", cta: "Open the calendar", provider: new URL(href).hostname } : null;
  }
  if (kind === "chat") {
    const digits = (attrs.phone ?? "").replace(/\D/g, "");
    return /^\d{7,15}$/.test(digits) ? { kind, href: `https://wa.me/${digits}`, label: label || "Chat with us", cta: "Chat on WhatsApp", provider: "WhatsApp" } : null;
  }
  return null;
}
