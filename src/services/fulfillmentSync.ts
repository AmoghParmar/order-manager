import { api } from '@common';

export interface SortRule {
  /** The sort field: a PP_SORT_PARAM_TYPE enum's enumCode. */
  id: string;
  sequenceNum: number;
  conditionSeqId: string;
}

export async function getPickProfileGroups(params?: any): Promise<any[]> {
  try {
    const response = await api({
      url: 'poorti/pickProfile/groups',
      method: 'GET',
      params
    });
    const list = response.data;
    return Array.isArray(list) ? list : list?.entityValueList || [];
  } catch (error) {
    console.error('Failed to get pick profile groups from server', error);
    return [];
  }
}
