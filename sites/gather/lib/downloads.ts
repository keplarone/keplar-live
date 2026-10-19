import type { EventItem } from "./types";
export function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime })), a = document.createElement("a");
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function calendar(event: EventItem) {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const stamp = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gather//Events//EN", "BEGIN:VEVENT", `UID:${event.id}@gather`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(event.startsAt)}`, `DTEND:${stamp(event.endsAt)}`, `SUMMARY:${escape(event.title)}`, `LOCATION:${escape(event.venue + ", " + event.city)}`, `DESCRIPTION:${escape(event.description)}`, "END:VEVENT", "END:VCALENDAR"];
  // Fold UTF-8 content lines to RFC 5545's 75-octet limit.
  const folded = lines.map(line => { let result = "", bytes = 0; for (const char of line) { const size = new TextEncoder().encode(char).length; if (bytes + size > 74) { result += "\r\n "; bytes = 1; } result += char; bytes += size; } return result; }).join("\r\n");
  download("gather-event.ics", folded + "\r\n", "text/calendar;charset=utf-8");
}
export function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
