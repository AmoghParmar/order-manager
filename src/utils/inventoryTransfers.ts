const TERMINAL_ITEM_STATUSES = new Set(["ITEM_CANCELLED", "ITEM_COMPLETED"]);

export type InventoryTransferRequest = {
  productId: string;
  quantity: number;
  facilityId: string;
  facilityIdTo: string;
  orderId?: string;
  orderItemSeqId?: string;
  comments?: string;
};

export type RequestInventoryTransfersPayload = {
  transfers: InventoryTransferRequest[];
  requestReferencePrefix: string;
};

export function numericValue(value: unknown) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function inventoryTransferOpenQuantity(item: Record<string, any>) {
  const quantity = numericValue(item.quantity);
  const cancelled = numericValue(item.cancelledQuantity ?? item.cancelQuantity);
  const fulfilled = numericValue(item.fulfilledQuantity ?? item.shippedQuantity);

  return Math.max(quantity - cancelled - fulfilled, 0);
}

export function isInventoryTransferEligibleItem(item: Record<string, any>, isVirtualFacility: boolean) {
  return Boolean(item.productId &&
    !isVirtualFacility &&
    !TERMINAL_ITEM_STATUSES.has(item.statusId) &&
    inventoryTransferOpenQuantity(item) > 0);
}

/** A product's available to promise and on hand at each facility, summed over its inventory log rows. */
export function sumFacilityStock(rows: any[], facilityIds: string[]): Record<string, { atp: number; qoh: number }> {
  const stock: Record<string, { atp: number; qoh: number }> = Object.fromEntries(facilityIds.map((facilityId) => [facilityId, { atp: 0, qoh: 0 }]));
  rows.forEach((row: any) => {
    const entry = stock[row.facilityId];
    if(!entry) {return;}
    entry.atp += numericValue(row.availableToPromiseTotal);
    entry.qoh += numericValue(row.quantityOnHandTotal);
  });

  return stock;
}
