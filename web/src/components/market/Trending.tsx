'use client';

import { useEffect, useRef } from 'react';
import { PriceChart } from '@/components/charts/PriceChart';
import { redrawAll } from '@/components/shell/motion';
import { useGo } from '@/components/shell/useGo';
import { Chip, Text } from '@/components/ui';
import { useNow } from '@/lib/clock';
import { useData, useIndex, useStats } from '@/lib/data';
import { chgColor, chgTxt, startOfDay, dFmt, dLong, LOCALE, plural } from '@/lib/format';
import { href } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color, tone } from '@/lib/tokens';
import type { Product } from '@/lib/types';
import { MarketHeader, MarketPage, StatTiles, type StatTile } from './MarketHeader';
import { BuiltList, DropsList, LowsGrid, SalesList } from './trending/TrendSections';
import { useTrending, YEAR_DAYS } from './trending/useTrending';
import { MIN_TREND_DAYS, trackingMsg } from './util';
import m from './market.module.css';
import t from './trending/trending.module.css';

const LOADING = 'Loading price history…';
const NEEDS_HISTORY = 'Needs ' + MIN_TREND_DAYS + ' days of price history';

export function Trending() {
  const d = useData();
  const go = useGo();
  const now = useNow();
  const trCat = useRig((s) => s.trCat), region = useRig((s) => s.region), set = useRig((s) => s.set);
  const stats = useStats();
  const idx = useIndex(trCat);
  const loading = stats == null;
  const today = startOfDay(now);
  const { v, index, sales, startedAgo, next, nextIn } = useTrending(trCat, stats, idx, today);

  // Redraw the svg line wipes when the category changes (the reveal only draws them once).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    redrawAll();
  }, [trCat]);

  const regionName = (d.regions.find((r) => r.id === region) || d.regions[0])?.name || '';
  const cd = trCat === 'all' ? null : d.cat(trCat);
  const catLabel = (p: Product) => d.cat(p.cat)?.label || p.cat;
  const open = (id: string) => go(href.part(id));
  const waitMsg = trackingMsg(startedAgo);
  const yearOfData = v.maxDays >= YEAR_DAYS;
  const scope = cd ? cd.long.toLowerCase() + 's' : null;

  const tiles: StatTile[] = [
    { label: 'Parts tracked', value: String(v.count), c: color.fg, note: v.shops ? 'Lowest price across ' + plural(v.shops, 'shop') + ', every day' : 'No shop has listed these parts yet' },
    {
      label: 'Cheaper than last week', value: v.trend.length ? String(v.down.length) : '—', c: tone.ok,
      note: !v.trend.length ? (loading ? LOADING : NEEDS_HISTORY) : v.down.length ? 'Biggest drop: ' + (v.down[0].p.short || v.down[0].p.name) : 'No drops in this category',
    },
    {
      label: 'Average 7-day change', value: v.avg7 == null ? '—' : (v.avg7 < 0 ? '-' : '+') + Math.abs(v.avg7 * 100).toFixed(1) + '%', c: chgColor(v.avg7),
      note: v.avg7 == null ? (loading ? LOADING : NEEDS_HISTORY) : 'Across ' + plural(v.trend.length, 'part') + ' in this view',
    },
    { label: 'Next sale', value: nextIn == null ? '—' : plural(nextIn, 'day'), c: tone.warn, note: next ? next.label + ' · ' + dLong(next.t) : 'No sale days on the calendar' },
  ];

  const shopsAll = new Set(d.offers.map((o) => o.retailerId)).size;
  const lede = (shopsAll ? 'The lowest price across ' + plural(shopsAll, 'shop') + ' for every part we track, recorded daily' : 'The lowest price across every shop we check, recorded daily')
    + (yearOfData ? ' for a year' : v.maxDays > 1 ? ' — ' + plural(v.maxDays, 'day') + ' so far' : '')
    + '. Sale days are marked so you can see what a real discount looks like.';
  const dateTxt = new Date(now).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

  const idxSub = index.geom && index.first != null
    ? index.spanTxt + ' · 100 is the price ' + (index.year ? 'a year ago' : 'on ' + dFmt(index.first, true)) + ' · sale days marked'
    : 'Daily lowest prices, averaged across every tracked part · sale days marked';

  const dropsEmpty = v.drops.length ? null
    : loading ? { title: LOADING }
      : { title: 'No weekly changes yet', body: v.priced.length ? waitMsg + '.' : 'None of these parts has an in-stock price yet. Prices appear after the next shop check.' };

  return (
    <MarketPage>
      <MarketHeader eyebrow={'Market · ' + dateTxt + ' · ' + regionName + ' prices'} title="What's moving in PC parts" lede={lede} />
      <div data-rv="1" className={m.chips} role="group" aria-label="Category">
        <Chip on={trCat === 'all'} onClick={() => set({ trCat: 'all' })}>All parts</Chip>
        {d.categories.map((c) => <Chip key={c.id} on={trCat === c.id} onClick={() => set({ trCat: c.id })}>{c.label}</Chip>)}
      </div>

      <StatTiles tiles={tiles} />

      <section data-rv="1" className={t.index} aria-label="Price index">
        <div className={t.indexHead}>
          <div className={m.stackSm}>
            <Text v="h3" as="h2">{'Price index · ' + (scope || 'all parts')}</Text>
            <Text v="meta">{idxSub}</Text>
          </div>
          <Text v="price22" c={chgColor(index.change)}>{index.change == null ? '—' : chgTxt(index.change) + ' in ' + index.spanTxt}</Text>
        </div>
        <PriceChart geom={index.geom} showAvg={false} interactive={false} labelBg={color.surfaceSunken} emptyNote={idx == null ? 'Loading the price index…' : waitMsg} />
      </section>

      <div className={t.split}>
        <DropsList rows={v.drops} catLabel={catLabel} open={open} empty={dropsEmpty} />
        <div className={t.side}>
          <BuiltList rows={v.built} max={v.bmax} open={open}
            empty={loading ? { title: 'Loading…' } : { title: 'No saved builds include ' + (scope || 'these parts') + ' yet', body: 'When people save or share a build, its parts are counted here.' }} />
          <SalesList rows={sales} />
        </div>
      </div>

      <LowsGrid rows={v.lows} yearOfData={yearOfData} maxDays={v.maxDays} catLabel={catLabel} open={open} empty={loading ? { title: LOADING } : { title: 'Not enough price history yet', body: waitMsg + '.' }} />
    </MarketPage>
  );
}
