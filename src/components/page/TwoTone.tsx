/**
 * Two-tone headline from the Oct 2026 canvas designs: the first part in ink, the rest in grey ("Every feature, | and whether…").
 * Splits after the first comma, full stop or question mark that has words on both sides; without one, the last word goes grey
 * (last two words from four words up), so "How can | we help?" and "Release | notes". Short or one-word titles stay one tone.
 */
export function splitTwoTone(text: string): [string, string] | null {
  const t = text.trim();
  const m = /^(.+?[,.?!:])\s+(\S.*)$/.exec(t);
  if (m && m[2].split(/\s+/).length >= 1 && m[1].length >= 4) return [m[1], m[2]];
  const words = t.split(/\s+/);
  if (words.length < 2) return null;
  const n = words.length >= 4 ? 2 : 1;
  return [words.slice(0, -n).join(" "), words.slice(-n).join(" ")];
}

export function TwoTone({ text }: { text: string }) {
  const parts = splitTwoTone(text);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts[0]} <span className="tt-g">{parts[1]}</span>
    </>
  );
}
