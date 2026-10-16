/**
 * Order Manager's own tables, merged with the common seed schema in `orderManagerDb.ts`.
 *
 * Deep imports only: the sync worker imports this file.
 */

import { defineEntity } from "@common/db/schema/defineEntity";
import { defineSchema } from "@common/db/schema/defineSchema";

export const orderManagerSchema = defineSchema({
  /**
   * Product master from Solr, fetched when a screen shows a product (the `product` domain, class C).
   * The catalog is the same for every user of the instance, so it survives logout; a row older than
   * PRODUCT_STALE_MS is refetched the next time it is shown.
   */
  products: defineEntity({
    primaryKey: "productId",
    fields: {
      productId: "text",
      productName: "text",
      sku: "text",
      parentProductName: "text",
      internalName: "text",
      mainImageUrl: "text",
      /** Solr `productFeatures` verbatim: `"SIZE/M"`-style entries, empty when the variant has none. */
      productFeatures: ["text"],
      // The remaining static identifiers Settings > Product identifier offers
      // (productStore.prepareProductIdentifierOptions).
      groupId: "text",
      groupName: "text",
      primaryProductCategoryName: "text",
      title: "text",
      goodIdentifications: [{ type: "text", value: "text" }],
    },
    retainOnLogout: true,
  }),
});
