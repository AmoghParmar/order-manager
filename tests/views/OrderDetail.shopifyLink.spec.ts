import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('order detail Shopify Admin deep-link', () => {
  const view = readFileSync(resolve(process.cwd(), 'src/views/OrderDetail.vue'), 'utf8');
  const seed = readFileSync(resolve(process.cwd(), 'src/store/seed.ts'), 'utf8');

  it('resolves the shop from the order\'s own shopifyShopOrder record', () => {
    // The authoritative per-order source (same one CloneOrderModal uses) — which
    // shop the order actually came from, not a guess.
    expect(view).toContain('/shopifyShopOrder');
    expect(view).toContain('shopifyAdminOrderUrl(');
  });

  it('never infers the shop from the product store (PR #174 review)', () => {
    // A product store can feed multiple Shopify shops; inferring by product store
    // can deep-link into the wrong shop's admin. An order without a
    // shopifyShopOrder record gets no link instead of a guessed one.
    expect(view).not.toContain('shopifyShopByProductStore');
    expect(seed).not.toContain('shopifyShopByProductStore');
  });

  it('renders the link only when a URL resolved, opening a safe new tab', () => {
    expect(view).toContain('v-if="id.shopifyAdminUrl"');
    expect(view).toContain('rel="noopener noreferrer"');
    expect(view).toContain(':aria-label="translate(\'View in Shopify\')"');
  });
});
