import { ref } from 'vue';
import { api } from '@common';
import type { TaskFilterOption } from '@/types/orderTaskFilters';

const VIRTUAL_FACILITY_TYPE_ID = 'VIRTUAL_FACILITY';

export function usePhysicalFacilityOptions() {
  const facilityOptions = ref<TaskFilterOption[]>([]);

  /** Every facility that is neither virtual nor under a virtual parent type. */
  async function fetchPhysicalFacilities(): Promise<any[]> {
    const response = await api({
      url: 'oms/facilities',
      method: 'GET',
      params: {
        pageSize: 1000,
        facilityTypeId: VIRTUAL_FACILITY_TYPE_ID,
        facilityTypeId_not: 'Y',
        parentTypeId: VIRTUAL_FACILITY_TYPE_ID,
        parentTypeId_not: 'Y',
      },
    });
    return responseList(response.data);
  }

  async function loadPhysicalFacilities() {
    try {
      facilityOptions.value = (await fetchPhysicalFacilities())
        .map((facility: any) => ({
          id: facility.facilityId || facility.id,
          label: facility.facilityName || facility.name || facility.facilityId || facility.id,
        }))
        .filter((facility: TaskFilterOption) => facility.id);
    } catch {
      facilityOptions.value = [];
    }
  }

  return { facilityOptions, loadPhysicalFacilities, fetchPhysicalFacilities };
}

function responseList(data: any): any[] {
  return Array.isArray(data) ? data : data?.entityValueList || data?.docs || data?.list || data?.items || [];
}
