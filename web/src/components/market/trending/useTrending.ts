'use client';

import { useMemo } from 'react';
import { chartFor } from '@/lib/chart';
import { useData } from '@/lib/data';
import { DAY, startOfDay, dLong, plural } from '@/lib/format';
import type { CatId, IndexPoint, PartStats, Product } from '@/lib/types';
import { MIN_TREND_DAYS } from '../util';

/** A 7-day move smaller than this (0.4%) is rounding noise on a ringgit price, so it does not count as a drop. */
const DROP_NOISE = -0.004;
/** How many rows each list shows. */
const SHOWN = { drops: 8, built: 6, lows: 6, sales: 4 } as const;
/** Days of history the price-index chart spans. */
const INDEX_WINDOW_DAYS = 365;
/** History of at least this many days is described as "a year" in copy. */
export const YEAR_DAYS = 365;
/** Index spans this long are labelled "12 months" (a few missing days at the edges still count as a year). */
const YEAR_SPAN_DAYS = 360;
/** Sale depth compares the sale day with this many index points (days) before it. */
const SALE_LOOKBACK_DAYS = 7;
/** A sale-day index drop below this (in %) reads as "prices did not drop". */
const SALE_DROP_MIN_PCT = 0.05;

export interface Entry { p: Product; st: PartStats }

/** Everything the trending page derives from the catalogue, part stats and the category price index. */
export function useTrending(trCat: 'all' | CatId, stats: Record<string, PartStats> | null, idx: IndexPoint[] | null, today: number) {
  const d = useData();

  const v = useMemo(() => {
    const all = d.products.filter((p) => trCat === 'all' || p.cat === trCat);
    const ids = new Set(all.map((p) => p.id));
    const withSt: Entry[] = all.flatMap((p) => (stats?.[p.id] ? [{ p, st: stats[p.id] }] : []));
    const maxDays = withSt.reduce((a, x) => Math.max(a, x.st.days), 0);
    const shops = new Set(d.offers.filter((o) => ids.has(o.productId)).map((o) => o.retailerId)).size;
    const priced = withSt.filter((x) => x.st.cur != null);
    const trend = priced.filter((x) => x.st.d7 != null && x.st.days >= MIN_TREND_DAYS);
    const drops = trend.slice().sort((a, b) => a.st.d7! - b.st.d7!);
    const down = drops.filter((x) => x.st.d7! < DROP_NOISE);
    const avg7 = trend.length ? trend.reduce((a, x) => a + x.st.d7!, 0) / trend.length : null;
    const built = withSt.filter((x) => x.st.builds > 0).sort((a, b) => b.st.builds - a.st.builds).slice(0, SHOWN.built);
    const lows = priced
      .filter((x) => x.st.low != null && x.st.low > 0 && x.st.days >= MIN_TREND_DAYS)
      .sort((a, b) => a.st.cur! / a.st.low! - b.st.cur! / b.st.low!)
      .slice(0, SHOWN.lows);
    return { count: all.length, maxDays, shops, priced, trend, drops: drops.slice(0, SHOWN.drops), down, avg7, built, bmax: built[0]?.st.builds || 1, lows };
  }, [d, stats, trCat]);

  const index = useMemo(() => {
    const geom = idx ? chartFor(idx.map((x) => ({ t: x.t, low: x.v, ev: x.ev })), INDEX_WINDOW_DAYS, (x) => x.toFixed(0), false) : null;
    const has = !!idx && idx.length > 1;
    const span = has ? Math.round((startOfDay(idx![idx!.length - 1].t) - startOfDay(idx![0].t)) / DAY) : 0;
    const change = has && idx![0].v ? idx![idx!.length - 1].v / idx![0].v - 1 : null;
    const year = span >= YEAR_SPAN_DAYS;
    return { geom, span, change, year, spanTxt: year ? '12 months' : plural(span, 'day'), first: idx?.[0]?.t ?? null };
  }, [idx]);

  const upcoming = d.events.filter((e) => e.t > today);
  const daysTo = (t: number) => Math.round((startOfDay(t) - today) / DAY);

  const sales = upcoming.slice(0, SHOWN.sales).map((e) => ({
    key: e.t + e.label, label: e.label, date: dLong(e.t), in: plural(daysTo(e.t), 'day'), note: saleDepthNote(e.label, idx),
  }));

  // How long ago tracking started: first index point, else the longest history among parts.
  const startedAgo = idx && idx.length ? Math.max(0, Math.round((today - startOfDay(idx[0].t)) / DAY)) : v.maxDays ? v.maxDays - 1 : null;
  const next = upcoming[0] || null;

  return { v, index, sales, startedAgo, next, nextIn: next ? daysTo(next.t) : null };
}

/** Depth of the last occurrence of a sale, read from the real category index. */
function saleDepthNote(label: string, idx: IndexPoint[] | null) {
  if (!idx || !idx.length) return 'Not in our price history yet';
  let i = -1;
  for (let k = idx.length - 1; k >= 0; k--) if (idx[k].ev === label) { i = k; break; }
  if (i < SALE_LOOKBACK_DAYS || !idx[i - SALE_LOOKBACK_DAYS].v) return 'Not in our price history yet';
  const off = (1 - idx[i].v / idx[i - SALE_LOOKBACK_DAYS].v) * 100;
  return off > SALE_DROP_MIN_PCT ? 'Last ' + label + ', parts here averaged ' + off.toFixed(1) + '% off' : 'Last ' + label + ', prices here did not drop';
}
