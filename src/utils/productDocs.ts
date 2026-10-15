import type { CachedProduct, ProductIdentification } from "@/db/productDb";

// Every field Settings > Product identifier can point at: the static options from
// productStore.prepareProductIdentifierOptions plus goodIdentifications, which carries the
// fetched types (UPC and friends). A field missing here silently resolves to a call site's
// fallback, so the operator's choice would be honoured for some options and not others.
export const PRODUCT_FIELDS = "productId productName parentProductName internalName groupId groupName primaryProductCategoryName title goodIdentifications mainImageUrl productFeatures";

function escapeSolrValue(value: string) {
  return String(value).replace(/([\\+\-!(){}[\]^"~*?:]|&&|\|\|)/g, "\\$1");
}

export function parseGoodIdentifications(raw: any): ProductIdentification[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((identification: any) => {
    if (typeof identification === "string") {
      const slash = identification.indexOf("/");
      return slash === -1
        ? { type: "", value: identification.trim() }
        : { type: identification.slice(0, slash).trim(), value: identification.slice(slash + 1).trim() };
    }
    return { type: String(identification?.type || "").trim(), value: String(identification?.value || "").trim() };
  });
}

export function mapDocToProduct(doc: any): CachedProduct {
  const goodIdentifications = parseGoodIdentifications(doc.goodIdentifications);
  const sku = doc.sku || goodIdentifications.find((identification) => identification.type === "SKU")?.value || "";
  return {
    productId: doc.productId,
    productName: doc.productName || "",
    sku,
    parentProductName: doc.parentProductName || "",
    internalName: doc.internalName || "",
    mainImageUrl: doc.mainImageUrl || "",
    productFeatures: Array.isArray(doc.productFeatures) ? doc.productFeatures : [],
    groupId: doc.groupId || "",
    groupName: doc.groupName || "",
    primaryProductCategoryName: doc.primaryProductCategoryName || "",
    title: doc.title || "",
    goodIdentifications,
    updatedAt: Date.now()
  };
}

export function buildProductQuery(productIds: string[]) {
  return {
    json: {
      params: {
        rows: productIds.length,
        start: 0,
        "q.op": "AND",
        fl: PRODUCT_FIELDS
      } as Record<string, any>,
      query: "*:*",
      filter: ["docType:PRODUCT", `productId:(${productIds.map(escapeSolrValue).join(" OR ")})`]
    }
  };
}

/**
 * A product persisted before a field joined PRODUCT_FIELDS has no such key at all, and the
 * never-refetch rule would strand it incomplete forever. Treat a missing key as a miss so it
 * heals exactly once; an empty value is a real answer and stays cached. Add a key here
 * whenever PRODUCT_FIELDS grows.
 */
const CACHED_IDENTITY_KEYS = [
  "productFeatures",
  "groupId",
  "groupName",
  "primaryProductCategoryName",
  "title"
] as const;

export function isFullyCached(product?: CachedProduct): boolean {
  return !!product && CACHED_IDENTITY_KEYS.every((key) => key in product);
}
