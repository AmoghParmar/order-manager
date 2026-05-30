import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { searchOrders } from '@/services/order';
import { useOperationsStore } from './operations';

vi.mock('@/services/order', () => ({
  searchOrders: vi.fn()
}));

const sampleOrders = [
  {
    id: 'M100051',
    externalId: '#A1001',
    orderDate: '2026-05-29T09:00:00+05:30',
    status: 'ORDER_APPROVED',
    customerId: 'CUST_1',
    customerName: 'Maya Chen',
    channel: 'Shopify',
    total: 86.5,
    currency: 'USD',
    productStoreId: 'Laura Geller',
  },
  {
    id: 'M100052',
    externalId: '#A1002',
    orderDate: '2026-05-29T09:20:00+05:30',
    status: 'ORDER_CREATED',
    customerId: 'CUST_2',
    customerName: 'Priya Shah',
    channel: 'Amazon',
    total: 24,
    currency: 'USD',
    productStoreId: 'Julep',
  },
  {
    id: 'M100053',
    externalId: '#A1003',
    orderDate: '2026-05-29T10:10:00+05:30',
    status: 'ORDER_APPROVED',
    customerId: 'CUST_3',
    customerName: 'Olivia Reed',
    channel: 'Shopify',
    total: 59,
    currency: 'USD',
    productStoreId: 'Mally Beauty',
  },
  {
    id: 'M100054',
    externalId: '#A1004',
    orderDate: '2026-05-29T10:35:00+05:30',
    status: 'ORDER_APPROVED',
    customerId: 'CUST_4',
    customerName: 'Nora Patel',
    channel: 'TikTok Shop',
    total: 112,
    currency: 'USD',
    productStoreId: 'Laura Geller',
  },
] as any[];

describe('operations store actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(searchOrders).mockReset();
    vi.mocked(searchOrders).mockImplementation(async (params = {}) => ({
      orders: params.pageSize === 1 ? sampleOrders.slice(0, 1) : sampleOrders,
      total: sampleOrders.length
    }));
  });

  it('loads dashboard WorkEffort queues', async () => {
    const store = useOperationsStore();

    await store.loadDashboard();

    expect(store.summary?.transactionsWithWork).toBe(4);
    expect(store.workItems).toHaveLength(4);
    expect(store.activeWorkEfforts).toHaveLength(4);
  });

  it('assigns WorkEfforts and records assignment history', async () => {
    const store = useOperationsStore();
    await store.loadWorkItems({ status: 'active' });

    store.assignWorkEffort('WE-M100051-grace-period', 'Taylor Brooks');

    const workEffort = store.getWorkEffort('WE-M100051-grace-period');
    expect(workEffort?.owner).toBe('Taylor Brooks');
    expect(workEffort?.statusId).toBe('in-progress');
    expect(workEffort?.activity.at(-1)).toMatchObject({
      event: 'Assigned',
      actor: 'Taylor Brooks',
    });
  });

  it('completes WorkEfforts and moves them into transaction history', async () => {
    const store = useOperationsStore();
    await store.loadWorkItems({ status: 'active' });

    store.completeWorkEffort('WE-M100052-repair', 'Address normalized and requeued');

    const transaction = store.getWorkEffortItem('WE-M100052-repair');
    expect(transaction?.activeWorkEfforts.find((workEffort) => workEffort.workEffortId === 'WE-M100052-repair')).toBeUndefined();
    expect(transaction?.completedWorkEfforts[0]).toMatchObject({
      workEffortId: 'WE-M100052-repair',
      statusId: 'completed',
      resolution: 'Address normalized and requeued',
    });
  });

  it('updates WorkEffort status from bulk task actions', async () => {
    const store = useOperationsStore();
    await store.loadWorkItems({ status: 'active' });

    store.updateWorkEffortStatus('WE-M100051-grace-period', 'completed');

    const transaction = store.getWorkEffortItem('WE-M100051-grace-period');
    expect(transaction?.activeWorkEfforts.find((workEffort) => workEffort.workEffortId === 'WE-M100051-grace-period')).toBeUndefined();
    expect(transaction?.completedWorkEfforts[0]).toMatchObject({
      workEffortId: 'WE-M100051-grace-period',
      statusId: 'completed',
      blocksRelease: false,
    });
  });

  it('updates WorkEffort due dates from bulk task actions', async () => {
    const store = useOperationsStore();
    await store.loadWorkItems({ status: 'active' });

    store.updateWorkEffortDueDate('WE-M100053-inventory', '2026-05-31T10:00:00.000Z');

    const workEffort = store.getWorkEffort('WE-M100053-inventory');
    expect(workEffort?.dueAt).toBe('2026-05-31T10:00:00.000Z');
    expect(workEffort?.activity.at(-1)).toMatchObject({
      event: 'Due date changed',
    });
  });

  it('toggles incident mode without calling live services', () => {
    const store = useOperationsStore();

    store.activateIncidentMode('Carrier outage in Northeast');
    expect(store.incidentMode.active).toBe(true);
    expect(store.incidentMode.reason).toBe('Carrier outage in Northeast');

    store.deactivateIncidentMode();
    expect(store.incidentMode.active).toBe(false);
  });
});
