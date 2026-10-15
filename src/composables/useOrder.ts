import { commonUtil, translate } from '@common';
import { useSeedData } from '@common/db';
import type { SortRule } from '@/services/fulfillmentSync';
import { summarizeBrokeredFacilities } from '@/services/order';
import { useCustomerStore } from '@/store/customer';
import { useOrderStore } from '@/store/order';
import { isVirtualFacilityId, useOrderDetailStore } from '@/store/orderDetail';
import { useProductCacheStore } from '@/store/productCache';
import type { WorkflowBucket, WorkflowOrder } from '@/types/customerService';
import type {
  EnrichedItemGroup,
  EnrichedOrder,
  EnrichedOrderItem,
  EnrichedOrderPayments,
  EnrichedShipGroup,
  EnrichedShippingAddress,
  EnrichedTransfer,
} from '@/types/orderDetail';
import { sentimentCounts } from '@/utils';
import { toMillis } from '@/utils/format';
import { rollUpItemStatuses } from '@/utils/itemStatusBadges';
import { OrderActionValidator } from '@/utils/OrderActionValidator';
import { adjustmentAmount, adjustmentKey, adjustmentLabel } from '@/utils/orderAdjustments';
import {
  PHONE_PURPOSES,
  contactInfoString,
  contactPostalAddress,
  contactTelecomNumber,
  findContact,
  formatTelecomNumber,
  isPosCompletedShipGroup,
  itemIssuance,
  numeric,
  orderAttributeRows,
  type EnrichmentAuxiliaryData,
} from '@/utils/orderDetailEnrichment';
import { buildOrderEvents, shipGroupMilestones, type OrderEvent } from '@/utils/orderEvents';
import { shipGroupItemStates } from '@/utils/shipGroupItemStates';
import { toWorkflowOrderRowViewModel } from '@/utils/orderRows';

const SORT_PARAM_ENUM_TYPE = 'PP_SORT_PARAM_TYPE';
// Header-level adjustments carry this as their orderItemSeqId.
const HEADER_SEQ_ID = '_NA_';

type GroupAdjustment = { label: string; amount: number; isIncluded: boolean };

const PAYMENT_COLLECTED_STATUSES = new Set(['PAYMENT_AUTHORIZED', 'PAYMENT_SETTLED', 'PAYMENT_RECEIVED']);
const OPEN_TRANSFER_STATUSES = new Set(['IXF_REQUESTED', 'IXF_SCHEDULED', 'IXF_EN_ROUTE']);
const TRANSFER_SOURCE_LABELS: Record<string, string> = {
  REGIONAL_BROKER: 'Regional brokering',
  ORDER_MANAGER: 'Order Manager',
  TRANSFERS_APP: 'Transfers app',
};

/**
 * Order data from the Pinia stores joined with the local seed tables: the workflow queues (Open,
 * In flight, Packed), the Funnel, and the order page. The stores keep raw server data; labels and
 * joins over the seed tables happen here, through this composable's live `useSeedData()`, so they
 * follow the tables as they sync.
 */
