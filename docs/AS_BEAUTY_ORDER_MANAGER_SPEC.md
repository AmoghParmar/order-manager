# AS Beauty Order Manager Feature Spec

> Developer handoff for Claude or another implementation agent.
> Read this after `PROJECT.md`, `CONVENTIONS.md`, and `ENDPOINTS.md`.

## Purpose

AS Beauty is an OMS sales/RFP opportunity. The RFP is the source of truth for
feature needs. Jira is useful for execution tracking, but do not start from Jira
when deciding product scope.

This document defines the `order-manager` portion of the AS Beauty work. It is
not a suite-wide implementation plan. The key positioning is:

- `order-manager` is the CSR and live-operations action workspace.
- Product master setup belongs in Product Data Management.
- Routing, ATP, inventory policy, release policy, and sourcing decisions belong
  in the target merged Sourcing & Availability app.
- Preorder lifecycle remains in the Preorder app.
- Fulfillment remains post-release execution only.
- User access and MFA belong in User Management.
- Scheduled exports and cross-record report delivery belong in Job Manager and
  DataDocuments.

## Hard Rules

- Use core Ionic components.
- Do not use `ion-grid`, `ion-row`, `ion-col`, or Ionic grid utility classes.
- Do not add CSS or edit existing CSS unless explicitly instructed.
- Keep all screens mobile-compatible.
- Avoid duplicate information. If a summary appears once, later panels should
  show only additional context or actions.
- Use `api` from `@common` for all HTTP calls.
- Do not use mock data in production paths.
- Use the current repo shape: route view, service module, Pinia store, shared
  types, and colocated tests.

## Current App Baseline

The app currently has these production surfaces:

- `/orders` and `/orders/:orderId`
- `/shipments` and `/shipments/:shipmentId`
- `/returns` and `/returns/:returnId`
- `/customers` and `/customers/:customerId`
- `/settings`

Current implementation patterns:

- Views live in `src/views`.
- Domain service modules live in `src/services`.
- Pinia stores live in `src/store`.
- Shared types live in `src/types/order.ts`.
- Route definitions live in `src/router/index.ts`.
- Navigation entries live in `src/components/Menu.vue`.

The existing app is mostly search/detail oriented. AS Beauty requires
`order-manager` to become an action workspace for live operational exceptions,
CSR tasks, order edits, returns, refunds, and financial visibility.

### Order Detail Data Coverage

The order detail store should retain every non-sensitive field already returned
by `GET oms/orders/{orderId}` so the UI can surface customer, payment,
fulfillment, and line-item context without extra calls. Do not persist raw
payment security fields such as `securityCode` or `track2`; keep normalized,
typed fields only.

Known data gaps that require additional entity reads or DataDocuments:

| Missing data | Entity/data source needed | Why it matters |
| --- | --- | --- |
| Item groups | `OrderItemGroup`, `OrderItemGroupMember` | Group bundle, kit, gift-with-purchase, and primary/component line context. |
| Item associations | `OrderItemAssoc` | Replacement, related-line, exchange, kit, or split lineage between order items. |
| Raw item entity details | `OrderItem` DataDocument or entity read | Fields beyond `OrderItemShipmentDetail`, including `orderItemGroupSeqId`, item type, promo flags, requested dates, comments, and price variants. |
| Adjustments | `OrderAdjustment`, `OrderAdjustmentAttribute` | Order-level and line-level discounts, appeasements, tax/shipping adjustments, and explanation text. |
| Rich order contacts | `OrderContactMech + ContactMech + PostalAddress + TelecomNumber` | Full bill-to/ship-to/contact purpose detail when the service payload is incomplete. |
| Order content attachments | `OrderContent` plus content/data-resource joins if needed | Shopify/source docs, customer-visible artifacts, or attached operational evidence. |
| Expanded payment trail | `OrderPaymentPreference` plus payment/gateway entities where available | Authorization, capture, presentment, and allocation context beyond summary status. |
| Order terms | `OrderTerm` or equivalent term DataDocument if enabled | Payment/tax/shipping terms shown in legacy order detail. |

