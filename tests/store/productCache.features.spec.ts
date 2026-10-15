import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('product master selectable features', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/utils/productDocs.ts'), 'utf8');
  const cache = readFileSync(resolve(process.cwd(), 'src/store/productCache.ts'), 'utf8');
  const db = readFileSync(resolve(process.cwd(), 'src/db/productDb.ts'), 'utf8');

  it('asks Solr for productFeatures and caches the field', () => {
    expect(source).toContain('goodIdentifications mainImageUrl productFeatures');
    expect(source).toContain('productFeatures: Array.isArray(doc.productFeatures) ? doc.productFeatures : [],');
    expect(db).toContain('productFeatures: string[];');
  });

  it('refetches a product cached before the field existed, instead of stranding it', () => {
    // The cache never refetches a hit, so a record persisted without the key would never
    // gain features. A missing key is a miss; an empty array is a real answer.
    // the check now spans every cached identity field, productFeatures included
    expect(source).toContain('CACHED_IDENTITY_KEYS.every((key) => key in product)');
    expect(source).toContain('"productFeatures",');
    expect(cache).toContain('.filter((id) => !isFullyCached(this.getProduct(id)));');
    expect(cache).toContain('if (isFullyCached(existing) && !opts?.refresh)');
  });
});
