'use client';

import { useMemo } from 'react';
import { useGo } from '@/components/shell/useGo';
import { CH } from '@/lib/choreography';
import { featuredPreset } from '@/lib/content';
import { useData } from '@/lib/data';
import { fmt, keySpecs, pluralWord } from '@/lib/format';
import { href, ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color, tone } from '@/lib/tokens';
import type { Build } from '@/lib/types';
import { MAX_SHOP_BARS, PART_CHAPTERS, type PartChapterDef } from './config';
import { cap, countWords, homeBuild, pickedCount } from './copy';

export interface ChapterPart extends PartChapterDef {
  name: string;
  spec: string;
  /** Lowest price, or null when the part has no listing (or none is selected). */
  price: number | null;
  selected: boolean;
  checkLabel: string;
  value: string;
  detail: string;
  /** Status colour of the check (token). */
  c: string;
}
export interface ShopBar { id: string; name: string; total: string; scale: number; bar: string; text: string }

/** Everything the scroll story renders: which build it shows, per-chapter bindings and the CTA actions. */
export function useStoryModel() {
  const d = useData();
  const go = useGo();
  const build = useRig((s) => s.build), region = useRig((s) => s.region), set = useRig((s) => s.set);
  const count = pickedCount(d, build);
  const hb: Build = useMemo(() => homeBuild(d, build), [d, build]);
  const reg = d.regions.find((r) => r.id === region) || d.regions[0];
  const nRet = d.retailers.length;
  const featured = featuredPreset(d);

  const parts: ChapterPart[] = useMemo(() => {
    const checks = d.engine.compat(hb);
    return PART_CHAPTERS.map((def) => {
      const cat = CH[def.ch].sel, id = cat ? hb[cat] : undefined, p = id ? d.byId[id] : null;
      const c = checks.find((x) => x.id === def.check), lo = p ? d.engine.lowest(p.id, region) : null;
      return {
        ...def, name: p ? p.name : 'Not selected yet', spec: p ? keySpecs(p) : '', price: lo ? lo.price : null, selected: !!p,
        checkLabel: c?.label || '', value: c?.value || '', detail: c?.detail || '', c: tone[c?.status || 'pending'],
      };
    });
  }, [d, hb, region]);

  const partList = d.categories.map((c) => ({ idx: c.idx, name: hb[c.id] && d.byId[hb[c.id]!] ? d.byId[hb[c.id]!].name : c.long + ' · not selected' }));

  const plan = useMemo(() => d.engine.plan(hb, region, {}), [d, hb, region]);
  const nParts = plan.rows.length;
  const shops = plan.shopTotals.slice().sort((a, b) => a.missing - b.missing || a.total - b.total);
  const hasPrices = nParts > 0 && shops.some((x) => x.missing < nParts);
  const max = Math.max(1, ...shops.map((x) => x.total));
  const bars: ShopBar[] = shops.slice(0, MAX_SHOP_BARS).map((x, j) => {
    const best = j === 0 && !x.missing;
    return {
      id: x.rid, name: x.retailer.name, total: x.missing ? x.missing + ' missing' : fmt(x.total), scale: x.total / max,
      bar: best ? color.blue : color.line3, text: best ? color.blueSoft : x.missing ? color.dim : color.fg2,
    };
  });
  const splitNote = hasPrices
    ? 'Lowest total splitting the order across ' + plan.best.shops + ' ' + pluralWord(plan.best.shops, 'shop') + ', delivered to ' + reg.name + '.' +
      (plan.best.missing ? ' ' + plan.best.missing + ' ' + pluralWord(plan.best.missing, 'part is', 'parts are') + ' not listed yet.' : '')
    : nRet
      ? 'None of these parts has a listed price in ' + reg.name + ' yet. Totals appear after the next price check.'
      : 'Prices appear here once retailers are tracked for ' + reg.name + '.';

  return {
    hb,
    regionName: reg.name,
    heroCopy: nRet
      ? 'Choose every part and watch it go into the case. Fit, power and clearance are checked as you pick, and prices come from ' + countWords(nRet, 'Malaysian retailer') +' that deliver to your state.'
      : 'Choose every part and watch it go into the case. Fit, power and clearance are checked as you pick, and prices will come from Malaysian retailers that deliver to your state as soon as they are tracked.',
    buildLabel: count ? 'Your build' : featured ? featured.name + ' preset' : 'Your build',
    partList,
    parts,
    prices: {
      head: nRet ? cap(countWords(nRet, 'shop')) + ', one total' : 'Every shop, one total',
      hasPrices, bars, more: Math.max(0, shops.length - MAX_SHOP_BARS), splitNote,
      total: hasPrices ? plan.best.total : null,
      waiting: nRet ? 'Waiting for listings' : 'No retailers tracked yet',
    },
    cta: {
      customiseLabel: count ? 'Continue your build' : 'Customise this build',
      startScratch: () => { set({ build: {}, picks: {} }); go(ROUTES.build.path); },
      customise: () => { if (!count && featured) set({ build: { ...featured.build } }); go(ROUTES.build.path); },
      browseHref: href.parts(),
    },
  };
}
export type StoryModel = ReturnType<typeof useStoryModel>;
