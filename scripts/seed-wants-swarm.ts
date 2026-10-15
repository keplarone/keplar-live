/**
 * Seed the Keplar Wants agent index and seal it for read-only opens.
 * Synthetic metadata only. `npm run build` runs this before `next build`,
 * which traces data/wants/swarm.db into the serverless bundle.
 *
 *   npx tsx scripts/seed-wants-swarm.ts
 *   npx tsx scripts/seed-wants-swarm.ts 100000 data/wants/swarm.db
 */
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { bundledSwarmPath, catalogAgents, Registry } from "../src/lib/wants/registry";

const n = Number(process.argv[2] ?? 100_000);
const file = path.resolve(process.argv[3] ?? bundledSwarmPath());

async function main(): Promise<void> {
  if (!Number.isInteger(n) || n < 1 || n > 100_000) {
    console.error("Count must be an integer from 1 to 100000.");
    process.exit(1);
  }
  mkdirSync(path.dirname(file), { recursive: true });
  for (const extra of ["", "-wal", "-shm"]) rmSync(file + extra, { force: true });
  const registry = new Registry(file);
  const t = Date.now();
  const count = await registry.index(catalogAgents(n));
  registry.prepareBundle();
  console.log(JSON.stringify({ indexed: count, ms: Date.now() - t, fts5: registry.fts, agents: registry.count(), file }));
  registry.close();
}

void main();
