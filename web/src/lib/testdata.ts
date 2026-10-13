/**
 * Minimal Data facade stubs for unit tests: only the fields the pure logic
 * under test reads. Cast at the boundary; the shape is checked by tsc on the
 * real facade in data.tsx.
 */
import type { Data } from '@/lib/data';
import type { Offer, PlanTotal, Product } from '@/lib/types';

export const offer = (over: Partial<Offer> = {}): Offer =>
  ({
    productId: 'p',
    retailerId: 'r1',
    price: 100,
    stock: 'In stock',
    url: 'https://shop.test/p',
    observedAt: '2026-10-13T00:00:00.000Z',
    avail: true,
    fee: 10,
    eta: 'Next day',
    status: 'In stock',
    warranty: '12 months',
    ...over,
  }) as Offer;

export const planTotal = (over: Partial<PlanTotal> = {}): PlanTotal =>
  ({ parts: 0, fee: 0, total: 0, shops: 0, missing: 0, unknownFees: 0, choice: {}, ...over }) as PlanTotal;

export const product = (id: string, over: Partial<Product> = {}): Product =>
  ({ id, name: 'Name ' + id, brand: 'Brand ' + id, cat: 'cpu', specs: {}, facet: 'f', ...over } as Product);

export interface DataOpts {
  offers?: Record<string, Offer[]>;
  lowest?: Record<string, Offer | null>;
  plan?: PlanTotal;
  byId?: Record<string, Product>;
  presets?: { id: string; name: string; build: Record<string, string> }[];
  categories?: { id: string; long: string }[];
  retailerById?: Record<string, { id: string; name: string }>;
}

export function mkData(o: DataOpts = {}): Data {
  const offers = o.offers ?? {};
  const lowest = o.lowest ?? {};
  const d = {
    categories: (o.categories ?? [
      { id: 'cpu', long: 'CPU' },
      { id: 'mobo', long: 'Motherboard' },
    ]) as never[],
    byId: o.byId ?? { 'cpu-a': product('cpu-a') },
    retailerById: o.retailerById ?? { r1: { id: 'r1', name: 'Shop R' } },
    presets: o.presets ?? [],
    engine: {
      offers: (id: string) => offers[id] ?? [],
      lowest: (id: string) => lowest[id] ?? null,
      plan: () => ({ best: o.plan ?? planTotal({}) }) as never,
    },
  };
  return d as unknown as Data;
}
