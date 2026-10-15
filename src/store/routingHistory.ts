import { api, logger } from "@common";
import { defineStore } from "pinia";
import { toMillis } from "@/utils/format";
import {
  type ItemRoutingHistory, type LocationStock, type MovementPage, type ProductFacilityPair, type RoutingItem,
  buildRoutingHistory, isStockLocation, movementRequests, pairKey, sumLocationStock
} from "@/utils/routingHistory";

/** Routing changes are read newest first; an order with more than a page loses its oldest moves. */
const ROUTING_CHANGE_PAGE_SIZE = 200;
/** Unfillable rows can run into the thousands on one order, so only the latest ones are read. */
const UNFILLABLE_SAMPLE_SIZE = 50;
const MOVEMENT_PAGE_SIZE = 100;
const MOVEMENT_PAGE_LIMIT = 5;
const STOCK_PAGE_SIZE = 500;
/** A guard against an endpoint that ignores pageIndex; 20 pages is far beyond one order. */
const STOCK_PAGE_LIMIT = 20;

function rowsOf(response: any): any[] {
  return Array.isArray(response?.data) ? response.data : [];
}

type LoadStatus = "loading" | "loaded" | "error";

interface RoutingHistoryState {
  changesByOrderId: Record<string, any[]>;
  statusByOrderId: Record<string, LoadStatus>;
  /** Stock movements per product and facility, keyed by pairKey. */
  movementsByPair: Record<string, MovementPage>;
  /** Current available to promise and on hand per product and facility, keyed by pairKey. */
  stockByPair: Record<string, LocationStock>;
  /** When each product store went live on HotWax inventory (see fetchInventoryCutoff); null when unknown. */
  cutoffByProductStore: Record<string, number | null>;
}

export interface LoadRoutingOptions {
  /** Read again even when already loaded. */
  force?: boolean;
  /** When the order came in, where an item that was never routed is read from. */
  importedAt?: number;
  /** The order's product store, whose go-live explains items with no inventory impact. */
  productStoreId?: string;
  /**
   * The caller's facility and facility type rows, which tell a stock location from a virtual one.
   * Without them the facility id convention decides.
   */
  facilities?: any[];
  facilityTypes?: any[];
}

const inFlight = new Map<string, Promise<void>>();
/** Orders whose items moved since their routing was read; the next load reads it again. */
const stale = new Set<string>();

