/**
 * Order Manager Web Worker Entry.
 */

// Deep imports, not the barrel: this is a worker entry, and the barrel pulls in `vue`.
// The pre-existing `from "@common/db"` here was the one place Order Manager violated that.
import { exposeWorkerHarness } from "@common/db/sync/pollingWorkerHarness";
import { registerDomains } from "@common/db/sync/syncRegistry";
import { getOrderManagerDb, setOmsInstanceResolver } from "@/db/orderManagerDb";
import { appSyncDomains } from "./appSyncDomains";

registerDomains(appSyncDomains);

exposeWorkerHarness((omsInstance) => {
  // The worker is its own JS realm: the product domain writes through `orderManagerDb.entity(...)`,
  // which resolves the instance here.
  setOmsInstanceResolver(() => omsInstance);
  return getOrderManagerDb(omsInstance);
});
