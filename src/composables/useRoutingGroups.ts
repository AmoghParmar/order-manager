import { api } from '@common';

/** The product store's order routing groups (brokering runs), for picking one to run. */
export function useRoutingGroups() {
  async function fetchRoutingGroups(productStoreId: string): Promise<any[]> {
    const resp = await api({
      url: 'order-routing/groups',
      method: 'GET',
      params: { productStoreId },
    });
    return resp.data || [];
  }

  return { fetchRoutingGroups };
}