## Suite Ownership Boundaries

### Owned By Order Manager

`order-manager` should own:

- Held-order and cancellation-window queues.
- Live order release/cancel/hold-extension operations.
- Incident mode activation for live events.
- Broad order-level overrides with audit.
- Broken-order quarantine review and correction.
- CSR task queue and task detail.
- Post-purchase order edits and full or partial cancellations.
- Return, RMA, exchange, and refund CSR workflows.
- Customer creation, replacement/manual order entry, merge/link review, and
  customer 360 export proof.
- Focused inventory insight when a CSR is editing or replacing an order.
- Order-level financial event visibility and AMT export eligibility.
- AS Beauty operational command dashboard.

### Not Owned By Order Manager

Do not implement these as order-manager configuration surfaces:

- BOM setup, GWP fallback setup, SKU aliases, tax/GL product attributes, or
  logistics metadata. These belong in Product Data Management.
- Routing rule templates, ATP rules, virtual pools, safety stock, oversell
  policy, future stock policy, release policy, and throttle configuration. These
  belong in Sourcing & Availability.
- Preorder product setup, promise dates, and preorder lifecycle management.
  These belong in Preorder.
- Picking, packing, shipping, labels, carrier methods, picker assignment, and
  warehouse/store execution exceptions after release. These belong in
  Fulfillment.
- Role templates, brand/legal-entity access, and MFA setup. These belong in
  User Management.
- Scheduled report/export delivery and cross-record audit export history. These
  belong in Job Manager/DataDocuments.

## Proposed Navigation

Add these primary menu entries after the existing search entries:

| Menu label | Route | Purpose |
| --- | --- | --- |
| Operations | `/operations` | AS Beauty live operations dashboard |
| Held orders | `/operations/holds` | Hold window, cancellation, release, and override queue |
| Quarantine | `/operations/quarantine` | Broken orders needing correction |
| Tasks | `/tasks` | CSR task queue |

Do not remove the existing `Find orders`, `Find returns`, `Find customers`, or
`Find shipments` entries. Those remain the durable search entry points.

## Feature 1: Held Orders And Cancellation Window

### RFP Coverage

- `1.1.1.5`: Configurable time delays before warehouse release.
- `1.1.1.7`: Intercept cancellation webhooks during grace period.
- `1.1.1.13`: Queue and validate orders before fulfillment.
- `1.1.1.11`: Channel-specific TikTok logic as current/OOB foundation.
- `1.1.1.12`: Auto-allocate clean orders as current/OOB foundation.

### Product Positioning

Sourcing & Availability owns hold policy and release eligibility rules.
`order-manager` owns the live queue and order-level action surface.

### UI Surface

Create `src/views/HeldOrderQueue.vue`.

The screen should show:

- Filters: brand, channel, product store, facility, hold reason, release state,
  cancellation-window state.
- List rows for held/releasable orders.
- One primary status per row: `Held`, `Cancellation received`, `Ready to
  release`, `Blocked`, `Override required`, or `Released`.
- Focused row context: order id/name, customer, channel, brand/store, hold
  expiry, release eligibility, current route/facility, and blocking reason.
- Actions: release, cancel, extend hold, re-evaluate sourcing, force override,
  add note, create task.

Do not duplicate the full order summary from `OrderDetail.vue`. Link each row to
`/orders/:orderId` for full detail.

### Service And Store

Create:

- `src/services/operations.ts`
- `src/store/operations.ts`

Suggested exported service functions:

