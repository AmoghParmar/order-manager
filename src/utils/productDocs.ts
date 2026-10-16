// Imported by the sync worker's product domain as well as the app: keep it free of `@common`,
// stores and anything else that pulls in `vue`.

export interface ProductIdentification {
  type: string;
  value: string;
}

/** A row of the app db's `products` table (see db/orderManagerSchema.ts). */
export interface CachedProduct {
  productId: string;
  productName: string;
  sku: string;
  parentProductName: string;
  internalName: string;
  mainImageUrl: string;
  productFeatures: string[];
  groupId: string;
  groupName: string;
  primaryProductCategoryName: string;
  title: string;
  goodIdentifications: ProductIdentification[];
  /** When the product domain stored it, in epoch millis. */
  syncedAt?: number;
}

/** A product row older than this is refetched the next time a screen shows it. */
export const PRODUCT_STALE_MS = 24 * 60 * 60 * 1000;

/** Product ids per Solr query. */
export const PRODUCT_BATCH_SIZE = 200;

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
    goodIdentifications
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
