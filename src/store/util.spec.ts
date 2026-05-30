import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUtilStore } from './util';
import { api } from '@common';

vi.mock('@common', () => ({
  api: vi.fn(),
  commonUtil: {
    getStatusColor: () => 'medium',
  },
}));

describe('util store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(api).mockReset();
  });

  it('reads status transitions from a serializable cache', () => {
    const utilStore = useUtilStore();
    utilStore.statusItems = {
      ORDER_ITEM_STATUS: [{ statusId: 'ITEM_COMPLETED', description: 'Completed' }],
    };
    utilStore.statusFlowTransitions = {
      ITEM_APPROVED: [{ statusId: 'ITEM_APPROVED', toStatusId: 'ITEM_COMPLETED' }],
    };

    expect(utilStore.getAllowedTransitions('ITEM_APPROVED')).toEqual([expect.objectContaining({
      toStatusId: 'ITEM_COMPLETED',
      toStatusDescription: 'Completed',
      toStatusColor: 'medium',
    })]);
  });

  it('loads carrier and shipment method seed data for selectable controls', async () => {
    vi.mocked(api).mockImplementation(async (request: any) => {
      if (request.url === 'oms/shippingGateways/carrierParties') {
        return { data: [{ partyId: 'UPS', groupName: 'UPS' }] };
      }
      if (request.url === 'oms/shippingGateways/shipmentMethodTypes') {
        return { data: [{ shipmentMethodTypeId: 'GROUND', description: 'Ground' }] };
      }
      if (request.url === 'oms/dataDocumentView') {
        return { data: { entityValueList: [{ shipmentMethodTypeId: 'GROUND', partyId: 'UPS' }] } };
      }
      return { data: [] };
    });

    const utilStore = useUtilStore();
    await utilStore.seedSelectableValues('STORE');

    expect(utilStore.getCarrierOptions).toEqual([{ id: 'UPS', label: 'UPS' }]);
    expect(utilStore.getShipmentMethodOptions).toEqual([{ id: 'GROUND', label: 'Ground' }]);
    expect(utilStore.getProductStoreShipmentMethodOptions('STORE')).toEqual([{
      id: 'GROUND',
      label: 'Ground',
      carrierPartyId: 'UPS'
    }]);
    expect(api).toHaveBeenCalledWith(expect.objectContaining({
      url: 'oms/dataDocumentView',
      method: 'POST'
    }));
  });
});
