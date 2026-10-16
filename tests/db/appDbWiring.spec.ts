import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDomainWiring, checkSyncLifecycle } from "@common/db/testing/appDbWiring";
import { orderManagerDb } from "@/db/orderManagerDb";
import { appSyncDomains } from "@/workers/appSyncDomains";

const source = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

describe("Order Manager app database wiring", () => {
  // The worker registers `appSyncDomains`: every framework seed domain (the database takes the whole
  // common schema) and Order Manager's own, so the two must line up table for table.
  it("fills every table from a registered domain, and every domain's table exists", () => {
    expect(checkDomainWiring({
      tables: Object.keys(orderManagerDb.tables),
      domains: appSyncDomains,
    })).toEqual([]);
  });

  it("starts the sync on authentication, restarts it on login and stops it on logout", () => {
    expect(checkSyncLifecycle({ appVue: source("App.vue"), userStore: source("store/user.ts") })).toEqual([]);
  });
});
