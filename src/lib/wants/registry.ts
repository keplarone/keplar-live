/**
 * Virtual micro-agent registry.
 *
 * Storage: Node's built-in `node:sqlite` (this app runs on Node 22; no native addon).
 * Production reads a catalog seeded at build time into data/wants/swarm.db and traced
 * into the serverless bundle. That file is opened read-only. PINs and confirmations
 * stay in the app's Neon/file store (see pin.ts). KEPLAR_SWARM_DB overrides the path.
 * KEPLAR_DATA_DIR (tests, e2e) gets its own writable file so a suite never shares the bundle.
 *
 * This Node build ships SQLite without FTS5. When FTS5 is present it is used;
 * otherwise a keyword table with an index is the fallback. Rows come from a
 * generator and are inserted in batches. Lookups return at most 5 rows.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
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

/** Shipped with the deployment. `npm run build` writes this before `next build` traces it. */
export const BUNDLED_SWARM_RELATIVE = path.join("data", "wants", "swarm.db");

export function bundledSwarmPath(cwd = process.cwd()): string {
  return path.join(cwd, BUNDLED_SWARM_RELATIVE);
}

export function resolveSwarmPath(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd(), exists: (p: string) => boolean = existsSync): string {
  const explicit = env.KEPLAR_SWARM_DB?.trim();
  if (explicit) return explicit;
  // Tests and e2e set this so they never read or write the bundled catalog.
  if (env.KEPLAR_DATA_DIR) return path.join(env.KEPLAR_DATA_DIR, "keplar-wants", "swarm.db");
  const bundled = bundledSwarmPath(cwd);
  if (exists(bundled)) return bundled;
  if (env.VERCEL) return path.join(os.tmpdir(), "keplar-wants", "swarm.db");
  return path.join(cwd, ".data", "keplar-wants", "swarm.db");
}

export function catalogIsBundled(dbPath: string, cwd = process.cwd()): boolean {
  return path.resolve(dbPath) === path.resolve(bundledSwarmPath(cwd));
}

export function defaultSwarmPath(): string {
  return resolveSwarmPath();
}

type SqlRow = { agent_id: string; name: string; track: string; keywords: string; skills: string; api_schema: string };

