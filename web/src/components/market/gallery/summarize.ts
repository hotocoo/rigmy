import { listedPrice } from '@/components/build/shared';
import type { Data } from '@/lib/data';
import type { Build, GalleryBuild, Product } from '@/lib/types';

/** What a gallery card shows, derived from the saved parts and today's prices (never stored). */
export interface CardSummary {
  gb: GalleryBuild;
  /** Parts still in the catalogue, in slot order. */
  parts: Product[];
  cpu: Product | null;
  gpu: Product | null;
  /** Lowest total from current prices; null when none of the parts has an in-stock price. */
  total: number | null;
  priced: number;
  /** Sum of in-stock listing prices (delivery to the build's region not required), and how many parts it covers. */
  listed: { total: number; count: number };
}

export function summarize(d: Pick<Data, 'byId' | 'categories' | 'engine'>, gb: GalleryBuild): CardSummary {
  const parts: Product[] = [];
  const build: Build = {};
  for (const c of d.categories) {
    const p = gb.parts[c.id] ? d.byId[gb.parts[c.id]!] : undefined;
    if (p) { parts.push(p); build[c.id] = p.id; }
  }
  const best = parts.length ? d.engine.plan(build, gb.region, {}).best : null;
  const priced = best ? parts.length - best.missing : 0;
  const lp = parts.map((p) => listedPrice(d.engine.offers(p.id, gb.region))).filter((x): x is number => x != null);
  return {
    gb, parts, priced,
    listed: { total: lp.reduce((a, b) => a + b, 0), count: lp.length },
    cpu: parts.find((p) => p.cat === 'cpu') ?? null,
    gpu: parts.find((p) => p.cat === 'gpu') ?? null,
    total: best && priced > 0 ? best.total : null,
  };
}

/** Lowest total first: fully priced builds, then partly priced ones (their total covers fewer parts), then unpriced. */
export function byLowestTotal(a: CardSummary, b: CardSummary): number {
  const rank = (s: CardSummary) => (s.total == null ? 2 : s.priced < s.parts.length ? 1 : 0);
  return rank(a) - rank(b) || (a.total ?? 0) - (b.total ?? 0);
}

/** Distinct brands of the given slot's part across the builds, sorted. */
export function brandsOf(items: CardSummary[], slot: 'cpu' | 'gpu'): string[] {
  return [...new Set(items.flatMap((s) => (s[slot] ? [s[slot].brand] : [])))].sort((a, b) => a.localeCompare(b));
}
