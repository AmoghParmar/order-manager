import { api } from '@common';

/** The currency units the OMS knows, for a currency picker. */
export function useCurrencies() {
  async function fetchCurrencies(): Promise<any[]> {
    const resp = await api({
      url: 'admin/uoms',
      method: 'get',
      params: { uomTypeEnumId: 'UT_CURRENCY_MEASURE', pageSize: 250 }
    });
    return resp.data;
  }

  return { fetchCurrencies };
}