```ts
export interface HeldOrderSearchParams {
  brandId?: string;
  channel?: string;
  productStoreId?: string;
  facilityId?: string;
  holdReasonId?: string;
  releaseState?: string;
  cancellationState?: string;
  pageSize?: number;
  pageIndex?: number;
}

export async function searchHeldOrders(params: HeldOrderSearchParams): Promise<HeldOrderSearchResult>;
export async function getHeldOrder(orderId: string): Promise<HeldOrderDetail>;
export async function releaseHeldOrder(orderId: string, payload: ReleaseOrderPayload): Promise<OrderOperationResult>;
export async function cancelHeldOrder(orderId: string, payload: CancelHeldOrderPayload): Promise<OrderOperationResult>;
export async function extendOrderHold(orderId: string, payload: ExtendHoldPayload): Promise<OrderOperationResult>;
export async function reevaluateSourcing(orderId: string): Promise<SourcingDecisionPreview>;
```

Backend endpoints do not appear in `ENDPOINTS.md` today. Add API gaps to
`ENDPOINTS.md` once the target service paths are confirmed.

### State Handling

The store must track:

- Queue search params.
- Current result page and total.
- Per-order pending action state.
- Per-order action result or error.
- Last refresh timestamp.

Bulk actions should store partial successes and failures by order id.

## Feature 2: Incident Mode And Broad Overrides

### RFP Coverage

- `1.1.1.6`: Prioritize orders by configurable business rules.
- `1.1.1.13`: Queue and validate before fulfillment.
- `1.1.1.15`: Route social orders to high-velocity pick zones.
- `2.3.19`: Bulk order actions.
- `2.3.20`: Automated workflows and routing rules.
- Scenario coverage: viral TikTok/influencer event and 24-hour operational
  pivot.

### Product Positioning

Order-manager activates incident mode because operators are responding to live
orders. Sourcing & Availability still owns baseline policy. Incident mode should
not permanently edit routing or ATP policy.

### UI Surface

Extend `HeldOrderQueue.vue` and add a modal or detail view:

- `IncidentModeModal.vue`
- `OverridePreviewModal.vue`

Incident mode should allow:

- Force release.
- Force route/facility.
- Force hold.
- Force split or keep together.
- Priority override.
- Bulk cancel.
- Bulk queue move.

Fast incident mode means low friction, but not unaudited. Capture:

- Actor.
- Timestamp.
- Reason code or free-text reason.
- Affected order count.
- Before and after route/release state.
- Whether policy was bypassed.

### Guardrails

Do not block every action behind supervisor approval for v1. Use permission
gating plus audit. If backend returns `approvalRequired`, render that state and
do not treat it as success.

### Suggested Types

Add to `src/types/order.ts` or a new `src/types/operations.ts` if the file grows
too large:

```ts
export interface IncidentModeState {
  active: boolean;
  incidentId?: string;
  name?: string;
  reason?: string;
  activatedBy?: string;
  activatedAt?: string;
}

export interface OrderOverridePayload {
  orderIds: string[];
  actionType: 'force-release' | 'force-route' | 'force-hold' | 'force-split' | 'keep-together' | 'priority';
  reasonCode?: string;
  reason?: string;
  targetFacilityId?: string;
  priority?: string;
}
```

## Feature 3: Broken Order Quarantine

### RFP Coverage

- `1.1.3.6`: Fuzzy storefront shipping text to WMS carrier code mapping.
- `1.1.4.1`: Shipping and cost checks based on ship-to address.
- `1.1.4.3`: Configurable fraud rules.
- `7.1`: Catch and fix broken orders before DC transmission.
- `7.4`: Parse incoming batches, quarantine broken orders, transmit healthy
  orders.

### Product Positioning

Order-manager owns human quarantine review. Validation reasons may originate
from Sourcing & Availability, Product Data, carrier mapping services, fraud
services, or import validation.

### UI Surface

Create `src/views/QuarantineQueue.vue`.

Show:

- Reason category: address, carrier mapping, product/BOM, inventory, fraud/risk,
  malformed payload, payment/tax, unknown.
