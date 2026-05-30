import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOperationsSummary,
  searchTransactionWorkItems
} from './operations';
import { searchOrders } from './order';

vi.mock('./order', () => ({
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

beforeEach(() => {
  vi.mocked(searchOrders).mockReset();
  vi.mocked(searchOrders).mockImplementation(async (params = {}) => ({
    orders: params.pageSize === 1 ? sampleOrders.slice(0, 1) : sampleOrders,
    total: sampleOrders.length
  }));
});

describe('operations service data', () => {
  it('returns transaction work items filtered by WorkEffort purpose', async () => {
    const result = await searchTransactionWorkItems({
      purpose: 'grace-period',
      status: 'active',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      transactionId: 'M100051',
      displayId: '#A1001',
      transactionType: 'ORDER',
    });
    expect(result[0].activeWorkEfforts[0]).toMatchObject({
      workEffortId: 'WE-M100051-grace-period',
      purpose: 'grace-period',
      blocksRelease: true,
    });
  });

  it('searches across order, return, customer, channel, and brand context', async () => {
    vi.mocked(searchOrders).mockImplementation(async (params = {}) => ({
      orders: params.pageSize === 1 ? sampleOrders.slice(2, 3) : sampleOrders.slice(2, 3),
      total: 1
    }));

    const result = await searchTransactionWorkItems({
      query: 'Olivia',
      status: 'active',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      transactionType: 'ORDER',
      transactionId: 'M100053',
      customerName: 'Olivia Reed',
    });
  });

  it('builds a dashboard summary from active WorkEfforts', async () => {
    const summary = await getOperationsSummary();

    expect(summary).toMatchObject({
      transactionsWithWork: 4,
      activeWorkEfforts: 4,
      gracePeriod: 1,
      repairs: 1,
      inventory: 1,
      manual: 1,
      readyToRelease: 0,
    });
  });

  it('filters inventory work separately from other hold kinds', async () => {
    const result = await searchTransactionWorkItems({
      purpose: 'inventory',
      status: 'active',
    });

    expect(result.map((item) => item.transactionId)).toEqual(['M100053']);
    expect(result[0].activeWorkEfforts[0]).toMatchObject({
      workEffortId: 'WE-M100053-inventory',
      purpose: 'inventory',
    });
  });

  it('fetches a random sample of live orders before mapping task cards', async () => {
    await searchTransactionWorkItems({ status: 'active' });

    expect(searchOrders).toHaveBeenNthCalledWith(1, expect.objectContaining({
      pageSize: 1,
      pageIndex: 0
    }));
    expect(searchOrders).toHaveBeenNthCalledWith(2, expect.objectContaining({
      pageSize: 12
    }));
  });
});
