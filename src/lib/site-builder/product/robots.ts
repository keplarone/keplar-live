/** robots.txt (RFC 9309) for KeplarBot: longest matching rule wins, Allow beats Disallow on a tie. */
export const BOT_TOKEN = "keplarbot";
export const BOT_UA = "KeplarBot/1.0 (+https://keplar.one/bot; reads one product page when a signed-in Keplar user asks)";

type Rule = { allow: boolean; pattern: string };
type Group = { agents: string[]; rules: Rule[] };

export function parseRobots(txt: string): Group[] {
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of txt.slice(0, 500_000).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" || key === "disallow") cur.rules.push({ allow: key === "allow", pattern: val });
  }
  return groups;
}

function matches(pattern: string, path: string): number {
  if (pattern === "") return -1;
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp("^" + body.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
  return re.test(path) ? body.replace(/\*/g, "").length + 1 : -1;
}

/** `path` is pathname + search. A missing/empty robots.txt allows everything. */
export function robotsAllows(txt: string | null, path: string): boolean {
  if (!txt) return true;
  const groups = parseRobots(txt);
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && BOT_TOKEN.includes(a.replace(/\/.*$/, "")) && a.length >= 4));
  const use = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  let best = -1;
  let allow = true;
  for (const g of use) {
    for (const r of g.rules) {
      const score = matches(r.pattern, path);
      if (score < 0) continue;
      if (score > best || (score === best && r.allow)) {
        best = score;
        allow = r.allow;
      }
    }
  }
  return allow;
}
