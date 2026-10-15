/**
 * Virtual micro-agent registry.
 *
 * Storage: Node's built-in `node:sqlite` (this app runs on Node 22; no native addon).
 * The file lives at KEPLAR_SWARM_DB, or under .data/ locally, or /tmp on Vercel.
 * Vercel's disk is ephemeral, and this catalog is synthetic metadata, not user data,
 * so it is rebuilt per instance rather than written to Neon. PINs and confirmations
 * use the app's Neon/file store instead (see pin.ts).
 *
 * This Node build ships SQLite without FTS5. When FTS5 is present it is used;
 * otherwise a keyword table with an index is the fallback. Rows come from a
 * generator and are inserted in batches. Lookups return at most 5 rows.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export const MAX_RESULTS = 5;
const WORD = /[a-z0-9]+/g;
const STOP = new Set(["i", "want", "a", "an", "the", "to", "me", "my", "for", "of", "and", "please", "some", "get", "on", "in", "it"]);

export type AgentInput = {
  agentId: string;
  name?: string;
  track?: string;
  keywords?: string[];
  skills?: string[];
  apiSchema?: Record<string, unknown>;
};

export type AgentRow = {
  agentId: string;
  name: string;
  track: string;
  keywords: string[];
  skills: string[];
  apiSchema: Record<string, unknown>;
};

export function fts5Available(): boolean {
  const c = new DatabaseSync(":memory:");
  try {
    c.exec("CREATE VIRTUAL TABLE t USING fts5(x)");
    return true;
  } catch {
    return false;
  } finally {
    c.close();
  }
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter((w) => !STOP.has(w) && w.length > 1).slice(0, 16);
}

/** Drop young-generation garbage after a batch. No-op unless Node was started with --expose-gc. */
export function gcHint(): void {
  const g = globalThis as { gc?: () => void };
  try {
    g.gc?.();
  } catch {
    /* not exposed */
  }
}

export function defaultSwarmPath(): string {
  if (process.env.KEPLAR_SWARM_DB?.trim()) return process.env.KEPLAR_SWARM_DB.trim();
  // KEPLAR_DATA_DIR isolates tests. On Vercel only /tmp is writable; the catalog is rebuilt there.
  const dir = process.env.KEPLAR_DATA_DIR
    ? path.join(process.env.KEPLAR_DATA_DIR, "keplar-wants")
    : process.env.VERCEL
      ? path.join(os.tmpdir(), "keplar-wants")
      : path.join(process.cwd(), ".data", "keplar-wants");
  return path.join(dir, "swarm.db");
}

type SqlRow = { agent_id: string; name: string; track: string; keywords: string; skills: string; api_schema: string };