- Suggested correction when available.
- Related order, customer, channel, brand, facility, and payload/source.
- Actions: apply suggestion, edit correction fields, cancel order, retry
  validation, create CSR task, add note.

### Backend Needs

Required API contracts:

- Search quarantined orders.
- Read one quarantine case.
- Preview correction.
- Submit correction.
- Retry validation.
- Cancel/quarantine resolution.

## Feature 4: CSR Task Queue

### RFP Coverage

- `2.1.8`: Assign unresolved customer service tasks to reps or supervisors.
- `2.3.9`: Manage lifecycle of order issues.
- `2.3.12`: Shipment exception handling.
- `2.3.16`: SLA tracking.
- `2.3.20`: Automated workflows and routing rules for issue queues.

### Product Positioning

Order-manager owns the CSR task queue. Tasks may be generated by order holds,
shipment exceptions, short ships, refund-pending cases, quarantine, address
issues, or manual creation.

### UI Surface

Create:

- `src/views/TaskQueue.vue`
- `src/views/TaskDetail.vue`

Routes:

- `/tasks`
- `/tasks/:taskId`

Task list fields:

- Task id.
- Related order/customer/return/shipment.
- Queue.
- Owner.
- Status.
- Priority.
- Reason code.
- SLA/due time.
- Next step.

Task detail actions:

- Assign or reassign.
- Change queue.
- Change status.
- Escalate.
- Add note.
- Link to order, customer, return, or shipment.
- Resolve with reason.

### Store And Service

Create:

- `src/services/tasks.ts`
- `src/store/tasks.ts`

The implementation should expect WorkEffort-backed APIs, but do not hard-code
WorkEffort field names in the UI layer. Normalize API response into task types.

## Feature 5: Post-Purchase Order Actions

### RFP Coverage

- `2.3.8`: Undo actions taken on an order.
- `2.3.10`: Edit address, items, and shipping method within windows.
- `2.3.11`: Full and partial cancellations with recalculation.
- `1.1.4.6`: Cancel full order or line items.
- `2.3.7`: CSRs can use payment types and promotion codes.

### Product Positioning

Order-manager owns the guided CSR action flow. Backend services own
recalculation, tax, promotion, payment/refund impact, and mutation.

### UI Surface

Extend `OrderDetail.vue` with action entry points, but keep complex workflows in
dedicated modal components or child route views.

Suggested components:

- `src/components/order-actions/EditShippingAddressModal.vue`
- `src/components/order-actions/EditShippingMethodModal.vue`
- `src/components/order-actions/CancelOrderModal.vue`
- `src/components/order-actions/CancelLineItemsModal.vue`
- `src/components/order-actions/OrderActionResult.vue`
- `src/components/order-actions/UndoActionPanel.vue`

Required interaction pattern:

1. Open action.
2. Fetch editable state and allowed window.
3. User changes fields.
4. Preview recalculation.
5. Show total, tax, promotion, payment/refund, and financial event impact.
6. Submit.
7. Render success/partial failure/error.
8. Refresh affected order sections.

### Existing Registry

Update `src/services/orderActions.ts` so AS Beauty action gaps are explicit.
Do not render backend-gap actions as if they work.

## Feature 6: Returns, RMA, Exchanges, And Refunds

### RFP Coverage

- `1.1.6.1`: Whole or partial returns.
- `1.1.6.2`: Exchanges with refund amount or amount due.
- `1.1.6.3`: Refund multiple payment types by rules.
- `1.1.6.4`: Link returns/exchanges to original orders.
- `1.1.6.6`: Regional return/refund requirements.
- `1.1.6.7`: Appeasements.
- `2.3.14`: Configurable refund methods.
- `2.3.15`: Full return lifecycle.

### Product Positioning

Order-manager owns end-to-end CSR return/refund flow. Backend APIs own refund
policy selection, calculation, approval rules, and financial events.

### UI Surface

Extend `ReturnDetail.vue` and add create/action flows:

