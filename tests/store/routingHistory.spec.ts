import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRoutingHistoryStore } from "@/store/routingHistory";

vi.mock("@common", () => ({ logger: { error: vi.fn() } }));

// The store's own fetch actions, replaced on the store instance so the loaders call these.
const fetchRoutingChanges = vi.fn();
const fetchStockMovements = vi.fn();
const fetchLocationStock = vi.fn();

// The caller's facility rows: one parking lot whose id does not follow the *_PARKING convention.
const facilities = [{ facilityId: "LOT", facilityTypeId: "PARKING_LOT" }];
const facilityTypes = [{ facilityTypeId: "PARKING_LOT", parentTypeId: "VIRTUAL_FACILITY" }];

const ORDER_ID = "100";
const items = [{ orderItemSeqId: "01", productId: "P1", facilityId: "_NA_" }];
const change = (id: string) => ({ orderFacilityChangeId: id, orderItemSeqId: "01" });

describe("routing history store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fetchRoutingChanges.mockReset();
    fetchStockMovements.mockResolvedValue({ rows: [], truncated: false });
    fetchLocationStock.mockResolvedValue({});
    Object.assign(useRoutingHistoryStore(), { fetchRoutingChanges, fetchStockMovements, fetchLocationStock });
  });

  it("reads the routing again after the order's items moved", async () => {
    const store = useRoutingHistoryStore();
    fetchRoutingChanges.mockResolvedValueOnce([change("a")]).mockResolvedValueOnce([change("a"), change("b")]);

    await store.loadRoutingHistory(ORDER_ID, items);
    await store.loadRoutingHistory(ORDER_ID, items);
    expect(fetchRoutingChanges).toHaveBeenCalledTimes(1);

    store.markStale(ORDER_ID);
    await store.loadRoutingHistory(ORDER_ID, items);
    expect(fetchRoutingChanges).toHaveBeenCalledTimes(2);
    expect(store.changesByOrderId[ORDER_ID]).toHaveLength(2);
  });

  it("runs a forced load again after one already running, instead of reusing its older read", async () => {
    const store = useRoutingHistoryStore();
    let finishFirst: (rows: any[]) => void = () => undefined;
    fetchRoutingChanges
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce([change("a"), change("b")]);

    const first = store.loadRoutingHistory(ORDER_ID, items);
    const forced = store.loadRoutingHistory(ORDER_ID, items, { force: true });
    finishFirst([change("a")]);
    await Promise.all([first, forced]);

    expect(fetchRoutingChanges).toHaveBeenCalledTimes(2);
    expect(store.changesByOrderId[ORDER_ID]).toHaveLength(2);
  });

  it("keeps the routing on screen while it reloads, and when the reload fails", async () => {
    const store = useRoutingHistoryStore();
    let failReload: (err: Error) => void = () => undefined;
    fetchRoutingChanges
      .mockResolvedValueOnce([change("a")])
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { failReload = reject; }))
      .mockResolvedValueOnce([change("a"), change("b")]);

    await store.loadRoutingHistory(ORDER_ID, items);
    const reload = store.loadRoutingHistory(ORDER_ID, items, { force: true });
    expect(store.statusFor(ORDER_ID)).toBe("loaded");
    failReload(new Error("offline"));
    await reload;
    expect(store.statusFor(ORDER_ID)).toBe("loaded");
    expect(store.changesByOrderId[ORDER_ID]).toHaveLength(1);

    // The failed reload is retried on the next visit.
    await store.loadRoutingHistory(ORDER_ID, items);
    expect(store.changesByOrderId[ORDER_ID]).toHaveLength(2);
  });

  it("reads stock only at real locations, telling them apart by the caller's facility rows", async () => {
    const store = useRoutingHistoryStore();

    await store.fetchItemLocationStock([
      { orderItemSeqId: "01", productId: "P1", facilityId: "WH" },
      { orderItemSeqId: "02", productId: "P1", facilityId: "LOT" },
      { orderItemSeqId: "03", productId: "P1", facilityId: "REJECTED_ITM_PARKING" },
    ], facilities, facilityTypes);

    expect(fetchLocationStock).toHaveBeenCalledWith([{ productId: "P1", facilityId: "WH" }]);
  });

  it("shows an error when the first load fails", async () => {
    const store = useRoutingHistoryStore();
    fetchRoutingChanges.mockRejectedValueOnce(new Error("offline"));

    await store.loadRoutingHistory(ORDER_ID, items);
    expect(store.statusFor(ORDER_ID)).toBe("error");
  });
});
