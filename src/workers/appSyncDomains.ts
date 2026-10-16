import type { SyncDomain } from "@common/db/types";
import { commonDomains } from "@common/db/seed/seedDomains";
import { productDomain } from "./domains/productDomain";

/** Every domain the worker registers: all the framework seed domains (the db takes the whole common schema), and Order Manager's own. */
export const appSyncDomains: SyncDomain[] = [...Object.values(commonDomains), productDomain];
