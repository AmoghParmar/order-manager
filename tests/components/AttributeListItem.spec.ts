import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('AttributeListItem', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/orders/AttributeListItem.vue'), 'utf8');

  it('maps the name and value into a horizontal key/value pair', () => {
    // Name at the start, value trailing on the same row, both inside one
    // wrapping flex container so they stack on narrow widths.
    expect(source).toContain('class="attribute-kv__pair"');
    expect(source).toContain('class="attribute-kv__name"');
    expect(source).toContain('{{ name }}');
    expect(source).toContain('class="attribute-kv__value"');
    expect(source).toContain('hasValue ? value : translate(\'Value not available\')');
  });

  it('uses flexbox rather than ion-grid for the layout', () => {
    expect(source).toContain('display: flex;');
    expect(source).toContain('flex-wrap: wrap;');
    expect(source).toContain('justify-content: space-between;');
    expect(source).not.toContain('<ion-grid');
    expect(source).not.toContain('<ion-row');
    expect(source).not.toContain('<ion-col');
  });

  it('renders a clear empty state instead of dropping blank values', () => {
    expect(source).toContain('attribute-kv__value--empty');
    // hasValue treats whitespace-only / null / undefined as empty.
    expect(source).toContain("String(value).trim() !== ''");
  });

  it('exposes a trailing slot for row actions (e.g. delete)', () => {
    expect(source).toContain('<slot name="end" />');
  });

  it('keeps the description as secondary supporting text', () => {
    expect(source).toContain('v-if="description"');
    expect(source).toContain('class="attribute-kv__description"');
  });
});
