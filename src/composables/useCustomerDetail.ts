import { computed } from 'vue';
import { commonUtil } from '@common';
import { useSeedData } from '@common/db';
import { useCustomerStore } from '@/store/customer';
import type { CustomerOrderSummary } from '@/types/customer';

// Order/ship-group progress: target = (#statuses x 100); current = sum of each status's
// StatusItem.statusAge. Robust to whatever statuses exist (order items now, shipment items
// when the order payload includes them). Capped at 1.
function computeProgress(statusIds: string[], statusAge: (statusId: string) => number): number {
  if (!statusIds.length) return 0;
  const target = statusIds.length * 100;
  const current = statusIds.reduce((sum, statusId) => sum + statusAge(statusId), 0);
  return target ? Math.min(current / target, 1) : 0;
}

// Color the progress bar by the least-progressed (min statusAge) status via the shared
// status-color map: all complete -> success, in progress -> primary/medium, cancelled -> danger.
function progressStatusColor(statusIds: string[], statusAge: (statusId: string) => number): string {
  if (!statusIds.length) return 'medium';
  const rep = statusIds.reduce((min, statusId) => (statusAge(statusId) < statusAge(min) ? statusId : min), statusIds[0]);
  return commonUtil.getStatusColor(rep);
}

/**
 * Thin view adapter for CustomerDetail.vue. Reads from the customer Pinia store
 * and exposes computed bindings + actions. It does NOT make HTTP calls directly -
 * the store owns orchestration and the services own transport. Labels and joins over the
 * local seed tables (order progress from status ages) happen here, not in the store.
 *
 * @param getPartyId reactive accessor for the current party id (e.g. () => props.customerId)
 */
export function useCustomerDetail(getPartyId: () => string) {
  const store = useCustomerStore();
  const seed = useSeedData();
  const partyId = computed(() => getPartyId());
  const statusAges = computed(() => new Map(seed.statuses().map((row: any) => [row.statusId, Number(row.statusAge ?? 0)])));

  const customer = computed(() => store.getCustomer(partyId.value));
  const loading = computed(() => store.sectionStatus(partyId.value, 'profile') === 'loading');
  const error = computed(() => store.sectionError(partyId.value, 'profile'));

  const contactSections = computed(() => store.contactSections(partyId.value));
  const personalRelationships = computed(() => store.personalRelationships(partyId.value));
  const duplicateRelationships = computed(() => store.duplicateRelationships(partyId.value));
  const timeline = computed(() => store.customerTimeline(partyId.value));
  const recentOrders = computed(() => store.recentOrders(partyId.value).map((order: CustomerOrderSummary) => {
    const statusIds = order.progressStatusIds;
    if (!statusIds?.length) return order;
    const statusAge = (statusId: string) => statusAges.value.get(statusId) ?? 0;
    const progressValue = computeProgress(statusIds, statusAge);
    return { ...order, progressValue, progressPercent: Math.round(progressValue * 100), progressColor: progressStatusColor(statusIds, statusAge) };
  }));
  const openTasks = computed(() => store.openTasks(partyId.value));
  const tasksHasMore = computed(() => (store as any).openTasksHasMore(partyId.value) as boolean);
  const customerReturns = computed(() => (store as any).returns(partyId.value));
  const customerCommunications = computed(() => (store as any).communications(partyId.value));
  const mergableDuplicates = computed(() => (store as any).mergableDuplicates(partyId.value) as Array<{ partyId: string; name: string }>);
  const ordersStatus = computed(() => (store as any).sectionStatus(partyId.value, 'recentOrders'));
  const tasksStatus = computed(() => (store as any).sectionStatus(partyId.value, 'tasks'));
  const returnsStatus = computed(() => (store as any).sectionStatus(partyId.value, 'returns'));
  const commsStatus = computed(() => (store as any).sectionStatus(partyId.value, 'communications'));
  const returnsError = computed(() => (store as any).sectionError(partyId.value, 'returns'));
  const commsError = computed(() => (store as any).sectionError(partyId.value, 'communications'));
  const lifetimeValue = computed(() => store.lifetimeValue(partyId.value));
  const lifetimeOrders = computed(() => store.lifetimeOrders(partyId.value));
  const lifetimeCurrency = computed(() => store.lifetimeCurrency(partyId.value));
  const customerSince = computed(() => store.customerSince(partyId.value));

  function load() {
    return store.setCurrentCustomer(partyId.value);
  }

  function refresh() {
    return store.refreshCustomer(partyId.value);
  }

  function expireRelationship(keyFields: { partyIdFrom: string; partyIdTo: string; roleTypeIdFrom: string; roleTypeIdTo: string; fromDate: string }, thruDate: number) {
    return store.expireRelationship(keyFields, thruDate);
  }

  function createRelationship(input: { partyIdFrom: string; partyIdTo: string; partyRelationshipTypeId: string; roleTypeIdFrom: string; roleTypeIdTo: string; fromDate: number; comments?: string }) {
    return store.createRelationship(input);
  }

  function addContact(contactMechTypeId: string, data: Record<string, string>) {
    return (store as any).addContact(partyId.value, contactMechTypeId, data);
  }

  function updateContact(contactMechTypeId: string, contactMechId: string, data: Record<string, string>) {
    return (store as any).updateContact(partyId.value, contactMechTypeId, contactMechId, data);
  }

  function expireContact(contactMechId: string) {
    return (store as any).expireContact(partyId.value, contactMechId);
  }

  function loadReturns() {
    return (store as any).loadCustomerReturns(partyId.value);
  }

  function loadCommunications() {
    return (store as any).loadCustomerCommunications(partyId.value);
  }

  function loadMoreTasks() {
    return (store as any).loadMoreCustomerTasks(partyId.value);
  }

  function mergeContact(duplicatePartyId: string) {
    return (store as any).mergeContact(partyId.value, duplicatePartyId);
  }

  return {
    store,
    customer,
    loading,
    error,
    contactSections,
    personalRelationships,
    duplicateRelationships,
    mergableDuplicates,
    timeline,
    recentOrders,
    openTasks,
    tasksHasMore,
    customerReturns,
    customerCommunications,
    ordersStatus,
    tasksStatus,
    returnsStatus,
    commsStatus,
    returnsError,
    commsError,
    lifetimeValue,
    lifetimeOrders,
    lifetimeCurrency,
    customerSince,
    load,
    refresh,
    expireRelationship,
    createRelationship,
    addContact,
    updateContact,
    expireContact,
    loadReturns,
    loadCommunications,
    loadMoreTasks,
    mergeContact
  };
}
