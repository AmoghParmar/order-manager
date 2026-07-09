import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('Packed orders scan layout', () => {
  const packedOrdersSource = readFileSync(resolve(process.cwd(), 'src/views/PackedOrders.vue'), 'utf8');

  it('renders packed rows through the page-owned scan layout instead of the generic workflow list', () => {
    expect(packedOrdersSource).not.toContain('WorkflowOrderList');
    expect(packedOrdersSource).toContain('class="list-item packed-order-row"');
    expect(packedOrdersSource).toContain('--columns-desktop: 5');
    expect(packedOrdersSource).toContain('--columns-tablet: 5');
  });

  it('keeps packed-specific fields visible in the row', () => {
    expect(packedOrdersSource).toContain('packedStatusLabel(order)');
    expect(packedOrdersSource).toContain('carrierLabel(order)');
    expect(packedOrdersSource).toContain('workflowDateLabel(order)');
    expect(packedOrdersSource).toContain('formatCurrency(order.grandTotal, order.currencyUomId)');
    expect(packedOrdersSource).toContain('itemCountLabel(order)');
    expect(packedOrdersSource).toContain('shipmentContextLabel(order)');
  });

  it('keeps selection mode, bulk actions, and infinite scroll wired to the packed bucket', () => {
    expect(packedOrdersSource).toContain("const bucket = 'packed'");
    expect(packedOrdersSource).toContain('toggleCurrentPageSelection($event.detail.checked)');
    expect(packedOrdersSource).toContain('setOrderSelection(order.orderId, $event.detail.checked)');
    expect(packedOrdersSource).toContain('store.runBulkAction(bucket, action.id)');
    expect(packedOrdersSource).toContain('orderStore.loadMoreWorkflowOrders(bucket, filters.value)');
  });
});
