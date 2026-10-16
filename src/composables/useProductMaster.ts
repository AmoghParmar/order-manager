import { commonUtil, logger, useSolrSearch } from "@common";
import {
  buildProductQuery,
  mapDocToProduct,
  PRODUCT_BATCH_SIZE,
  useProductMaster as useFrameworkProductMaster,
  type ProductRow
} from "@common/db";
import { refreshAfterMutation } from "@/db/appDbSync";
import { useProductStore } from "@/store/productStore";

/**
 * Product master — rich product data (name, SKU, image, identifiers) for rows that carry only a
 * productId. The framework's `useProductMaster` reads the app db's `products` table and asks the
 * worker for what it lacks; this adds Order Manager's naming (the Settings product identifier) and
 * an unstored Solr lookup for pickers.
 */

/** Fetch products from Solr without storing them, for a picker that shows search results as-is. */
async function getByIds(productIds: string[]): Promise<ProductRow[]> {
  const ids = [...new Set(productIds.filter(Boolean))];
  const products: ProductRow[] = [];
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
 * `product` is whatever identity-bearing object the row has: a ProductRow, a denormalized
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
  const { getProduct, prefetch } = useFrameworkProductMaster({ refreshAfterMutation });
  return { getProduct, getByIds, prefetch, primaryId, secondaryId };
}
