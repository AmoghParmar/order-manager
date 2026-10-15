import { translate } from '@common';
import { toMillis } from './format';
import type { OrderEvent } from './orderEvents';
import type { ItemIssuanceSummary } from './inventoryIssuance';
import type { ItemIssuance } from '@/types/orderDetail';

/** What the order store has already derived or loaded for the order; see useOrder().enrichedOrder. */
export interface EnrichmentAuxiliaryData {
  totals: { subtotal: number; adjustments: Record<string, number>; includedAdjustments: Record<string, number>; total: number };
  groupAdjustments: Record<string, Array<{ label: string; amount: number; isIncluded: boolean }>>;
  customerPartyId: string;
  customerName: string;
  customerProfile: any;
  /** The order's history as typed events (see utils/orderEvents); ship groups read their milestones here. */
  events: OrderEvent[];
  issuanceByItem: Record<string, ItemIssuanceSummary> | null;
  riskAssessments: any[];
  returnedQtyBySeqId: Record<string, number>;
  /** Raw InventoryTransfer rows for the order's items, newest first. */
  inventoryTransfers: any[];
}

/**
 * A ship group sold over the counter. OMS treats POS_COMPLETED as needing no fulfillment at all
 * (`requiresFulfillment` in OrderServices get#SalesOrder), so the group has no carrier, no ship-to
 * address, and no brokering/pick/pack/ship dates — the goods left with the customer.
 */
export function isPosCompletedShipGroup(shipGroup: any): boolean {
  return shipGroup?.shipmentMethodTypeId === 'POS_COMPLETED';
}

/* ── Contacts ─────────────────────────────────────────────────────────────── */

function contactPurposeIds(contact: any): string[] {
  return [
    contact?.contactMechPurposeTypeId,
    ...(contact?.purposeTypeIds || []),
    ...((contact?.purposes || []).map((purpose: any) => purpose.contactMechPurposeTypeId)),
  ].filter(Boolean);
}

function contactMatchesPurpose(contact: any, purposeTypeIds: string[]) {
  if (!purposeTypeIds.length) return true;
  const purposes = new Set(contactPurposeIds(contact));
  return purposeTypeIds.some((purposeTypeId) => purposes.has(purposeTypeId));
}

export const contactPostalAddress = (contact: any) => contact?.postalAddress || contact?.contactMech?.postalAddress;
export const contactTelecomNumber = (contact: any) => contact?.telecomNumber || contact?.contactMech?.telecomNumber;
export const contactInfoString = (contact: any) => contact?.contactMech?.infoString || contact?.infoString || '';

function contactMechTypeIdFromContact(contact: any, fallbackTypeId: string) {
  return contact?.contactMechTypeId || contact?.contactMech?.contactMechTypeId
    || (contactPostalAddress(contact) ? 'POSTAL_ADDRESS' : contactTelecomNumber(contact) ? 'TELECOM_NUMBER' : fallbackTypeId);
}

export function formatTelecomNumber(telecom: any) {
  if (!telecom) return '';
  return [telecom.countryCode, telecom.areaCode, telecom.contactNumber].filter(Boolean).join(' ');
}

function isActiveContact(contact: any) {
  if (!contact.thruDate) return true;
  const thruMillis = toMillis(contact.thruDate);
  return !thruMillis || thruMillis > Date.now();
}

/** The order's own contact of this type and purpose, else the customer's active one. */
export function findContact(raw: any, customerProfile: any, contactMechTypeId: string, orderPurposes: string[], customerPurposes = orderPurposes) {
  return (raw.contactMechs || []).find((contact: any) =>
    contactMechTypeId === contactMechTypeIdFromContact(contact, contactMechTypeId) && contactMatchesPurpose(contact, orderPurposes))
    || (customerProfile?.contactMechs || []).find((contact: any) =>
      contact.contactMechTypeId === contactMechTypeId && isActiveContact(contact) && contactMatchesPurpose(contact, customerPurposes));
}

export const PHONE_PURPOSES = ['PHONE_BILLING', 'PRIMARY_PHONE', 'PHONE_SHIPPING', 'PHONE_MOBILE'];

export function numeric(value: any): number | undefined {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Whether inventory was issued for a counter-sale line, and how completely. Completion and
 * issuance are separate steps — issue#PosOrderInventory skips an order whose facility is not a
 * physical store — so an item can be ITEM_COMPLETED with no inventory ever issued.
 */
export function itemIssuance(rawItem: any, issuanceByItem: Record<string, ItemIssuanceSummary>): ItemIssuance {
  const ordered = Number(rawItem.quantity) || 0;
  const summary = issuanceByItem[rawItem.orderItemSeqId];
  const issued = summary?.issued || 0;
  const stock = { qohBefore: summary?.qohBefore ?? 0, qohAfter: summary?.qohAfter ?? 0 };

  if (issued <= 0) return { kind: 'none', tone: 'warning', ...stock };
  if (ordered && issued < ordered) return { kind: 'partial', tone: 'warning', ...stock };
  return { kind: 'issued', tone: 'success', ...stock };
}

export function orderAttributeRows(raw: any) {
  return (raw.attributes || raw.orderAttributes || raw.orderAttributeList || [])
    .map((attribute: any, index: number) => {
      const name = attribute.name ?? attribute.attrName ?? attribute.attributeName ?? attribute.orderAttributeName ?? attribute.orderAttributeTypeId;
      const value = attribute.value ?? attribute.attrValue ?? attribute.attributeValue ?? attribute.orderAttributeValue;
      const description = attribute.description ?? attribute.attrDescription ?? attribute.attributeDescription ?? '';
      return {
        id: attribute.orderAttributeId || `${name || 'attribute'}-${index}`,
        name: name ? String(name) : translate('Attribute'),
        value: value == undefined ? '' : String(value),
        description: description ? String(description) : '',
      };
    })
    .filter((attribute: any) => attribute.name || attribute.value || attribute.description);
}
