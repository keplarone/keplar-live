/**
 * Line breaks inside a Markdown paragraph or block quote.
 *
 * Answers are chat text: when a model puts lines on their own (a haiku, a poem, an address, song lyrics) it means
 * them as separate lines, and many models also mark that with a CommonMark hard break (two trailing spaces or a
 * trailing backslash). The renderer used to join every line with a space, so a three-line haiku came out as one
 * run-on sentence. Lines are now kept: each one is trimmed, a trailing hard-break backslash is dropped, and the
 * renderer draws a <br> where the lines meet.
 */
export function joinLines(lines: string[]): string {
  return lines.map((l) => l.trim().replace(/(?<!\\)\\$/, "").trimEnd()).join("\n");
}

/** Split text on the kept line breaks; the renderer puts a <br> between the parts. */
export function splitLines(text: string): string[] {
  return text.split("\n");
}