- `src/views/CreateReturn.vue`
- `src/components/returns/ReturnItemsStep.vue`
- `src/components/returns/ExchangeStep.vue`
- `src/components/returns/RefundPreviewStep.vue`
- `src/components/returns/ReturnActionResult.vue`

Routes:

- `/returns/new`
- `/orders/:orderId/returns/new`

Required flows:

- Create RMA from order.
- Select item/quantity/reason.
- Choose refund, exchange, appeasement, or mixed outcome.
- Preview refund allocation across original payment, store credit, and split
  tender.
- Display approval-required state.
- Submit and link return/exchange/refund back to original order items.
- Track label, receive status, refund status, and credit memo/financial event.

## Feature 7: Customer Tools

### RFP Coverage

- `2.2.4`: Merge customer profiles.
- `2.2.5`: Link customer profiles.
- `2.3.1`: CSR order entry.
- `2.3.2`: CSR customer profile creation.
- `2.3.21`: Unified customer 360 view.
- `2.3.22`: Customer 360 data for external systems.

### Product Positioning

Order-manager is not a full CRM. It should provide CSR tools required to resolve
order problems.

### UI Surface

Extend customer surfaces:

- Add `/customers/new`.
- Add `/customers/:customerId/order-entry`.
- Add customer merge/link panels on `CustomerDetail.vue`.
- Add a Customer 360 export/proof panel.

Focused inventory insight is allowed inside order entry or replacement order
flows so CSRs can decide whether an item can be offered. Do not expose ATP
policy editing here.

## Feature 8: Financial Visibility

### RFP Coverage

- `1.1.1.9`: TikTok co-funded promotion parsing.
- `1.1.2.3`: Manual tax override outcome.
- `1.1.2.8`: Product tax-code mapping.
- `1.1.2.9`: Gross sales, shipping revenue, discounts, TikTok CFP credits.
- `1.1.2.10`: GL account or brand entity code per line.
- `3.1`: Push only clean, shipped, financially reconciled orders to AMT.
- `Funds in Flight`: Track initiated returns awaiting receipt.

### Product Positioning

Order-manager shows order-level financial state. It does not own finance
configuration or settlement processing.

### UI Surface

Add a financial accordion or section to `OrderDetail.vue`.

Show:

- Gross sales.
- Shipping revenue.
- Discounts.
- TikTok CFP credit.
- Tax amount and override state.
- GL account.
- Brand/legal entity.
- Refund liability.
- Funds in flight.
- Return/credit memo status.
- AMT export eligibility.
- Export status and latest failure reason.

Do not duplicate the existing payments accordion. The financial section should
explain downstream accounting state, not list tender details again.

## Feature 9: Operational Dashboard

### RFP Coverage

- `1.1.1.10`: Visibility into non-revenue and subscription orders.
- `8.1`: On-demand real-time reporting.
- `8.2`: Custom reports.
- `8.4`: AMT reporting or comparable.
- `8.5`: Audit logs.

### Product Positioning

Order-manager owns the live operational dashboard for AS Beauty-style incident
response. Job Manager/DataDocuments own report exports and scheduled delivery.

### UI Surface

Create `src/views/OperationsDashboard.vue` at `/operations`.

Dashboard metrics:

- Orders received.
- Held.
- Released.
- Cancelled during hold.
- Quarantined.
- Short-shipped.
- Refund pending.
- Return pending.
- Task backlog.
- AMT export pending.
- Export failed.

Each metric should link to the relevant filtered queue or search view.

## Permissions

Use `useUserStore().hasPermission(...)` for render-time and click-time checks.
Confirm permission IDs before final implementation.

Suggested permission groups:

- `ORDERMGR_VIEW`: view order-manager.
- `ORDERMGR_UPDATE`: edit order/customer/return details.
- `ORDERMGR_TASK_ADMIN`: assign/escalate CSR tasks.
- `ORDERMGR_INCIDENT_ADMIN`: activate/deactivate incident mode.
- `ORDERMGR_OVERRIDE`: submit force route/release/hold overrides.
- `ORDERMGR_REFUND`: submit refund/RMA actions.
- `ORDERMGR_FINANCIAL_VIEW`: view financial event and AMT export state.

