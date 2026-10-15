import { ref } from "vue";
import { commonUtil } from "@common";
import { useProductCacheStore, type CachedProduct } from "@/store/productCache";
import { useProductStore } from "@/store/productStore";

/**
 * Product master — fetch rich product data (name, SKU, image) from Solr, cached per
 * productId and NEVER refetched once cached. The order detail page is the first consumer.
 *
 * This mirrors inventory-count/src/composables/useProductMaster.ts. Same public API; the
 * fetching and caching live in the productCache store, which stores call directly.
 */

const cacheReady = ref(false);
const staleMs = ref(24 * 60 * 60 * 1000);

function init(opts?: { staleMs?: number }) {
  if (opts?.staleMs !== undefined) staleMs.value = opts.staleMs;
  cacheReady.value = true;
}

/** Fetch products from Solr in batches. Does not touch the cache. */
function getByIds(productIds: string[]): Promise<CachedProduct[]> {
  return useProductCacheStore().fetchByIds(productIds);
}

/** Fetch only the productIds not already cached, then store them. The never-refetch path. */
function prefetch(productIds: string[]) {
  return useProductCacheStore().prefetch(productIds);
}

/** Cache-first single lookup. */
function getById(productId: string, opts?: { refresh?: boolean }) {
  return useProductCacheStore().getById(productId, opts);
}

function upsertFromApi(docs: any[]) {
  useProductCacheStore().upsertDocs(docs);
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
  return { init, getById, getByIds, prefetch, upsertFromApi, cacheReady, primaryId, secondaryId };
}
