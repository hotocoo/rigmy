import { describe, expect, it } from 'vitest';
import type { GalleryBuild } from '@/lib/types';
import { mkData, planTotal, product } from '@/lib/testdata';
import { brandsOf, byLowestTotal, summarize } from './summarize';

const gb = (id: string, parts: Record<string, string>): GalleryBuild =>
  ({ id, title: id, note: null, region: 'kv', createdAt: 1, parts, partCount: Object.keys(parts).length }) as GalleryBuild;

const cats = [{ id: 'cpu', long: 'CPU' }, { id: 'gpu', long: 'GPU' }];
const byId = {
  c1: product('c1', { cat: 'cpu', brand: 'AMD' }),
  g1: product('g1', { cat: 'gpu', brand: 'Sapphire' }),
};

describe('summarize', () => {
  it('uses the engine plan for totals and skips parts gone from the catalogue', () => {
    const d = mkData({ categories: cats, byId, plan: planTotal({ total: 900, missing: 0 }) });
    const s = summarize(d, gb('a', { cpu: 'c1', gpu: 'g1', ram: 'gone' }));
    expect(s.parts.map((p) => p.id)).toEqual(['c1', 'g1']);
    expect([s.total, s.priced, s.cpu?.brand, s.gpu?.brand]).toEqual([900, 2, 'AMD', 'Sapphire']);
  });
  it('never invents a total when nothing is priced', () => {
    const d = mkData({ categories: cats, byId, plan: planTotal({ total: 0, missing: 1 }) });
    expect(summarize(d, gb('a', { cpu: 'c1' })).total).toBeNull();
  });
});

describe('sorting and brands', () => {
  const mk = (total: number | null, priced: number, n: number) =>
    ({ gb: gb('x', {}), parts: Array(n).fill(byId.c1), cpu: byId.c1, gpu: null, total, priced, listed: { total: 0, count: 0 } });
  it('orders full, partial, unpriced', () => {
    const list = [mk(null, 0, 2), mk(100, 1, 2), mk(500, 2, 2), mk(300, 2, 2)];
    expect([...list].sort(byLowestTotal).map((s) => s.total)).toEqual([300, 500, 100, null]);
  });
  it('lists distinct brands for a slot', () => {
    const a = mk(1, 1, 1), b = { ...mk(1, 1, 1), cpu: product('c2', { brand: 'Intel' }), gpu: byId.g1 };
    expect(brandsOf([a, b, a], 'cpu')).toEqual(['AMD', 'Intel']);
    expect(brandsOf([a, b], 'gpu')).toEqual(['Sapphire']);
  });
});
