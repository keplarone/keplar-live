/** Deck export (server only): PPTX with pptxgenjs, PDF with pdf-lib. Image prompts become placeholders (no image is generated). */
import PptxGenJS from "pptxgenjs";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { PALETTES } from "./themes";
import type { Deck } from "./types";

const W = 13.333;
const H = 7.5;
const FONT = "Google Sans";

export const safeFileName = (title: string) => (title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "keplar-deck");

export async function deckToPptx(deck: Deck): Promise<Buffer> {
  const p = PALETTES[deck.theme];
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = deck.title;
  pptx.company = "Keplar One";
  pptx.author = "Keplar One";
  for (const [i, s] of deck.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: p.bg };
    if (s.notes) slide.addNotes(s.notes);
    const foot = () => slide.addText(`${i + 1}`, { x: W - 1.1, y: H - 0.6, w: 0.7, h: 0.3, fontFace: FONT, fontSize: 10, color: p.muted, align: "right" });
    if (s.layout === "title" || s.layout === "closing" || s.layout === "section") {
      slide.addShape("rect", { x: 0.8, y: 2.55, w: 0.08, h: 1.9, fill: { color: p.accent }, line: { color: p.accent, width: 0 } });
      if (s.section && s.layout !== "closing") slide.addText(s.section.toUpperCase(), { x: 1.1, y: 1.95, w: W - 2.4, h: 0.4, fontFace: FONT, fontSize: 12, color: p.accent, charSpacing: 3 });
      slide.addText(s.title, { x: 1.1, y: 2.45, w: W - 2.4, h: 1.5, fontFace: FONT, fontSize: s.layout === "section" ? 36 : 42, bold: true, color: p.ink, valign: "top", fit: "shrink" });
      if (s.bullets.length) slide.addText(s.bullets.join("\n"), { x: 1.1, y: 4.05, w: W - 2.4, h: 1.6, fontFace: FONT, fontSize: 20, color: p.muted, valign: "top", fit: "shrink" });
      if (s.layout !== "title") foot();
      continue;
    }
    if (s.section) slide.addText(s.section.toUpperCase(), { x: 0.8, y: 0.45, w: W - 1.6, h: 0.35, fontFace: FONT, fontSize: 11, color: p.accent, charSpacing: 3 });
    slide.addText(s.title, { x: 0.8, y: 0.85, w: W - 1.6, h: 1.0, fontFace: FONT, fontSize: 30, bold: true, color: p.ink, valign: "top", fit: "shrink" });
    const hasImg = Boolean(s.imagePrompt);
    const bw = hasImg ? 7.3 : W - 1.6;
    if (s.bullets.length) {
      slide.addText(s.bullets.map((b) => ({ text: b, options: { bullet: { code: "25AA" }, paraSpaceAfter: 10, breakLine: true } })), { x: 0.8, y: 2.0, w: bw, h: H - 3.0, fontFace: FONT, fontSize: 20, color: p.ink, valign: "top", fit: "shrink" });
    }
    if (hasImg) {
      slide.addShape("roundRect", { x: 8.5, y: 2.0, w: 4.0, h: 3.6, rectRadius: 0.12, fill: { color: p.panel }, line: { color: p.line, width: 1 } });
      slide.addText(`Image placeholder\n${s.imagePrompt}`, { x: 8.7, y: 2.2, w: 3.6, h: 3.2, fontFace: FONT, fontSize: 12, color: p.muted, align: "center", valign: "middle", fit: "shrink" });
    }
    foot();
  }
  const out = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(out as ArrayBuffer);
}

/** pdf-lib's built-in fonts are WinAnsi: map common typography, drop what it can't draw. */
export function winAnsi(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u25aa\u25cf]/g, "-")
    .replace(/[\u00a0\u2009\u202f]/g, " ")
    .replace(/[^\u0009\u000a\u0020-\u007e\u00a1-\u00ff]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of winAnsi(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const hex = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);

export async function deckToPdf(deck: Deck): Promise<Uint8Array> {
  const p = PALETTES[deck.theme];
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(deck.title));
  doc.setCreator("Keplar One");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const PW = 960;
  const PH = 540;
  for (const [i, s] of deck.slides.entries()) {
    const page = doc.addPage([PW, PH]);
    page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: hex(p.bg) });
    const big = s.layout !== "content";
    const left = big ? 80 : 60;
    let y = PH - (big ? 190 : 70);
    if (s.section && s.layout !== "closing") {
      page.drawText(winAnsi(s.section).toUpperCase(), { x: left, y: big ? y + 40 : y + 24, size: 11, font: regular, color: hex(p.accent) });
    }
    if (big) page.drawRectangle({ x: 56, y: y - 90, width: 5, height: 130, color: hex(p.accent) });
    const tSize = big ? 38 : 28;
    for (const line of wrap(s.title, bold, tSize, PW - left * 2).slice(0, 3)) {
      page.drawText(line, { x: left, y, size: tSize, font: bold, color: hex(p.ink) });
      y -= tSize * 1.2;
    }
    y -= big ? 14 : 22;
    const hasImg = !big && Boolean(s.imagePrompt);
    const bw = hasImg ? 520 : PW - left * 2;
    const bSize = big ? 18 : 17;
    outer: for (const b of s.bullets) {
      const lines = wrap(b, regular, bSize, bw - (big ? 0 : 20));
      for (const [li, line] of lines.entries()) {
        if (y < 56) break outer;
        if (!big && li === 0) page.drawCircle({ x: left + 4, y: y + 5, size: 2.5, color: hex(p.accent) });
        page.drawText(line, { x: left + (big ? 0 : 20), y, size: bSize, font: regular, color: hex(big ? p.muted : p.ink) });
        y -= bSize * 1.4;
      }
      y -= 8;
    }
    if (hasImg) {
      page.drawRectangle({ x: 620, y: 150, width: 280, height: 250, color: hex(p.panel), borderColor: hex(p.line), borderWidth: 1 });
      page.drawText("Image placeholder", { x: 636, y: 378, size: 11, font: bold, color: hex(p.muted) });
      let iy = 356;
      for (const line of wrap(s.imagePrompt, regular, 11, 248).slice(0, 12)) {
        page.drawText(line, { x: 636, y: iy, size: 11, font: regular, color: hex(p.muted) });
        iy -= 15;
      }
    }
    page.drawText(String(i + 1), { x: PW - 60, y: 28, size: 10, font: regular, color: hex(p.muted) });
  }
  return doc.save();
}
