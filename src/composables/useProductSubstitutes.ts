import { api } from '@common';
import { activeSubstitutes, type SubstituteAssociation } from '@/utils/productAssociations';

/** A product's substitute associations: the active ones, and adding or expiring one. */
export function useProductSubstitutes() {
  async function fetchActiveSubstitutes(productId: string): Promise<SubstituteAssociation[]> {
    const response = await api({
      url: `oms/products/${productId}/associations`,
      method: 'GET',
      params: { pageSize: 500 }
    });
    return activeSubstitutes(response.data, productId);
  }

  function createSubstituteAssociation(productId: string, productIdTo: string) {
    return api({
      url: `oms/products/${productId}/assocs`,
      method: 'POST',
      data: { productId, productIdTo, productAssocTypeId: 'PRODUCT_SUBSTITUTE' }
    });
  }

  function expireSubstituteAssociation(productId: string, association: SubstituteAssociation) {
    return api({
      url: `oms/products/${productId}/assocs`,
      method: 'POST',
      data: {
        productId,
        productIdTo: association.productIdTo,
        productAssocTypeId: 'PRODUCT_SUBSTITUTE',
        fromDate: association.fromDate,
        thruDate: Date.now()
      }
    });
  }

  return { fetchActiveSubstitutes, createSubstituteAssociation, expireSubstituteAssociation };
}