If permission IDs do not exist, document the backend gap rather than inventing
silent client-only gates.

## API Gap Register

Add these to `ENDPOINTS.md` once service names are confirmed:

| Capability | Needed by |
| --- | --- |
| Held order search/detail | Held order queue |
| Release/cancel/extend hold | Held order actions |
| Re-evaluate sourcing | Held order action and order detail |
| Incident mode state | Operations dashboard and held order queue |
| Override preview/submit | Incident mode and bulk actions |
| Quarantine search/detail/correction | Quarantine queue |
| CSR task search/detail/update | Task queue |
| Edit address/method preview/submit | Order actions |
| Full/partial cancellation recalculation | Order actions |
| Undo/audit action lookup | Order detail |
| Create RMA | Return flow |
| Exchange/refund calculation | Return flow |
| Refund policy preview/submit | Return flow |
| Customer creation | Customer tools |
| Manual/replacement order entry | Customer tools |
| Customer merge/link preview/submit | Customer tools |
| Customer 360 export payload | Customer detail |
| Financial events by order | Order financial section |
| AMT export eligibility/status | Order financial section |

## Testing Requirements

### Unit Tests

Add or extend tests for:

- Payload builders for held-order search, override preview, task search, return
  creation, refund preview, and financial event fetches.
- Normalizers for held orders, quarantine cases, tasks, refund previews,
  financial events, and customer 360 payloads.
- Store transitions for pending/success/error states.
- Permission helper behavior for new actions.

### Component Tests

Use Vitest/jsdom patterns already in the repo. Cover:

- Mobile-width rendering assumptions.
- Loading, empty, error, and populated states.
- Preview/confirmation/result states.
- Hidden actions when permissions are missing.
- Action-disabled states while API calls are pending.

### Integration/Smoke Scenarios

Run against a real or dev instance when endpoints exist:

- TikTok order enters hold and cancellation prevents release.
- Held order is force released in incident mode.
- Bulk override produces partial success and partial failure.
- Quarantine correction retries validation.
- CSR task is assigned, updated, and resolved.
- Address edit previews recalculation before submit.
- Partial cancellation recalculates totals and financial impact.
- RMA is created from an order.
- Exchange/refund preview returns deterministic allocation.
- Short-ship refund creates financial visibility.
- AMT export eligibility excludes open or cancelled-before-ledger events.

## Implementation Order For Claude

1. Add route shells, menu entries, and empty-state views for Operations, Held
   Orders, Quarantine, and Tasks.
2. Add typed service/store scaffolding for operations and tasks with unit tests
   for payload builders and normalizers.
3. Implement held-order queue read path once backend endpoints are available.
4. Implement incident mode and override preview/submit.
5. Implement quarantine queue.
6. Implement CSR task queue and detail.
7. Add order action flows for edits/cancellations.
8. Add returns/RMA/refund flows.
9. Add customer creation/order-entry/merge/link/customer-360 tools.
10. Add financial visibility section to order detail.
11. Add operations dashboard metrics and filtered links.
12. Update `ENDPOINTS.md` and this spec with actual endpoint names and response
    shapes as each backend contract is confirmed.

## Handoff Notes

- If a backend endpoint does not exist, keep the UI action documented as a gap
  and do not wire it to legacy OFBiz.
- If an AS Beauty requirement appears to belong in another app, document the
  handoff instead of implementing a duplicate order-manager control.
- If adding focused inventory insight to order-manager, keep it read-only and
  decision-specific. Full inventory policy and adjustment controls remain in
  Sourcing & Availability.
- If implementing a Product Data or Sourcing feature while in this repo, stop
  and create a separate spec in that owning app instead.
