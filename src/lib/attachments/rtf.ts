/** RTF → plain text: control words dropped, \par and \line become newlines, \'hh and \uN decoded, hidden destinations skipped. */
const SKIP_DEST = /^(fonttbl|colortbl|stylesheet|info|pict|header|footer|headerl|headerr|footerl|footerr|object|datastore|themedata|xmlnstbl|listtable|listoverridetable|rsidtbl|generator|latentstyles|filetbl|revtbl)$/;

export function rtfToText(rtf: string): string {
  let out = "";
  const stack: { skip: boolean; uc: number }[] = [];
  let skip = false;
  let uc = 1;
  let pendingSkip = 0;
  for (let i = 0; i < rtf.length; i++) {
    const c = rtf[i];
    if (c === "{") { stack.push({ skip, uc }); continue; }
    if (c === "}") { const s = stack.pop(); if (s) { skip = s.skip; uc = s.uc; } continue; }
    if (c === "\\") {
      const n = rtf[i + 1];
      if (n === "\\" || n === "{" || n === "}") { if (!skip) out += n; i++; continue; }
      if (n === "'") { const hex = rtf.slice(i + 2, i + 4); if (!skip && pendingSkip === 0) out += String.fromCharCode(parseInt(hex, 16)); else if (pendingSkip > 0) pendingSkip--; i += 3; continue; }
      if (n === "*") { skip = true; i++; continue; }
      if (n === "~") { if (!skip) out += "\u00a0"; i++; continue; }
      if (n === "\n" || n === "\r") { if (!skip) out += "\n"; i++; continue; }
      const m = /^([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(rtf.slice(i + 1, i + 50));
      if (!m) { i++; continue; }
      i += m[0].length;
      const word = m[1], arg = m[2] !== undefined ? Number(m[2]) : null;
      if (SKIP_DEST.test(word)) { skip = true; continue; }
      if (skip) continue;
      if (word === "par" || word === "line" || word === "sect" || word === "page") out += "\n";
      else if (word === "tab" || word === "cell") out += "\t";
      else if (word === "row") out += "\n";
      else if (word === "uc" && arg !== null) uc = arg;
      else if (word === "u" && arg !== null) { out += String.fromCharCode(arg < 0 ? arg + 65536 : arg); pendingSkip = uc; }
      else if (word === "emdash") out += "—";
      else if (word === "endash") out += "–";
      else if (word === "bullet") out += "•";
      else if (word === "lquote" || word === "rquote") out += "'";
      else if (word === "ldblquote" || word === "rdblquote") out += '"';
      continue;
    }
    if (c === "\n" || c === "\r") continue;
    if (skip) continue;
    if (pendingSkip > 0) { pendingSkip--; continue; }
    out += c;
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