export class Registry {
  readonly fts: boolean;
  private db: DatabaseSync;
  constructor(dbPath: string = defaultSwarmPath(), private batchSize = 2000) {
    if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA synchronous=NORMAL");
    this.db.exec("PRAGMA cache_size=-8000");
    this.db.exec("PRAGMA temp_store=FILE");
    this.fts = fts5Available();
    this.db.exec(`CREATE TABLE IF NOT EXISTS agents(
      agent_id TEXT PRIMARY KEY, name TEXT, track TEXT,
      keywords TEXT, skills TEXT, api_schema TEXT)`);
    if (this.fts) {
      this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS agents_fts USING fts5(
        agent_id UNINDEXED, keywords, skills, tokenize='porter unicode61')`);
    } else {
      this.db.exec("CREATE TABLE IF NOT EXISTS agent_kw(kw TEXT, agent_id TEXT)");
      this.db.exec("CREATE INDEX IF NOT EXISTS ix_kw ON agent_kw(kw)");
    }
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM agents").get() as { n: number } | undefined;
    return Number(row?.n ?? 0);
  }

  close(): void {
    this.db.close();
  }

  /** Insert from any iterable in fixed-size transactions. Never materialises the source. */
  async index(entries: Iterable<AgentInput>): Promise<number> {
    let n = 0;
    let batch: AgentInput[] = [];
    try {
      for (const e of entries) {
        batch.push(e);
        if (batch.length >= this.batchSize) {
          n += this.flush(batch);
          batch = [];
          await new Promise((r) => setImmediate(r));
        }
      }
      if (batch.length) n += this.flush(batch);
      return n;
    } finally {
      batch = [];
      gcHint();
    }
  }

  private flush(batch: AgentInput[]): number {
    const insert = this.db.prepare("INSERT OR REPLACE INTO agents VALUES (?,?,?,?,?,?)");
    const delKw = this.fts ? null : this.db.prepare("DELETE FROM agent_kw WHERE agent_id = ?");
    const addKw = this.fts ? null : this.db.prepare("INSERT INTO agent_kw VALUES (?,?)");
    const addFts = this.fts ? this.db.prepare("INSERT INTO agents_fts(agent_id, keywords, skills) VALUES (?,?,?)") : null;
    this.db.exec("BEGIN");
    try {
      for (const e of batch) {
        const keywords = (e.keywords ?? []).join(" ");
        const skills = (e.skills ?? []).join(" ");
        insert.run(e.agentId, e.name ?? "", e.track ?? "A", keywords, skills, JSON.stringify(e.apiSchema ?? {}));
        if (addFts) addFts.run(e.agentId, keywords, skills);
        else if (delKw && addKw) {
          delKw.run(e.agentId);
          const seen = new Set(`${keywords} ${skills}`.split(" ").filter(Boolean));
          for (const kw of seen) addKw.run(kw, e.agentId);
        }
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return batch.length;
  }

  private lookupSync(prompt: string, limit: number): AgentRow[] {
    const terms = tokenize(prompt);
    if (!terms.length) return [];
    const cap = Math.min(limit, MAX_RESULTS);
    let rows: SqlRow[];
    if (this.fts) {
      const q = terms.map((t) => `"${t}"`).join(" OR ");
      rows = this.db.prepare(`SELECT a.agent_id AS agent_id, a.name AS name, a.track AS track, a.keywords AS keywords, a.skills AS skills, a.api_schema AS api_schema
        FROM agents_fts f JOIN agents a ON a.agent_id = f.agent_id
        WHERE agents_fts MATCH ? ORDER BY bm25(agents_fts) LIMIT ?`).all(q, cap) as SqlRow[];
    } else {
      const ph = terms.map(() => "?").join(",");
      rows = this.db.prepare(`SELECT a.agent_id AS agent_id, a.name AS name, a.track AS track, a.keywords AS keywords, a.skills AS skills, a.api_schema AS api_schema
        FROM (SELECT agent_id, COUNT(*) s FROM agent_kw WHERE kw IN (${ph})
              GROUP BY agent_id ORDER BY s DESC LIMIT ?) k JOIN agents a USING(agent_id)`).all(...terms, cap) as SqlRow[];
    }
    const out = rows.map((r) => ({
      agentId: r.agent_id,
      name: r.name,
      track: r.track,
      keywords: r.keywords.split(" ").filter(Boolean),
      skills: r.skills.split(" ").filter(Boolean),
      apiSchema: JSON.parse(r.api_schema) as Record<string, unknown>,
    }));
    return out;
  }

  async lookup(prompt: string, limit = MAX_RESULTS): Promise<AgentRow[]> {
    try {
      return this.lookupSync(prompt, limit);
    } finally {
      gcHint();
    }
  }
}

const DOMAINS: Record<string, string[]> = {
  food: ["pizza", "groceries", "delivery", "restaurant", "takeout", "coffee"],
  travel: ["flight", "hotel", "train", "rental", "booking", "trip"],
  logistics: ["shipping", "package", "courier", "tracking", "parcel", "return"],
  commerce: ["buy", "order", "shoes", "laptop", "gift", "price"],
  finance: ["invoice", "budget", "payment", "refund", "subscription", "bill"],
  home: ["cleaning", "plumber", "furniture", "repair", "moving", "laundry"],
  health: ["appointment", "doctor", "pharmacy", "fitness", "dentist", "therapy"],
  media: ["music", "movie", "podcast", "tickets", "concert", "book"],
};

function sample(rng: () => number, items: string[], k: number): string[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

/** Mulberry32, seeded so the catalog is stable across processes. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Synthetic catalog. A generator: callers must not buffer it. These are not real agents. */
export function* syntheticAgents(n: number, seed = 7): Generator<AgentInput> {
  const rng = mulberry32(seed);
  const names = Object.keys(DOMAINS);
  for (let i = 0; i < n; i++) {
    const d = names[i % names.length];
    const kws = sample(rng, DOMAINS[d], 3);
    yield {
      agentId: `agt_${String(i).padStart(6, "0")}`,
      name: `${d}-${kws[0]}-agent-${i}`,
      track: i % 3 ? "A" : "B",
      keywords: [d, ...kws],
      skills: kws.slice(0, 2).map((k) => `${d}.${k}`),
      apiSchema: { op: `${d}.${kws[0]}`, params: { query: "string" } },
    };
  }
}

let singleton: Registry | null = null;
export function swarmRegistry(): Registry {
  singleton ??= new Registry();
  return singleton;
}

/** Tests point the orchestrator at a throwaway registry. Pass null to restore the default. */
let override: Registry | null = null;
export function useRegistryForTests(r: Registry | null): void {
  override = r;
}
export function activeRegistry(): Registry {
  return override ?? swarmRegistry();
}