export function useOrder() {
  const orderStore = useOrderStore();
  const orderDetailStore = useOrderDetailStore();
  const productCache = useProductCacheStore();
  const seed = useSeedData();

  /** A workflow bucket's order row: the stored row and its Solr enrichment, with its shipment method's label. */
  function workflowOrderRow(bucket: WorkflowBucket, order: WorkflowOrder) {
    return toWorkflowOrderRowViewModel(
      order,
      orderStore.workflowEnrichment(bucket, order.orderId),
      seed.shipmentMethodDescription(order.shippingMethodTypeId)
    );
  }

  /** A sort rule's label: its sort parameter enum's description, else the field name. */
  function sortRuleName(fieldName: string) {
    return seed.enumsByType(SORT_PARAM_ENUM_TYPE).find((e: any) => e.enumCode === fieldName)?.description || fieldName;
  }

  /** The sort parameters not already used by `sortRules`. */
  function availableSortOptions(sortRules: SortRule[]) {
    const currentIds = sortRules.map((rule) => rule.id);

    return seed.enumsByType(SORT_PARAM_ENUM_TYPE).filter((e: any) => !currentIds.includes(e.enumCode));
  }

  const adjustmentDisplayLabel = (adj: any) =>
    adjustmentLabel(adj, seed.orderAdjustmentTypeDescription, 'OTHER_ADJUSTMENT');

  const adjustmentUniqueKey = (adj: any, fallbackSeqId = '') =>
    adjustmentKey(adj, adjustmentDisplayLabel(adj), fallbackSeqId);

  /**
   * Subtotal, adjustments grouped by label, and grand total. Sums the rows actually displayed
   * (subtotal + every adjustment, including tax) rather than trusting the backend's grandTotal,
   * which has been observed to exclude tax. Rounded to avoid floating-point drift
   * (e.g. 59 + 1.53 + 0.59 + 2.86 = 63.980000000000004).
   */
  function orderTotals(orderId: string) {
    const order = orderDetailStore.byOrderId[orderId]?.payload;
    if (!order) return { subtotal: 0, adjustments: {}, total: 0, includedAdjustments: {} };

    let subtotal = 0;
    (order.shipGroups || []).forEach((sg: any) => {
      (sg.items || []).forEach((item: any) => {
        subtotal += Number(item.unitPrice || 0) * Number(item.quantity || 0);
      });
    });

    const adjustments: Record<string, number> = {};
    const includedAdjustments: Record<string, number> = {};
    let adjustmentsTotal = 0;
    const seenAdjustments = new Set<string>();

    const recordAdjustment = (adj: any, fallbackSeqId = '') => {
      const uniqueKey = adjustmentUniqueKey(adj, fallbackSeqId);
      if (seenAdjustments.has(uniqueKey)) return;
      seenAdjustments.add(uniqueKey);

      adjustmentsTotal += Number(adj.amount || 0);
      const { amount, isIncluded } = adjustmentAmount(adj);
      const label = adjustmentDisplayLabel(adj);

      // Included and excluded amounts stay in separate buckets: a label can carry both
      // (an included tax on one item, an ordinary one on another), and merging them would
      // label the ordinary amount "included" while it still adds to the grand total.
      const bucket = isIncluded ? includedAdjustments : adjustments;
      bucket[label] = (bucket[label] || 0) + amount;
    };

    (order.adjustments || []).forEach((adj: any) => recordAdjustment(adj));
    (order.shipGroups || []).forEach((sg: any) => {
      (sg.items || []).forEach((item: any) => {
        (item.adjustments || []).forEach((adj: any) => recordAdjustment(adj, item.orderItemSeqId));
      });
    });

    // Filter out zero-sum adjustments
    [adjustments, includedAdjustments].forEach((bucket) => {
      Object.keys(bucket).forEach((key) => {
        if (bucket[key] === 0) delete bucket[key];
      });
    });

    const computedTotal = Math.round((subtotal + adjustmentsTotal) * 100) / 100;
    return { subtotal, adjustments, total: computedTotal || order.grandTotal || 0, includedAdjustments };
  }

  /**
   * Adjustments grouped by orderItemExternalId, summing their amounts. Inclusion is carried
   * as metadata rather than baked into the label so the view can translate it at render time,
   * and so an included and an ordinary adjustment sharing a label stay separate rows.
   */
  function adjustmentsByExternalId(orderId: string): Record<string, GroupAdjustment[]> {
    const current = orderDetailStore.orderById(orderId);
    const index: Record<string, Record<string, GroupAdjustment>> = {};
    const seqIdToExtId = orderDetailStore.itemExternalIdBySeqIdByOrderId(orderId);
    const seenAdjustments = new Set<string>();

    const recordAdj = (seqId: string, adj: any) => {
      const extId = seqIdToExtId[seqId] || seqId;
      if (!extId) return;
      const uniqueKey = `${extId}:${adjustmentUniqueKey(adj, seqId)}`;
      if (seenAdjustments.has(uniqueKey)) return;
      seenAdjustments.add(uniqueKey);

      const { amount, isIncluded } = adjustmentAmount(adj);
      const label = adjustmentDisplayLabel(adj);
      const bucketKey = isIncluded ? `${label}\u0000included` : label;
      const buckets = index[extId] ||= {};
      const bucket = buckets[bucketKey] ||= { label, amount: 0, isIncluded };
      bucket.amount += amount;
    };

    // 1. Top-level adjustments carry their orderItemSeqId
    (current?.adjustments || []).forEach((adj: any) => {
      const seqId = adj.orderItemSeqId;
      if (seqId && seqId !== HEADER_SEQ_ID) recordAdj(seqId, adj);
    });

    // 2. Adjustments nested under each ship group item
    (current?.shipGroups || []).forEach((sg: any) => {
      (sg.items || []).forEach((item: any) => {
        const seqId = item.orderItemSeqId;
        if (seqId) (item.adjustments || []).forEach((adj: any) => recordAdj(seqId, adj));
      });
    });

    return Object.fromEntries(
      Object.entries(index).map(([extId, buckets]) => [extId, Object.values(buckets)])
    );
  }

  /**
   * The order's history as typed events, oldest first: the OrderStatus rows on the order
   * document plus the facility changes, unfillable attempts, fulfillment dates, returns and
   * exchanges loaded beside it. See utils/orderEvents.
   */
  function orderEvents(orderId: string): OrderEvent[] {
    return buildOrderEvents({
      order: orderDetailStore.byOrderId[orderId]?.payload || null,
      facilityChanges: orderDetailStore.facilityChangesByOrderId[orderId] || [],
      facilityChangesLoaded: Array.isArray(orderDetailStore.facilityChangesByOrderId[orderId]),
      facilityChangesTruncated: !!orderDetailStore.facilityChangesTruncatedByOrderId[orderId],
      unfillable: orderDetailStore.unfillableByOrderId[orderId] || null,
      fulfillment: orderDetailStore.fulfillmentTimelineByOrderId[orderId] || [],
      returnHeadersById: orderDetailStore.returnHeadersById,
      exchangeChildren: orderDetailStore.exchangeChildrenByOrderId[orderId] || [],
      isVirtualFacility: (facilityId: string) => isVirtualFacilityId(facilityId, seed.facilities(), seed.facilityTypes()),
    });
  }

  function addressLines(postalAddress: any): string[] {
    if (!postalAddress) return [];
    return [
      postalAddress.toName,
      postalAddress.address1,
      postalAddress.address2,
      [postalAddress.city, seed.geoName(postalAddress.stateProvinceGeoId), postalAddress.postalCode].filter(Boolean).join(', '),
      seed.geoName(postalAddress.countryGeoId),
    ].filter(Boolean) as string[];
  }

  function shippingAddress(mech: any): EnrichedShippingAddress | null {
    const addr = mech?.postalAddress;
    if (!addr) return null;
    const lat = numeric(addr.latitude);
    const lon = numeric(addr.longitude);
    return {
      contactMechId: mech.contactMechId || '',
      postalAddress: addr,
      lines: addressLines(addr),
      view: {
        name: addr.toName || '',
        street: [addr.address1, addr.address2].filter(Boolean).join(', '),
        locality: [addr.city, addr.postalCode, seed.geoName(addr.stateProvinceGeoId), seed.geoName(addr.countryGeoId)].filter(Boolean).join(', '),
      },
      coordinates: lat !== undefined && lon !== undefined ? { lat, lon } : null,
      postalCode: String(addr.postalCode || '').trim(),
    };
  }

  /** An order item's inventory transfers, newest first, with facility names, status and source resolved. */
  function itemTransfers(orderItemSeqId: string, rows: any[]): EnrichedTransfer[] {
    return rows
      .filter((row: any) => row.orderItemSeqId === orderItemSeqId)
      .map((row: any) => ({
        id: row.inventoryTransferId,
        statusId: row.statusId,
        status: seed.statusDescription(row.statusId),
        isOpen: OPEN_TRANSFER_STATUSES.has(row.statusId),
        fromFacilityId: row.facilityId,
        fromFacilityName: seed.facilityName(row.facilityId),
        toFacilityId: row.facilityIdTo,
        toFacilityName: seed.facilityName(row.facilityIdTo),
        quantity: Number(row.quantity || 0),
        requestedDate: toMillis(row.createdStamp),
        sourceLabel: row.sourceId ? translate(TRANSFER_SOURCE_LABELS[row.sourceId] || row.sourceId) : '',
        comments: row.comments || '',
        reason: row.statusReasonEnumId ? seed.enumDescription(row.statusReasonEnumId) : '',
      }))
      .sort((left, right) => (right.requestedDate || 0) - (left.requestedDate || 0));
  }

  function itemAdjustmentSummaries(raw: any, rawItem: any): Array<{ comment: string; amount: number }> {
    const orderItemSeqId = rawItem.orderItemSeqId;
    const totals: Record<string, number> = {};
    const seen = new Set<string>();

    [
      ...(raw.adjustments || []).filter((adj: any) => adj.orderItemSeqId === orderItemSeqId),
      ...(rawItem.adjustments || []),
    ].forEach((adj: any) => {
      const label = adjustmentLabel(adj, seed.orderAdjustmentTypeDescription, translate('Adjustment'));
      const key = adjustmentKey(adj, label, orderItemSeqId);
      if (seen.has(key)) return;
      seen.add(key);

      const { amount, isIncluded } = adjustmentAmount(adj);
      if (amount === 0) return;
      const comment = isIncluded ? translate('{label} (included)', { label }) : label;
      totals[comment] = (totals[comment] || 0) + amount;
    });

    return Object.entries(totals)
      .filter(([, amount]) => amount !== 0)
      .map(([comment, amount]) => ({ comment, amount }));
  }

  function enrichShipGroup(
    sg: any,
    raw: any,
    aux: EnrichmentAuxiliaryData,
    context: { contactMechsById: Record<string, any>; shippingLocation: any }
  ): EnrichedShipGroup {
    const facilityTypeId = seed.facility(sg.facilityId)?.facilityTypeId;
    const isVirtual = OrderActionValidator.isVirtualFacility({
      facilityId: sg.facilityId,
      facilityTypeId,
      facilityParentTypeId: seed.facilityType(facilityTypeId)?.parentTypeId,
    });
    const isPosCompleted = isPosCompletedShipGroup(sg);
    const { total, fulfilled, settled } = shipGroupItemStates(sg.items);
    // The same events the timeline shows date this group's brokered → pick → pack → ship steps.
    const lifecycle = shipGroupMilestones(aux.events, sg.shipGroupSeqId, isVirtual);
    const isBrokered = !isVirtual || !!lifecycle.firstBrokeredDate;

    // Item status wins for a stopped group; the timeline only describes one still in motion.
    let progress = 0;
    if (isPosCompleted) progress = 1;
    else if (settled) progress = fulfilled / total;
    else progress = [isBrokered, lifecycle.picklistDate, lifecycle.packedDate, lifecycle.shippedDate].filter(Boolean).length * 0.25;

    // Cancelled items are routinely moved to a virtual facility such as REJECTED_ITM_PARKING, so the
    // brokering label comes after the terminal checks or a stopped card would read "Not brokered".
    let statusLabel = translate('{percent}% complete', { percent: Math.round(progress * 100) });
    if (isPosCompleted) statusLabel = translate('Sold in store');
    else if (settled && fulfilled === 0) statusLabel = translate('Cancelled');
    else if (settled && fulfilled < total) statusLabel = translate('Partially complete');
    else if (!settled && isVirtual) statusLabel = translate('Not brokered');

    const facilityName = seed.facilityName(sg.facilityId);
    const rawItems: any[] = sg.items || [];
    const units = rawItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);

    const items: EnrichedOrderItem[] = rawItems.map((item: any) => {
      const product = productCache.getProduct(item.productId);
      const sku = product?.sku || item.productId;
      const statusId = item.statusId || '';
      const status = seed.statusDescription(statusId);
      const statusColor = commonUtil.getStatusColor(statusId);
      const attributes = item.orderItemAttributes || item.attributes || item.orderItemAttributeList || [];
      return {
        orderItemSeqId: item.orderItemSeqId,
        externalId: item.externalId || sku || item.orderItemSeqId,
        productId: item.productId,
        // parentProductName is the product title ("Abominable Hoodie"); productName is the variant
        // ("XS / Blue", ~= itemDescription). Prefer the title, then the variant, then the id.
        name: product?.parentProductName || product?.productName || item.itemDescription || item.productId,
        sku,
        imageUrl: product?.mainImageUrl || '',
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        statusId,
        status,
        statusColor,
        statuses: status ? [{ label: status, color: statusColor }] : [],
        shipGroupSeqId: sg.shipGroupSeqId,
        facilityId: sg.facilityId || '',
        facilityName: facilityName || translate('Facility'),
        attributes,
        attributeCount: attributes.length,
        adjustments: itemAdjustmentSummaries(raw, item),
        issuance: isPosCompleted && aux.issuanceByItem ? itemIssuance(item, aux.issuanceByItem) : undefined,
        transfers: itemTransfers(item.orderItemSeqId, aux.inventoryTransfers),
      };
    });

    return {
      id: sg.shipGroupSeqId,
      facilityId: sg.facilityId,
      facilityName,
      isVirtual,
      isPosCompleted,
      isBrokered,
      isSettled: settled,
      progress,
      statusLabel,
      itemSummary: `${translate('{count} items', { count: rawItems.length })}, ${translate('{count} units', { count: units })}`,
      lifecycle,
      shippingAddress: shippingAddress(sg.contactMechId ? context.contactMechsById[sg.contactMechId] : context.shippingLocation),
      carrierPartyId: sg.carrierPartyId,
      shipmentMethodTypeId: sg.shipmentMethodTypeId,
      shippingMethodLabel: sg.shipmentMethodTypeId ? seed.shipmentMethodDescription(sg.shipmentMethodTypeId) : '',
      estimatedShipDate: sg.estimatedShipDate,
      estimatedDeliveryDate: sg.estimatedDeliveryDate,
      shipAfterDate: sg.shipAfterDate,
      shipByDate: sg.shipByDate,
      giftMessage: sg.giftMessage,
      shippingInstructions: sg.shippingInstructions,
      contactMechId: sg.contactMechId,
      items,
    };
  }

  /**
   * Same location-chip semantics as the Find Orders list rows: the top physical facility wins the
   * chip (+N for further splits), and virtual/parking facilities only label it when nothing is brokered.
   */
  function groupLocationLabel(items: EnrichedOrderItem[]): string {
    const summary = summarizeBrokeredFacilities(items.map((item) => ({
      facilityId: item.facilityId,
      facilityName: seed.facilityName(item.facilityId) || item.facilityName,
      facilityTypeId: seed.facility(item.facilityId)?.facilityTypeId,
    })));

    const brokered = Boolean(summary.brokeredFacilityName);
    const name = summary.brokeredFacilityName || summary.dominantVirtualFacilityName;
    if (!name) return '';
    const splitCount = brokered ? summary.brokeredFacilitySplitCount : summary.dominantVirtualFacilitySplitCount;
    return splitCount > 0 ? `${name} +${splitCount}` : name;
  }

  function groupItems(shipGroups: EnrichedShipGroup[], aux: EnrichmentAuxiliaryData): EnrichedItemGroup[] {
    const groups = new Map<string, EnrichedItemGroup>();
    shipGroups.flatMap((sg) => sg.items).forEach((item) => {
      let group = groups.get(item.externalId);
      if (!group) {
        group = {
          externalId: item.externalId,
          productId: item.productId || '',
          name: item.name,
          sku: item.sku,
          totalQty: 0,
          totalPrice: 0,
          statuses: [],
          locationLabel: '',
          adjustments: (aux.groupAdjustments[item.externalId] || [])
            .map((adj) => ({ ...adj, amount: Number(adj.amount) }))
            .filter((adj) => adj.amount !== 0),
          items: [],
        };
        groups.set(item.externalId, group);
      }
      group.items.push(item);
      group.totalQty += item.quantity;
      group.totalPrice += item.unitPrice * item.quantity;
    });

    return [...groups.values()].map((group) => ({
      ...group,
      statuses: rollUpItemStatuses(group.items),
      locationLabel: groupLocationLabel(group.items),
    }));
  }

  function paymentSummary(raw: any, aux: EnrichmentAuxiliaryData): EnrichedOrderPayments {
    const list = (raw.paymentPreferences || []).map((payment: any) => ({
      id: payment.orderPaymentPreferenceId,
      paymentMethodTypeId: payment.paymentMethodTypeId,
      paymentMethodTypeDesc: seed.paymentMethodDescription(payment.paymentMethodTypeId),
      amount: Number(payment.maxAmount ?? payment.presentmentAmount ?? 0),
      statusId: payment.statusId,
      statusDesc: seed.statusDescription(payment.statusId),
      createdDate: payment.createdDate || payment.createdStamp,
      parentRefNum: payment.parentRefNum || '',
    }));
    const round = (value: number) => Math.round(value * 100) / 100;

    // Only preferences that actually collected money count — refunded, cancelled and declined ones
    // would otherwise inflate the total past the grand total. Net subtracts refunds.
    let receivedTotal = 0;
    let netAmount = 0;
    const sectionsByStatus = new Map<string, EnrichedOrderPayments['sections'][number]>();
    list.forEach((payment: any) => {
      if (PAYMENT_COLLECTED_STATUSES.has(payment.statusId)) {
        receivedTotal += payment.amount;
        netAmount += payment.amount;
      } else if (payment.statusId === 'PAYMENT_REFUNDED') {
        netAmount -= payment.amount;
      }

      const statusId = payment.statusId || 'UNKNOWN';
      if (!sectionsByStatus.has(statusId)) {
        sectionsByStatus.set(statusId, { statusId, label: payment.statusDesc || statusId, payments: [], total: 0 });
      }
      const section = sectionsByStatus.get(statusId)!;
      section.payments.push(payment);
      section.total += payment.amount;
    });

    // One section per status in order of first appearance, refunded pinned to the bottom.
    const sections = [...sectionsByStatus.values()]
      .map((section) => ({ ...section, total: round(section.total) }))
      .sort((left, right) => Number(left.statusId === 'PAYMENT_REFUNDED') - Number(right.statusId === 'PAYMENT_REFUNDED'));

    // Negative net = more refunded than collected. Positive net on a fully returned order = money
    // still held for goods that all came back — likely a refund owed.
    const liveItems = (raw.shipGroups || []).flatMap((sg: any) => sg.items || []).filter((item: any) => item.statusId !== 'ITEM_CANCELLED');
    const allItemsReturned = liveItems.length > 0
      && liveItems.every((item: any) => (aux.returnedQtyBySeqId[item.orderItemSeqId] || 0) >= Number(item.quantity || 0));
    const net = round(netAmount);

    return {
      list,
      receivedTotal: round(receivedTotal),
      netAmount: net,
      netColor: net < 0 ? 'danger' : net > 0 && allItemsReturned ? 'warning' : undefined,
      sections,
    };
  }

  /**
   * Join the raw order document with what the store has loaded and derived around it, into the
   * shape the order page renders. Reads the seed and product caches, so it re-runs as they fill.
   */
  function enrichOrder(raw: any, aux: EnrichmentAuxiliaryData): EnrichedOrder {
    const contactMechsById: Record<string, any> = {};
    let shippingLocation: any;
    (raw.contactMechs || []).forEach((mech: any) => {
      if (mech.contactMechId) contactMechsById[mech.contactMechId] = mech;
      if (mech.contactMechPurposeTypeId === 'SHIPPING_LOCATION') shippingLocation = mech;
    });

    const shipGroups = (raw.shipGroups || []).map((sg: any) =>
      enrichShipGroup(sg, raw, aux, { contactMechsById, shippingLocation }));

    const emailContact = findContact(raw, aux.customerProfile, 'EMAIL_ADDRESS', ['ORDER_EMAIL'], ['ORDER_EMAIL', 'PRIMARY_EMAIL']);
    const phoneContact = findContact(raw, aux.customerProfile, 'TELECOM_NUMBER', PHONE_PURPOSES);
    const billingLines = addressLines(contactPostalAddress(findContact(raw, aux.customerProfile, 'POSTAL_ADDRESS', ['BILLING_LOCATION'])));

    const shippingMethods = [...new Set(shipGroups.map((sg: EnrichedShipGroup) => sg.shippingMethodLabel).filter(Boolean))].join(', ');
    const adjustmentRows = [
      ...Object.entries(aux.totals.adjustments).map(([label, amount]) => ({ label, amount: Number(amount), isIncluded: false })),
      ...Object.entries(aux.totals.includedAdjustments || {}).map(([label, amount]) => ({ label, amount: Number(amount), isIncluded: true })),
    ]
      .filter((row) => row.amount !== 0)
      .map((row) => ({ ...row, detail: /shipping/i.test(row.label) ? shippingMethods : '' }));

    const riskRecommendationEnumId = raw.riskRecommendationEnumId || '';
    const riskLevelEnumId = raw.riskLevelEnumId || '';
    const riskFacts = aux.riskAssessments.flatMap((risk: any) => risk.facts || []);

    return {
      id: raw.orderId,
      orderName: raw.orderName,
      externalId: raw.externalId,
      status: seed.statusDescription(raw.statusId),
      statusId: raw.statusId,
      channel: seed.enumDescription(raw.salesChannelEnumId),
      salesChannelEnumId: raw.salesChannelEnumId,
      productStoreId: raw.productStoreId,
      productStoreName: seed.productStoreName(raw.productStoreId),
      // Origin/placed-at facility from the order header (set by the OMS order import for
      // POS/retail-location orders). '_NA_' on a POS order is a data gap worth surfacing.
      originFacilityId: raw.originFacilityId || '',
      originFacilityName: raw.originFacilityId && raw.originFacilityId !== '_NA_'
        ? (raw.originFacilityName || seed.facility(raw.originFacilityId)?.facilityName || raw.originFacilityId)
        : '',
      currency: raw.currencyUom,
      localeString: raw.localeString || raw.locale,
      riskLevelEnumId,
      customer: {
        partyId: aux.customerPartyId,
        name: aux.customerName,
        email: contactInfoString(emailContact),
        phone: formatTelecomNumber(contactTelecomNumber(phoneContact)) || contactInfoString(phoneContact),
        billingAddress: billingLines.length ? { lines: billingLines } : undefined,
      },
      identifications: (raw.identifications || [])
        .filter((identification: any) => !identification.thruDate || new Date(identification.thruDate).getTime() > Date.now())
        .map((identification: any) => ({
          orderIdentificationTypeId: identification.orderIdentificationTypeId,
          typeLabel: seed.enumDescription(identification.orderIdentificationTypeId),
          idValue: identification.idValue,
          fromDate: identification.fromDate,
        })),
      payments: paymentSummary(raw, aux),
      risk: {
        hasRiskSignal: Boolean(riskRecommendationEnumId || riskLevelEnumId),
        recommendation: riskRecommendationEnumId ? seed.enumDescription(riskRecommendationEnumId) : translate('No recommendation'),
        level: riskLevelEnumId ? seed.enumDescription(riskLevelEnumId) : translate('No risk level'),
        facts: riskFacts,
        counts: sentimentCounts(riskFacts),
      },
      attributes: orderAttributeRows(raw),
      shipGroups,
      groupedItems: groupItems(shipGroups, aux),
      totals: { subtotal: aux.totals.subtotal, total: aux.totals.total, adjustmentRows },
    };
  }

  /**
   * The order page's view model: the raw order document joined with the loaded auxiliary
   * sources (order events, issuance, risk, returns, transfers) and the seed, product and
   * customer caches.
   */
  function enrichedOrder(orderId: string): EnrichedOrder | null {
    const raw = orderDetailStore.orderById(orderId);
    if (!raw) return null;
    const customerPartyId = orderDetailStore.customerPartyIdByOrderId(orderId);
    return enrichOrder(raw, {
      totals: orderTotals(orderId),
      groupAdjustments: adjustmentsByExternalId(orderId),
      customerPartyId,
      customerName: orderDetailStore.customerNameByOrderId(orderId),
      customerProfile: customerPartyId ? useCustomerStore().getCustomer(customerPartyId) : null,
      events: orderEvents(orderId),
      issuanceByItem: orderDetailStore.issuanceByItemSeqIdByOrderId(orderId),
      riskAssessments: orderDetailStore.riskAssessmentsForOrder(orderId),
      returnedQtyBySeqId: orderDetailStore.returnedQtyByItemSeqIdByOrderId(orderId),
      inventoryTransfers: orderDetailStore.inventoryTransfersByOrderId[orderId] || [],
    });
  }

  /** Shipping methods for a carrier: the order's fetched carrierShipmentMethods, else the local database's. */
  function shippingMethodsByCarrier(carrierPartyId: string): any[] {
    const fromDetail = orderDetailStore.shippingMethods.filter((m: any) => m.partyId === carrierPartyId || m.carrierPartyId === carrierPartyId);
    return fromDetail.length ? fromDetail : seed.shipmentMethodsByCarrier(carrierPartyId);
  }

  return {
    workflowOrderRow,
    sortRuleName,
    availableSortOptions,
    orderTotals,
    adjustmentsByExternalId,
    orderEvents,
    enrichOrder,
    enrichedOrder,
    shippingMethodsByCarrier,
  };
}