export const useRoutingHistoryStore = defineStore("routingHistory", {
  state: (): RoutingHistoryState => ({
    changesByOrderId: {},
    statusByOrderId: {},
    movementsByPair: {},
    stockByPair: {},
    cutoffByProductStore: {},
  }),
  getters: {
    /** `facilities` and `facilityTypes` are the caller's rows, which tell stock locations from virtual ones. */
    historyFor: (state) => (orderId: string, items: RoutingItem[], facilities: any[], facilityTypes: any[]): ItemRoutingHistory[] => buildRoutingHistory({
      orderId,
      items,
      changes: state.changesByOrderId[orderId] || [],
      movements: state.movementsByPair,
      stock: state.stockByPair,
      facilities,
      facilityTypes,
    }),
    statusFor: (state) => (orderId: string): LoadStatus | undefined => state.statusByOrderId[orderId],
    cutoffFor: (state) => (productStoreId?: string): number | null => (productStoreId && state.cutoffByProductStore[productStoreId]) || null,
  },
  actions: {
    /**
     * Every routing change on an order, oldest first: the moves the timeline already reads, plus the
     * latest unfillable attempts, which the timeline only counts.
     */
    async fetchRoutingChanges(orderId: string): Promise<any[]> {
      const [moves, unfillable] = await Promise.all([
        api({
          url: `oms/orders/${orderId}/facilityChange`,
          method: "GET",
          params: {
            changeReasonEnumId: "UNFILLABLE",
            changeReasonEnumId_op: "in",
            changeReasonEnumId_not: "Y",
            orderByField: "-changeDatetime",
            pageSize: ROUTING_CHANGE_PAGE_SIZE
          }
        }),
        api({
          url: `oms/orders/${orderId}/facilityChange`,
          method: "GET",
          params: { changeReasonEnumId: "UNFILLABLE", orderByField: "-changeDatetime", pageSize: UNFILLABLE_SAMPLE_SIZE }
        })
      ]);

      return [...rowsOf(moves), ...rowsOf(unfillable)]
        .sort((a, b) => (toMillis(a.changeDatetime) ?? 0) - (toMillis(b.changeDatetime) ?? 0));
    },
    /**
     * When the store went live on HotWax inventory: its Shopify shop's newOrderSync.launchDate, the same
     * cut-over the OMS reads. A line fulfilled before it arrives complete and never issues, because its stock
     * left while the old system was authoritative. Null when the store maps to no shop or to several (two
     * shops mean two go-lives, and the OMS resolves none either), or the date is not set.
     *
     * The stored value is a wall clock in the server's zone; it is read in the app's zone, which is close
     * enough to tell an item fulfilled before launch from one fulfilled after.
     */
    async fetchInventoryCutoff(productStoreId: string): Promise<number | null> {
      const shops = rowsOf(await api({ url: "oms/shopifyShops/shops", method: "GET", params: { productStoreId, pageSize: 2 } }));
      if(shops.length !== 1) {return null;}
      const response: any = await api({
        url: "admin/systemProperties",
        method: "GET",
        params: { systemResourceId: shops[0].shopId, systemPropertyId: "newOrderSync.launchDate", pageSize: 1 }
      });
      const properties = rowsOf(response).length ? rowsOf(response) : response?.data?.systemPropertyList || [];

      return toMillis(properties[0]?.systemPropertyValue) ?? null;
    },
    /** Available to promise and on hand for each product at each facility, summed over its inventory items. */
    async fetchLocationStock(pairs: ProductFacilityPair[]): Promise<Record<string, LocationStock>> {
      if(!pairs.length) {return {};}
      const productIds = [...new Set(pairs.map((pair) => pair.productId))];
      const facilityIds = [...new Set(pairs.map((pair) => pair.facilityId))];
      // A product can sit in many inventory items at one facility, so read every page before summing.
      const rows: any[] = [];
      for(let pageIndex = 0; pageIndex < STOCK_PAGE_LIMIT; pageIndex++) {
        const response: any = await api({
          url: "oms/inventoryLogs",
          method: "GET",
          params: {
            productId: productIds.join(","),
            productId_op: "in",
            facilityId: facilityIds.join(","),
            facilityId_op: "in",
            pageIndex,
            pageSize: STOCK_PAGE_SIZE
          }
        });
        const page = rowsOf(response);
        rows.push(...page);
        if(page.length < STOCK_PAGE_SIZE) {break;}
      }

      return sumLocationStock(rows, pairs);
    },
    /**
     * A product's stock movements at one facility, newest first, back to (and including) the last
     * movement before `sinceMillis`, so the stock at that moment can be read from it. Rows are ordered
     * by when they were recorded: external inventory resets carry no effective date.
     */
    async fetchStockMovements(productId: string, facilityId: string, sinceMillis: number): Promise<{ rows: any[]; truncated: boolean }> {
      const rows: any[] = [];
      for(let pageIndex = 0; pageIndex < MOVEMENT_PAGE_LIMIT; pageIndex++) {
        const response: any = await api({
          url: `oms/products/${encodeURIComponent(productId)}/facilities/${encodeURIComponent(facilityId)}/inventoryDetail`,
          method: "GET",
          params: { orderByField: "-createdStamp", pageIndex, pageSize: MOVEMENT_PAGE_SIZE }
        });
        const page = rowsOf(response);
        rows.push(...page);
        const last = page[page.length - 1];
        const oldest = last ? toMillis(last.createdStamp) ?? toMillis(last.effectiveDate) ?? 0 : 0;
        if(page.length < MOVEMENT_PAGE_SIZE || (oldest && oldest < sinceMillis)) {return { rows, truncated: false };}
      }

      return { rows, truncated: true };
    },
    /**
     * Current stock at each item's location, for the warnings on the item and ship group views.
     * `facilities` and `facilityTypes` are the caller's rows, which tell stock locations from virtual ones.
     */
    async fetchItemLocationStock(items: RoutingItem[], facilities: any[], facilityTypes: any[]) {
      const pairs = items
        .filter((item) => item.productId && isStockLocation(item.facilityId, facilities, facilityTypes))
        .map((item) => ({ productId: item.productId, facilityId: item.facilityId }));
      if(!pairs.length) {return;}
      try {
        Object.assign(this.stockByPair, await this.fetchLocationStock(pairs));
      } catch (err) {
        // The warnings are a hint; without stock the page reads as it did before.
        logger.error("Failed to fetch item location stock", err);
      }
    },

    /** The order's items moved (an action here, or routing on the server): read its routing again next time. */
    markStale(orderId: string) {
      stale.add(orderId);
    },

    /** Routing changes, the stock movements behind them, and current stock, for the Routing segment. */
    loadRoutingHistory(orderId: string, items: RoutingItem[], options: LoadRoutingOptions = {}): Promise<void> {
      const { force = false, importedAt, productStoreId, facilities = [], facilityTypes = [] } = options;
      if(!force && !stale.has(orderId) && this.statusByOrderId[orderId] === "loaded") {return Promise.resolve();}
      const running = inFlight.get(orderId);
      // A forced load wants changes newer than the running load has read, so it runs again after it.
      if(running) {return force ? running.then(() => this.loadRoutingHistory(orderId, items, options)) : running;}

      // A reload keeps the routing already shown on screen until the new one is in.
      const reloading = this.statusByOrderId[orderId] === "loaded";
      stale.delete(orderId);
      const load = (async () => {
        if(!reloading) {this.statusByOrderId[orderId] = "loading";}
        try {
          const changes = await this.fetchRoutingChanges(orderId);
          this.changesByOrderId[orderId] = changes;
          const requests = movementRequests(items, changes, facilities, facilityTypes, importedAt);
          if(productStoreId && !(productStoreId in this.cutoffByProductStore)) {
            // Only explains empty timelines, so a failure leaves them unexplained rather than failing the load.
            this.cutoffByProductStore[productStoreId] = await this.fetchInventoryCutoff(productStoreId).catch((err) => {
              logger.error("Failed to read the store's inventory go-live", err);

              return null;
            });
          }
          const pages = await Promise.allSettled(requests.map((request) =>
            this.fetchStockMovements(request.productId, request.facilityId, request.sinceMillis)));
          pages.forEach((page, index) => {
            const request = requests[index];
            if(page.status === "fulfilled") {
              this.movementsByPair[pairKey(request.productId, request.facilityId)] = page.value;
            } else {
              logger.error("Failed to fetch stock movements", request, page.reason);
            }
          });
          const stock = await this.fetchLocationStock(requests.map(({ productId, facilityId }) => ({ productId, facilityId })));
          Object.assign(this.stockByPair, stock);
          this.statusByOrderId[orderId] = "loaded";
        } catch (err) {
          logger.error("Failed to load routing history", err);
          if(reloading) {
            // Keep what is on screen, and read it again on the next visit.
            stale.add(orderId);
          } else {
            this.statusByOrderId[orderId] = "error";
          }
        } finally {
          inFlight.delete(orderId);
        }
      })();
      inFlight.set(orderId, load);

      return load;
    },
  },
  persist: false,
});
