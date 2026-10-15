import { defineStore } from "pinia";
import { commonUtil, cookieHelper, logger, useSolrSearch } from "@common";
import { getProductDb, type CachedProduct, type ProductIdentification } from "@/db/productDb";
import { buildProductQuery, isFullyCached, mapDocToProduct } from "@/utils/productDocs";

export type { CachedProduct, ProductIdentification };

const omsInstance = () => cookieHelper().get("oms") || "";
const BATCH_SIZE = 200;

/**
 * Product cache — the app's single source of rich product data.
 *
 * Two layers:
 *  - a reactive in-memory mirror (`byId`) so the UI can read products synchronously and
 *    re-render reactively;
 *  - a multi-tenant Dexie DB (`${oms}-CommonDB`, see db/productDb.ts) that persists
 *    the cache per OMS across sessions, so a product is never fetched twice.
 *
 * The mirror is hydrated from Dexie once per OMS and is the source for synchronous reads.
 * Components go through useProductMaster; stores call prefetch / getById here.
 */
export const useProductCacheStore = defineStore("productCache", {
  state: () => ({
    byId: {} as Record<string, CachedProduct>,
    hydratedOms: ""
  }),
  getters: {
    getProduct: (state) => (productId: string) => state.byId[productId],
    has: (state) => (productId: string) => Boolean(state.byId[productId])
  },
  actions: {
    /** Load this OMS's cached products from Dexie into the reactive mirror (once per OMS). */
    async ensureHydrated() {
      const oms = omsInstance();
      if (!oms || this.hydratedOms === oms) return;
      try {
        const records = await getProductDb(oms).products.toArray();
        records.forEach((record) => {
          this.byId[record.productId] = record;
        });
        this.hydratedOms = oms;
      } catch (error) {
        logger.error("Failed to hydrate product cache from Dexie", error);
      }
    },
    /** Update the reactive mirror (synchronously, for the UI) and persist to Dexie. */
    async upsert(products: CachedProduct[]) {
      products.forEach((product) => {
        if (product.productId) this.byId[product.productId] = product;
      });
      const oms = omsInstance();
      if (!oms) return;
      try {
        await getProductDb(oms).products.bulkPut(products.filter((product) => product.productId));
      } catch (error) {
        logger.error("Failed to persist products to Dexie", error);
      }
    },
    /** Fetch products from Solr in batches. Does not touch the cache. */
    async fetchByIds(productIds: string[]): Promise<CachedProduct[]> {
      const ids = [...new Set(productIds.filter(Boolean))];
      if (!ids.length) return [];

      const products: CachedProduct[] = [];
      for (let index = 0; index < ids.length; index += BATCH_SIZE) {
        const batch = ids.slice(index, index + BATCH_SIZE);
        try {
          const resp = await useSolrSearch().runSolrQuery(buildProductQuery(batch));
          if (commonUtil.hasError(resp)) {
            logger.error("Product Solr query returned an error", resp.data);
            continue;
          }
          const docs = resp.data?.response?.docs || [];
          products.push(...docs.map(mapDocToProduct));
        } catch (error) {
          logger.error("Product Solr query failed", error);
        }
      }
      return products;
    },
    /** Fetch only the productIds not already cached, then store them. The never-refetch path. */
    async prefetch(productIds: string[]) {
      await this.ensureHydrated(); // pull this OMS's persisted products from Dexie first
      const idsToFetch = [...new Set(productIds.filter(Boolean))].filter((id) => !isFullyCached(this.getProduct(id)));
      if (!idsToFetch.length) return;

      const products = await this.fetchByIds(idsToFetch);
      if (products.length) await this.upsert(products);
    },
    /** Cache-first single lookup. */
    async getById(productId: string, opts?: { refresh?: boolean }) {
      await this.ensureHydrated();
      const existing = this.getProduct(productId);
      if (isFullyCached(existing) && !opts?.refresh) return { product: existing, status: "hit" as const };

      const products = await this.fetchByIds([productId]);
      if (products.length) {
        await this.upsert(products);
        return { product: this.getProduct(productId), status: existing ? ("refreshed" as const) : ("miss-refreshed" as const) };
      }
      return { product: existing, status: existing ? ("stale" as const) : ("miss" as const) };
    },
    /** Store product docs a caller already fetched, in the cache's shape. */
    upsertDocs(docs: any[]) {
      return this.upsert(docs.map(mapDocToProduct));
    },
    /** Logout: clear the in-memory mirror only. Dexie data persists (multi-tenant). */
    reset() {
      this.byId = {};
      this.hydratedOms = "";
    }
  },
  persist: false
});