export class Registry {
  readonly fts: boolean;
  readonly readOnly: boolean;
  private db: DatabaseSync;
  constructor(dbPath: string = defaultSwarmPath(), private batchSize = 2000, opts: { readOnly?: boolean } = {}) {
    this.readOnly = opts.readOnly === true;
    if (this.readOnly) {
      this.db = new DatabaseSync(dbPath, { readOnly: true });
      this.db.exec("PRAGMA query_only=ON");
    } else {
      if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });
      this.db = new DatabaseSync(dbPath);
      this.db.exec("PRAGMA journal_mode=WAL");
      this.db.exec("PRAGMA synchronous=NORMAL");
      this.db.exec("PRAGMA cache_size=-8000");
      this.db.exec("PRAGMA temp_store=FILE");
    }
    this.fts = fts5Available();
    if (!this.readOnly) {
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
  }

  /** Collapse the WAL into one file so the bundle can be opened read-only. */
  prepareBundle(): void {
    if (this.readOnly) throw new Error("catalog is read-only");
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.db.exec("PRAGMA journal_mode=DELETE");
    this.db.exec("VACUUM");
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
    if (this.readOnly) throw new Error("catalog is read-only");
    // Rebuilding the keyword index once is much faster than updating it on every row.
    if (!this.fts) this.db.exec("DROP INDEX IF EXISTS ix_kw");
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
      if (!this.fts) this.db.exec("CREATE INDEX IF NOT EXISTS ix_kw ON agent_kw(kw)");
      gcHint();
    }
  }

  private flush(batch: AgentInput[]): number {
    const rows = batch.map((e) => {
      const keywords = (e.keywords ?? []).map((k) => k.toLowerCase()).join(" ");
      const skills = (e.skills ?? []).map((k) => k.toLowerCase()).join(" ");
      const kws = [...new Set(`${keywords} ${skills}`.split(" ").filter(Boolean))];
      return { e, keywords, skills, kws };
    });
    this.db.exec("BEGIN");
    try {
      for (let i = 0; i < rows.length; i += 400) {
        const slice = rows.slice(i, i + 400);
        this.insertMany(
          "INSERT OR REPLACE INTO agents VALUES ",
          slice.map(() => "(?,?,?,?,?,?)"),
          slice.flatMap(({ e, keywords, skills }) => [e.agentId, e.name ?? "", e.track ?? "A", keywords, skills, JSON.stringify(e.apiSchema ?? {})]),
        );
        if (this.fts) {
          this.insertMany(
            "INSERT INTO agents_fts(agent_id, keywords, skills) VALUES ",
            slice.map(() => "(?,?,?)"),
            slice.flatMap(({ e, keywords, skills }) => [e.agentId, keywords, skills]),
          );
        } else {
          const ids = slice.map((r) => r.e.agentId);
          this.db.prepare(`DELETE FROM agent_kw WHERE agent_id IN (${ids.map(() => "?").join(",")})`).run(...ids);
          const pairs = slice.flatMap(({ e, kws }) => kws.flatMap((kw) => [kw, e.agentId]));
          if (pairs.length) this.insertMany("INSERT INTO agent_kw VALUES ", Array.from({ length: pairs.length / 2 }, () => "(?,?)"), pairs);
        }
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return batch.length;
  }

  /** One statement for many rows, staying under SQLite's bound-variable cap. */
  private insertMany(prefix: string, tuples: string[], params: string[]): void {
    if (!tuples.length) return;
    this.db.prepare(prefix + tuples.join(",")).run(...params);
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
  food: ["pizza", "mcdonalds", "groceries", "delivery", "restaurant", "takeout", "coffee", "food"],
  travel: ["flight", "hotel", "train", "rental", "booking", "ride"],
  logistics: ["shipping", "package", "courier", "tracking", "parcel", "return"],
  commerce: ["buy", "order", "shoes", "laptop", "gift", "price"],
  finance: ["invoice", "budget", "payment", "refund", "subscription", "bill"],
  home: ["cleaning", "plumber", "furniture", "repair", "moving", "laundry"],
  health: ["appointment", "doctor", "pharmacy", "fitness", "dentist", "therapy"],
  media: ["music", "movie", "podcast", "tickets", "concert", "book"],
  help: ["help", "support", "guide", "question"],
};

/**
 * Always present in the shipped catalog. Random sampling of DOMAINS can miss a
 * word in a small draw; these rows make the ordinary prompts match exactly.
 */
export const ANCHORS: AgentInput[] = [
  {
    agentId: "agt_anchor_food",
    name: "food-order",
    track: "B",
    keywords: ["food", "pizza", "mcdonalds", "restaurant", "delivery", "takeout"],
    skills: ["food.order"],
    apiSchema: { op: "food.order", params: { query: "string" } },
  },
  {
    agentId: "agt_anchor_ride",
    name: "ride",
    track: "B",
    keywords: ["ride", "rideshare", "taxi", "transit"],
    skills: ["travel.ride"],
    apiSchema: { op: "travel.ride", params: { query: "string" } },
  },
  {
    agentId: "agt_anchor_help",
    name: "help",
    track: "B",
    keywords: ["help", "support"],
    skills: ["help.ask"],
    apiSchema: { op: "help.ask", params: { query: "string" } },
  },
];

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

/** Anchors first, then the synthetic generator, still without buffering the whole list. */
export function* catalogAgents(n: number, seed = 7): Generator<AgentInput> {
  let left = n;
  for (const anchor of ANCHORS) {
    if (left <= 0) return;
    yield anchor;
    left--;
  }
  if (left > 0) yield* syntheticAgents(left, seed);
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
  if (!singleton) {
    const dbPath = defaultSwarmPath();
    singleton = new Registry(dbPath, 2000, { readOnly: catalogIsBundled(dbPath) });
  }
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
