import { computed, effectScope, getCurrentScope, onScopeDispose, type EffectScope, type Ref } from "vue";
import { commonUtil, logger, useLiveEntity, useSolrSearch } from "@common";
import { onSessionCleared } from "@common/core/sessionScope";
import { orderManagerDb } from "@/db/orderManagerDb";
import { refreshAfterMutation } from "@/db/appDbSync";
import { useProductStore } from "@/store/productStore";
import { buildProductQuery, mapDocToProduct, PRODUCT_BATCH_SIZE, PRODUCT_STALE_MS, type CachedProduct } from "@/utils/productDocs";

export type { CachedProduct };

/**
 * Product master — rich product data (name, SKU, image, identifiers) for rows that carry only a
 * productId. The app db's `products` table holds it (filled from Solr by the worker's `product`
 * domain, kept across logout); this composable reads it live and asks for what it lacks.
 *
 * `getProduct(id)` is safe to call from a template on every render: it answers from the table and
 * queues the id, and the queued ids go to the worker in one batch. The worker fetches only the ones
 * missing or older than PRODUCT_STALE_MS, and the live read shows them once stored.
 */

/** One live read of the table, shared by every mounted user and closed when the last unmounts. */
let reader: { scope: EffectScope; byId: Ref<Map<string, CachedProduct>> } | null = null;
let readers = 0;

function openReader() {
  if (!reader) {
    const scope = effectScope(true);
    const byId = scope.run(() => {
      const { records } = useLiveEntity<CachedProduct>(orderManagerDb.tables.products);
      return computed(() => new Map(records.value.map((product) => [product.productId, product])));
    })!;
    reader = { scope, byId };
  }
  readers += 1;
}

function closeReader() {
  readers -= 1;
  if (readers > 0 || !reader) return;
  reader.scope.stop();
  reader = null;
  readers = 0;
}

/**
 * When each id was last sent to the worker. The worker decides what is stale; this only keeps a
 * re-rendering screen from asking again for an id it asked for within PRODUCT_STALE_MS.
 */
const askedAt = new Map<string, number>();
const queued = new Set<string>();

onSessionCleared(() => {
  askedAt.clear();
  queued.clear();
});

/** Ask the worker for the products a screen shows. Resolves once they are stored; never rejects. */
async function prefetch(productIds: Array<string | null | undefined>): Promise<void> {
  const now = Date.now();
  const due = [...new Set(productIds.filter(Boolean) as string[])]
    .filter((productId) => now - (askedAt.get(productId) ?? -Infinity) >= PRODUCT_STALE_MS);
  if (!due.length) return;

  due.forEach((productId) => askedAt.set(productId, now));
  try {
    await refreshAfterMutation("product", { productIds: due });
  } catch (error) {
    // Let the next render ask again rather than wait out PRODUCT_STALE_MS.
    due.forEach((productId) => askedAt.delete(productId));
    logger.error("Failed to fetch products", error);
  }
}

function queue(productId: string) {
  if (askedAt.has(productId) && Date.now() - askedAt.get(productId)! < PRODUCT_STALE_MS) return;
  if (!queued.size) {
    queueMicrotask(() => {
      const ids = [...queued];
      queued.clear();
      void prefetch(ids);
    });
  }
  queued.add(productId);
}

/** The stored product, or undefined until it is fetched (or when Solr has none). */
function getProduct(productId?: string | null): CachedProduct | undefined {
  if (!productId) return undefined;
  queue(productId);
  return reader?.byId.value.get(productId);
}

/** Fetch products from Solr without storing them, for a picker that shows search results as-is. */
async function getByIds(productIds: string[]): Promise<CachedProduct[]> {
  const ids = [...new Set(productIds.filter(Boolean))];
  const products: CachedProduct[] = [];
  for (let index = 0; index < ids.length; index += PRODUCT_BATCH_SIZE) {
    try {
      const resp = await useSolrSearch().runSolrQuery(buildProductQuery(ids.slice(index, index + PRODUCT_BATCH_SIZE)));
      if (commonUtil.hasError(resp)) {
        logger.error("Product Solr query returned an error", resp.data);
        continue;
      }
      products.push(...(resp.data?.response?.docs || []).map(mapDocToProduct));
    } catch (error) {
      logger.error("Product Solr query failed", error);
    }
  }
  return products;
}

/**
 * Product identity — the display name and secondary line the operator chose in
 * Settings > Product identifier. Every surface that names a product for an order, return or
 * swap reads it through here instead of hardcoding a field, so a store that identifies goods
 * by internalName or parentProductName gets that everywhere, not only in the views that
 * happened to be written against it.
 *
 * `product` is whatever identity-bearing object the row has: a CachedProduct, a denormalized
 * order/return/swap item, or nothing yet. commonUtil.getProductIdentificationValue throws on
 * undefined, so this normalizes first and callers never guard it themselves.
 *
 * `fallbacks` are the call site's own denormalized fields, used only when the preferred
 * identifier has no value here — before the cache warms, or for a custom line with no catalog
 * product at all. The list is per-call because what a row can fall back on genuinely differs:
 * a Shopify custom line has its own title, a return item its description.
 */
function resolveIdentity(idKey: string, product: any, fallbacks: Array<string | null | undefined>): string {
  const preferred = commonUtil.getProductIdentificationValue(idKey, product || {});
  return preferred || fallbacks.find((candidate) => !!candidate) || "";
}

function primaryId(product: any, fallbacks: Array<string | null | undefined> = []): string {
  return resolveIdentity(useProductStore().getProductIdentificationPref.primaryId, product, fallbacks);
}

function secondaryId(product: any, fallbacks: Array<string | null | undefined> = []): string {
  return resolveIdentity(useProductStore().getProductIdentificationPref.secondaryId, product, fallbacks);
}

export function useProductMaster() {
  // In a component (or effect scope), hold the shared live read open until it unmounts. Outside one,
  // getProduct answers from a read another component holds, if any.
  if (getCurrentScope()) {
    openReader();
    onScopeDispose(closeReader);
  }
  return { getProduct, getByIds, prefetch, primaryId, secondaryId };
}
