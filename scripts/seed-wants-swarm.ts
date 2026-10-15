/**
 * Seed the Keplar Wants agent index. Synthetic metadata only.
 *   npx tsx scripts/seed-wants-swarm.ts 100000
 *   npx tsx scripts/seed-wants-swarm.ts 100000 /tmp/swarm.db
 */
import { Registry, syntheticAgents } from "../src/lib/wants/registry";

const n = Number(process.argv[2] ?? 100_000);
const file = process.argv[3];
if (!Number.isInteger(n) || n < 1 || n > 100_000) {
  console.error("Count must be an integer from 1 to 100000.");
  process.exit(1);
}
const registry = new Registry(file);
const t = Date.now();
const count = await registry.index(syntheticAgents(n));
console.log(JSON.stringify({ indexed: count, ms: Date.now() - t, fts5: registry.fts, agents: registry.count() }));
registry.close();
