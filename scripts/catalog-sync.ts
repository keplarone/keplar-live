/**
 * Live catalog sync job: `npm run catalog:sync`.
 * Fetches the OpenRouter, OpenAI and NVIDIA model lists (free GETs), writes the
 * snapshot that loadLiveCatalog() and loadFreeCatalog() apply, and prints a
 * summary (including the Free plan's $0 :free roster). Never prints keys.
 */
import { syncLiveCatalog, snapshotPath } from "../src/lib/orchestration/catalog-sync";

syncLiveCatalog()
  .then((s) => {
    console.log(`Live catalog synced ${s.syncedAt} → ${snapshotPath()}`);
    console.log(`Lists fetched: ${Object.entries(s.fetched).map(([k, v]) => `${k} ${v ? "ok" : "unavailable"}`).join(", ")}`);
    for (const [id, m] of Object.entries(s.models)) {
      const routes = Object.entries(m.routes).map(([r, ok]) => `${r}:${ok ? "listed" : "MISSING"}`).join(" ");
      const price = m.openRouterPrice ? `$${m.openRouterPrice.inputPer1M}/$${m.openRouterPrice.outputPer1M} per 1M` : "no OpenRouter price";
      console.log(`  ${id.padEnd(28)} ${routes.padEnd(40)} ${price}`);
    }
    if (s.free) {
      console.log("Free plan ($0 :free models):");
      for (const [id, f] of Object.entries(s.free)) console.log(`  ${id.padEnd(28)} ${f.listed ? "listed" : "MISSING"} ${f.zeroPriced ? "$0" : "NOT FREE (unroutable)"}`);
      if (s.freeExtras?.length) console.log(`  Other $0 :free fallbacks: ${s.freeExtras.map((x) => x.id).join(", ")}`);
    }
    if (s.candidates.length) console.log(`Cheap candidates from uncovered vendors (review only): ${s.candidates.map((c) => c.id).join(", ")}`);
    if (s.errors.length) console.log(`Notes: ${s.errors.join("; ")}`);
  })
  .catch((e) => {
    console.error("Catalog sync failed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
