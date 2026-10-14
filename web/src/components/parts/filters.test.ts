import { describe, expect, it } from 'vitest';
import type { CatalogPart } from '@/lib/types';
import { activeCount, applyFilters, buildFacets, cellOf, EMPTY_FILTERS, sortRows, specNum, type Row } from './filters';

const part = (id: string, specs: Record<string, string | number>, source?: 'listing'): CatalogPart =>
  ({ id, cat: 'cpu', brand: 'B', name: id, glyph: '', facet: 'x', warrantyY: 3, specs, vis: {}, source }) as CatalogPart;
const row = (id: string, specs: Record<string, string | number>, o: Partial<Row> = {}, source?: 'listing'): Row =>
  ({ p: part(id, specs, source), price: 100, inStock: true, fits: true, ...o });

const rows = [
  row('a', { cores: 6, socket: 'AM5' }, { price: 300 }),
  row('b', { cores: 12, socket: 'LGA1851' }, { price: 900 }),
  row('c', { socket: 'AM5' }, { price: null, inStock: false }, 'listing'),
  row('d', { cores: 8 }, { price: 500, fits: false }),
];
const ids = (rs: Row[]) => rs.map((x) => x.p.id);

describe('specNum', () => {
  it('parses numbers and numeric strings, rejects the rest', () => {
    expect(specNum(5)).toBe(5);
    expect(specNum('3.5')).toBe(3.5);
    expect(specNum('2 TB')).toBeNull();
    expect(specNum('—')).toBeNull();
    expect(specNum(undefined)).toBeNull();
  });
});

describe('buildFacets', () => {
  it('makes numeric and categorical facets from present values only', () => {
    const f = buildFacets([['cores', 'Cores', '', 'high'], ['socket', 'Socket'], ['igpu', 'iGPU']], rows.map((r) => r.p));
    expect(f.map((x) => [x.key, x.kind])).toEqual([['cores', 'num'], ['socket', 'cat']]);
    expect(f[0]).toMatchObject({ min: 6, max: 12 });
    expect(f[1].options).toEqual([{ value: 'AM5', count: 2 }, { value: 'LGA1851', count: 1 }]);
  });
});

describe('applyFilters', () => {
  it('passes everything with no filters', () => {
    expect(applyFilters(rows, EMPTY_FILTERS).kept).toHaveLength(4);
  });
  it('excludes parts missing the filtered spec and counts them', () => {
    const r = applyFilters(rows, { ...EMPTY_FILTERS, ranges: { cores: { min: 8 } } });
    expect(ids(r.kept)).toEqual(['b', 'd']);
    expect(r.hidden).toBe(1);
  });
  it('does not count a part as hidden-for-spec when another filter already excludes it', () => {
    expect(applyFilters(rows, { ...EMPTY_FILTERS, ranges: { cores: { min: 8 } }, inStock: true }).hidden).toBe(0);
  });
  it('filters categorical, price, toggles', () => {
    expect(ids(applyFilters(rows, { ...EMPTY_FILTERS, cats: { socket: ['AM5'] } }).kept)).toEqual(['a', 'c']);
    const priced = applyFilters(rows, { ...EMPTY_FILTERS, price: { max: 600 } });
    expect(ids(priced.kept)).toEqual(['a', 'd']);
    expect(priced.hidden).toBe(1);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, fitOnly: true }).kept).toHaveLength(3);
    expect(ids(applyFilters(rows, { ...EMPTY_FILTERS, verifiedOnly: true }).kept)).toEqual(['a', 'b', 'd']);
  });
  it('counts active filters', () => {
    expect(activeCount({ ...EMPTY_FILTERS, cats: { socket: ['AM5', 'x'], ff: [] }, ranges: { cores: { min: 1 } }, inStock: true })).toBe(3);
  });
});

describe('sortRows', () => {
  it('sorts numerically with unknown last in both directions', () => {
    expect(ids(sortRows(rows, (r) => cellOf(r, 'cores'), 'asc'))).toEqual(['a', 'd', 'b', 'c']);
    expect(ids(sortRows(rows, (r) => cellOf(r, 'cores'), 'desc'))).toEqual(['b', 'd', 'a', 'c']);
    expect(ids(sortRows(rows, (r) => cellOf(r, 'price'), 'desc'))).toEqual(['b', 'd', 'a', 'c']);
  });
  it('sorts text', () => {
    expect(ids(sortRows(rows, (r) => cellOf(r, 'socket'), 'asc'))).toEqual(['a', 'c', 'b', 'd']);
  });
});
