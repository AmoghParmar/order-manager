export interface SubstituteAssociation {
  productId: string;
  productIdTo: string;
  productAssocTypeId: 'PRODUCT_SUBSTITUTE';
  fromDate?: string | number;
  thruDate?: string | number | null;
}

const rows = (data: any): any[] => Array.isArray(data)
  ? data
  : data?.docs || data?.response?.docs || data?.associations || [];

const activeAt = (association: any, now = Date.now()) => {
  const fromDate = association.fromDate ? new Date(association.fromDate).getTime() : 0;
  const thruDate = association.thruDate ? new Date(association.thruDate).getTime() : Number.POSITIVE_INFINITY;
  return fromDate <= now && thruDate > now;
};

/** The product's active outgoing substitutes, from an associations response. */
export function activeSubstitutes(data: any, productId: string): SubstituteAssociation[] {
  return rows(data)
    .filter((association: any) =>
      association.productAssocTypeId === 'PRODUCT_SUBSTITUTE'
      && (association.productId === productId || association.direction === 'outgoing')
      && activeAt(association))
    .map((association: any) => ({
      productId,
      productIdTo: association.productIdTo || association.relatedProductId,
      productAssocTypeId: 'PRODUCT_SUBSTITUTE' as const,
      fromDate: association.fromDate,
      thruDate: association.thruDate
    }))
    .filter((association: SubstituteAssociation) => association.productIdTo);
}
