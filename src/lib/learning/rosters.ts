import { loadFreeCatalog, loadLiveCatalog } from "@/lib/orchestration/catalog-sync";
import type { Rosters } from "./suite";

/** The models each tier can really route to right now (the same rosters the chat route uses). */
export const liveRosters = (): Rosters => ({ free: loadFreeCatalog().roster, paid: loadLiveCatalog() });
