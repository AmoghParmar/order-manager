/**
 * Product master from Solr (class C): fetched when a screen shows a product, never polled.
 *
 * `refreshAfterMutation("product", { productIds })` asks for any number of ids. Only the ones the
 * table lacks, or holds for longer than PRODUCT_STALE_MS, are fetched, so a screen can ask for every
 * product it shows without refetching what is already fresh. `force: true` refetches them all.
 */

import { defineSyncDomain } from "@common/db/sync/defineSyncDomain";
import { workerPost } from "@common/core/workerRemoteApi";
import { orderManagerDb } from "@/db/orderManagerDb";
import {
  buildProductQuery,
  mapDocToProduct,
  PRODUCT_BATCH_SIZE,
  PRODUCT_STALE_MS,
  type CachedProduct
} from "@/utils/productDocs";

const products = orderManagerDb.entity<CachedProduct>(orderManagerDb.tables.products);

/** The ids a refetch asks for: `productIds`, or a single `productId`. */
function requestedIds(pk: Record<string, unknown>): string[] {
  const ids = Array.isArray(pk?.productIds) ? pk.productIds : [pk?.productId];
  return [...new Set(ids.map((id) => String(id ?? "")).filter(Boolean))];
}

export const productDomain = defineSyncDomain({
  name: "product",
  table: "products",
  label: "Products",
  syncClass: "C",
  async sync() { return 0; },
  async refetchOne(ctx, pk) {
    const ids = requestedIds(pk);
    if (!ids.length) return 0;

    let due = ids;
    if (!pk?.force) {
      const now = Date.now();
      const fresh = new Set((await products.getMany(ids))
        .filter((row) => now - Number(row.syncedAt ?? 0) < PRODUCT_STALE_MS)
        .map((row) => row.productId));
      due = ids.filter((id) => !fresh.has(id));
    }

    let written = 0;
    let failure: unknown = null;
    for (let index = 0; index < due.length; index += PRODUCT_BATCH_SIZE) {
      const batch = due.slice(index, index + PRODUCT_BATCH_SIZE);
      try {
        // Maarg's Solr route: the bare Solr JSON in, the Solr answer nested under `response` out.
        const resp = await workerPost(ctx, "admin/search/query", buildProductQuery(batch).json);
        const docs: any[] = resp?.response?.response?.docs ?? resp?.response?.docs ?? [];
        const rows = docs.map(mapDocToProduct).filter((row) => row.productId);
        if (rows.length) written += await products.upsertMany(rows as unknown as Array<Record<string, unknown>>);
      } catch (error) {
        // Keep going: one failed batch must not cost the others their products.
        failure = error;
      }
    }
    if (failure) throw failure;
    return written;
  },
});
