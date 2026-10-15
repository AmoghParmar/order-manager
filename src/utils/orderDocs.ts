import type { Order } from '@/types/order';

export interface OrderSearchResult {
  orders: Order[];
  total: number;
}

export function normalizeOrderDoc(doc: any): Order {
  const orderId = toStringValue(doc.orderId ?? doc.hcOrderId ?? doc.externalId ?? doc.orderName);
  const customerName = toStringValue(doc.customerName) || [doc.customerFirstName, doc.customerLastName]
    .map((value) => toStringValue(value))
    .filter(Boolean)
    .join(' ');

  return {
    id: orderId,
    orderName: toStringValue(doc.orderName),
    externalId: toStringValue(doc.orderName ?? doc.externalOrderId ?? doc.externalId, orderId),
    orderDate: toStringValue(doc.orderDate ?? doc.orderEntryDate),
    status: toStringValue(doc.orderStatusDesc ?? doc.orderStatusId ?? doc.statusId, 'Created') as Order['status'],
    customerId: toStringValue(doc.customerPartyId ?? doc.customerId ?? doc.partyId),
    customerName: customerName || toStringValue(doc.customerPartyName),
    channel: toStringValue(doc.salesChannelDesc ?? doc.salesChannelEnumId ?? doc.productStoreId),
    total: toNumberValue(doc.grandTotal),
    currency: toStringValue(doc.currencyUom ?? doc.presentmentCurrencyUom, 'USD'),
    paymentStatus: toStringValue(doc.paymentStatus ?? doc.paymentStatusDesc),
    fulfillmentStatus: toStringValue(doc.fulfillmentStatus ?? doc.orderStatusDesc ?? doc.orderStatusId ?? doc.statusId),
    deliveryMethod: toStringValue(doc.shipmentMethodDesc ?? doc.shipmentMethodTypeId),
    carrierPartyId: toStringValue(doc.carrierPartyId),
    priority: toStringValue(doc.priority ?? doc.orderStatusDesc ?? doc.orderStatusId ?? doc.statusId),
    shippingAddress1: toStringValue(doc.shippingAddress1 ?? doc.address1),
    shippingCity: toStringValue(doc.shippingCity ?? doc.city),
    shippingStateProvinceGeoId: toStringValue(doc.shippingStateProvinceGeoId ?? doc.stateProvinceGeoId),
    shippingPostalCode: toStringValue(doc.shippingPostalCode ?? doc.postalCode),
    shippingCountryGeoId: toStringValue(doc.shippingCountryGeoId ?? doc.countryGeoId),
    estimatedDeliveryDate: toStringValue(doc.estimatedDeliveryDate ?? doc.promisedDatetime),
    promisedDatetime: toStringValue(doc.promisedDatetime),
    shipBeforeDate: toStringValue(doc.shipBeforeDate),
    shipByDate: toStringValue(doc.shipByDate),
    queueReason: toStringValue(doc.rejectionReasonDesc ?? doc.rejectionReason ?? doc.rejectionReasonId),
    rejectionReason: toStringValue(doc.rejectionReason ?? doc.rejectionReasonDesc ?? doc.rejectionReasonId),
    ruleName: toStringValue(doc.ruleName ?? doc.routingRuleName ?? doc.facilityRuleName),
    items: [],
    shipmentIds: toStringList(doc.shipmentId ?? doc.primaryShipmentId),
    returnIds: toStringList(doc.returnId ?? doc.primaryReturnId),
    notes: [],
    history: []
  };
}

export function allDocs(data: any) {
  const docs = data?.entityValueList ?? data?.rows ?? data?.docs ?? data?.response?.docs ?? data ?? [];
  return Array.isArray(docs) ? docs : [];
}

export function toStringValue(value: any, fallback = '') {
  const candidate = firstValue(value);
  return candidate === undefined || candidate === null ? fallback : String(candidate);
}

export function toNumberValue(value: any, fallback = 0) {
  const parsed = Number(firstValue(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringList(value: any) {
  if (value === undefined || value === null || value === '') return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean).map(String);
}

function firstValue(value: any) {
  return Array.isArray(value) ? value[0] : value;
}
