import type {
  OperationsSummary,
  TransactionType,
  TransactionWorkItem,
  WorkEffortSummary,
  WorkEffortPurpose,
  WorkEffortStatus,
  WorkItemSearchParams
} from '@/types/operations';
import type { Order } from '@/types/order';
import { searchOrders } from './order';

const sampleSize = 12;
const taskTemplates = [
  {
    workEffortName: 'Cancellation grace period',
    workEffortTypeId: 'ORDER_GRACE_PERIOD',
    purpose: 'grace-period',
    owner: 'Unassigned',
    team: 'Order Ops',
    priority: 'high',
    statusId: 'open',
    nextStep: 'Review the order before release.',
  },
  {
    workEffortName: 'Repair order data',
    workEffortTypeId: 'ORDER_REPAIR',
    purpose: 'repair',
    owner: 'Sam Rivera',
    team: 'CSR',
    priority: 'critical',
    statusId: 'in-progress',
    nextStep: 'Fix the customer or order data issue, then requeue.',
  },
  {
    workEffortName: 'Find inventory',
    workEffortTypeId: 'ORDER_INVENTORY_HOLD',
    purpose: 'inventory',
    owner: 'Inventory Ops',
    team: 'Inventory',
    priority: 'high',
    statusId: 'open',
    nextStep: 'Confirm whether the order can be fulfilled from available inventory.',
  },
  {
    workEffortName: 'Manual release review',
    workEffortTypeId: 'ORDER_MANUAL_HOLD',
    purpose: 'manual',
    owner: 'Order Ops Lead',
    team: 'Order Ops',
    priority: 'medium',
    statusId: 'open',
    nextStep: 'Review the order and decide whether to release or keep it paused.',
  },
] as const;

export async function searchTransactionWorkItems(params: WorkItemSearchParams = {}) {
  const query = params.query?.trim().toLowerCase() || '';
  const transactionWorkItems = await getSampleTransactionWorkItems(params);

  return clone(transactionWorkItems)
    .map((item) => filterWorkEfforts(item, params))
    .filter((item) => {
      const hasMatchingWork = item.activeWorkEfforts.length || item.completedWorkEfforts.length;
      const transactionMatches = !query || [
        item.transactionId,
        item.displayId,
        item.customerName,
        item.channel,
        item.brand,
        item.status,
      ].some((value) => value.toLowerCase().includes(query));

      return hasMatchingWork && transactionMatches;
    });
}

export async function getOperationsSummary(): Promise<OperationsSummary> {
  const transactionWorkItems = await getSampleTransactionWorkItems({ status: 'active' });
  const activeEfforts = transactionWorkItems.flatMap((item) => item.activeWorkEfforts);

  return {
    transactionsWithWork: transactionWorkItems.filter((item) => item.activeWorkEfforts.length).length,
    activeWorkEfforts: activeEfforts.length,
    gracePeriod: countPurpose(activeEfforts, 'grace-period'),
    repairs: countPurpose(activeEfforts, 'repair'),
    inventory: countPurpose(activeEfforts, 'inventory'),
    manual: countPurpose(activeEfforts, 'manual'),
    readyToRelease: transactionWorkItems.filter((item) => item.blockingState === 'ready').length,
  };
}

async function getSampleTransactionWorkItems(params: WorkItemSearchParams = {}) {
  const firstPage = await searchOrders({
    queryString: params.query,
    sort: 'orderDate desc',
    pageSize: 1,
    pageIndex: 0
  });
  const totalPages = Math.max(1, Math.ceil(firstPage.total / sampleSize));
  const pageIndex = params.query ? 0 : Math.floor(Math.random() * totalPages);
  const sample = await searchOrders({
    queryString: params.query,
    sort: 'orderDate desc',
    pageSize: sampleSize,
    pageIndex
  });

  return sample.orders.map(orderToWorkItem);
}

function orderToWorkItem(order: Order, index: number): TransactionWorkItem {
  const template = taskTemplates[index % taskTemplates.length];
  const workEffort = orderWorkEffort(order, template, index);

  return {
    transactionType: 'ORDER' as TransactionType,
    transactionId: order.id,
    displayId: order.externalId || order.id,
    customerName: order.customerName || order.customerId || 'Customer unavailable',
    channel: order.channel || order.productStoreId || 'Channel unavailable',
    brand: order.productStoreId || 'Brand unavailable',
    status: order.status,
    total: order.total,
    currency: order.currency,
    blockingState: workEffort.blocksRelease ? 'blocked' : 'action-required',
    activeWorkEfforts: workEffort.statusId === 'completed' || workEffort.statusId === 'cancelled' ? [] : [workEffort],
    completedWorkEfforts: workEffort.statusId === 'completed' || workEffort.statusId === 'cancelled' ? [workEffort] : [],
  };
}

function orderWorkEffort(order: Order, template: typeof taskTemplates[number], index: number): WorkEffortSummary {
  const createdAt = order.orderDate || order.entryDate || new Date().toISOString();
  const dueAt = new Date(Math.max(Date.now(), new Date(createdAt).getTime()) + (index + 1) * 60 * 60 * 1000).toISOString();

  return {
    workEffortId: `WE-${order.id}-${template.purpose}`,
    workEffortName: template.workEffortName,
    workEffortTypeId: template.workEffortTypeId,
    purpose: template.purpose,
    statusId: template.statusId,
    owner: template.owner,
    team: template.team,
    priority: template.priority,
    dueAt,
    blocksRelease: template.purpose !== 'manual',
    blocksRefund: template.purpose === 'repair',
    blocksExport: template.purpose === 'inventory',
    nextStep: template.nextStep,
    activity: [
      {
        id: `WEA-${order.id}-${template.purpose}-created`,
        at: createdAt,
        actor: 'System',
        event: 'Created',
        note: `Testing task generated from live order ${order.externalId || order.id}.`,
      },
    ],
  };
}

function filterWorkEfforts(item: TransactionWorkItem, params: WorkItemSearchParams) {
  const clonedItem = clone(item);
  const status = params.status || 'active';

  const filterEffort = (statusId: WorkEffortStatus) => {
    const statusMatches = status === 'all' || (status === 'active' ? statusId !== 'completed' && statusId !== 'cancelled' : statusId === status);
    return statusMatches;
  };

  const effortMatches = (effort: TransactionWorkItem['activeWorkEfforts'][number]) => {
    const purposeMatches = !params.purpose || params.purpose === 'all' || effort.purpose === params.purpose;
    const ownerMatches = !params.owner || params.owner === 'All' || effort.owner === params.owner;
    return purposeMatches && ownerMatches && filterEffort(effort.statusId);
  };

  const transactionTypeMatches = !params.transactionType || params.transactionType === 'all' || clonedItem.transactionType === params.transactionType;

  if (!transactionTypeMatches) {
    clonedItem.activeWorkEfforts = [];
    clonedItem.completedWorkEfforts = [];
    return clonedItem;
  }

  clonedItem.activeWorkEfforts = clonedItem.activeWorkEfforts.filter(effortMatches);
  clonedItem.completedWorkEfforts = clonedItem.completedWorkEfforts.filter(effortMatches);
  return clonedItem;
}

function countPurpose(efforts: Array<{ purpose: WorkEffortPurpose }>, purpose: WorkEffortPurpose) {
  return efforts.filter((effort) => effort.purpose === purpose).length;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
