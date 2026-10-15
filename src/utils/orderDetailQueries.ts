import { commonUtil } from "@common";

/**
 * OrderFacilityChange reason written for every failed brokering attempt. A single
 * order can accumulate thousands of these (11.5k on the worst order observed), so
 * the timeline excludes them from the row-level fetch and shows a count instead.
 */
export const UNFILLABLE_REASON_ID = "UNFILLABLE";

/**
 * How many UNFILLABLE rows to pull when summarising failed brokering.
 *
 * The rows themselves are needed, not just a count: one routing run writes a row per
 * unfillable item, so the attempt count comes from grouping rows by run. (The response's
 * `X-Total-Count` would not help even if it were readable — OMS omits it from
 * `Access-Control-Expose-Headers`, so the PWA's cross-origin session cannot see it —
 * and it counts rows, not runs.) An order whose failures fill this page is reported
 * as "N+".
 */
export const UNFILLABLE_SAMPLE_SIZE = 100;

/**
 * How many facility-change rows to read per order, newest first. A page that fills means older
 * moves exist beyond it; the count header that would say how many is hidden from the browser.
 */
export const FACILITY_CHANGE_PAGE_SIZE = 200;

/** A product issued at a facility: one order line of a POS-completed ship group. */
export interface IssuanceLine {
  productId: string;
  facilityId: string;
}

/** The rows of a list response; a response carrying an error throws its data. */
export function responseRows(resp: any): any[] {
  if (commonUtil.hasError(resp)) throw resp.data;
  return Array.isArray(resp.data) ? resp.data : (resp.data?.docs || []);
}
