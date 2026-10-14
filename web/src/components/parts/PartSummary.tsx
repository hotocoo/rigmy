'use client';

import { noPriceNote } from '@/components/build/shared';
import { Button, Dot, Text } from '@/components/ui';
import { useRegion } from '@/lib/content';
import { useData } from '@/lib/data';
import { keySpecs } from '@/lib/format';
import { useRig } from '@/lib/store';
import { color, tint, tone } from '@/lib/tokens';
import type { CatalogPart, PartStats } from '@/lib/types';
import { FitLine, PartPrice, SourceTag } from './bits';
import { fitOf, priceOf } from './derive';
import { useAddPart, useCompareToggle } from './hooks';
import { PartStatsGrid } from './PartStatsGrid';
import { PriceAlert } from './PriceAlert';
import p from './part.module.css';

/** Verdict tile tint strengths (background / border) over the verdict's tone colour. */
const VERDICT_BG_PCT = 7, VERDICT_BORDER_PCT = 32;

/** Right-hand column of the part hero: identity, fit, lowest price, build/compare actions, verdict, stats and alert. */
export function PartSummary({ P, stats }: { P: CatalogPart; stats: Record<string, PartStats> | null }) {
  const d = useData();
  const addPart = useAddPart();
  const toggleCompare = useCompareToggle();
  const build = useRig((x) => x.build), region = useRig((x) => x.region), compare = useRig((x) => x.compare);
  const reg = useRegion();
  const pr = priceOf(d, P.id, region), lo = pr.lo;
  const st = stats?.[P.id] ?? null;
  const current = build[P.cat], inBuild = current === P.id;

  const priceNote = lo
    ? 'Lowest at ' + (d.retailerById[lo.retailerId]?.name || lo.retailerId) + (lo.eta ? ' · ' + lo.eta.toLowerCase() + ' to ' + reg.name : '')
    : pr.listed ? noPriceNote(pr.offers, reg.name) : 'No retailer listings tracked for this part yet';
  const verdict = st?.verdict
    || (!stats ? 'Loading price stats…' : pr.listed ? 'Not enough price history yet for a verdict.' : 'No retailer lists this part yet, so there is no price to judge.');
  const vc = st ? tone[st.tone] : color.blueSoft;

  return (
    <div className={p.summary}>
      <div className={p.titleBlock}>
        <Text v="eyebrow">{P.brand}</Text>
        <Text v="productTitle" as="h1" className={p.balance}>{P.name}</Text>
        <div className={p.keySpecs}>{keySpecs(P)}</div>
      </div>
      <FitLine {...fitOf(d, build, P)} size="md" />
      <SourceTag source={P.source} />
      <div className={p.priceBlock}>
        <PartPrice value={lo?.price} empty={pr.empty} size="hero" />
        <Text v="meta">{priceNote}</Text>
      </div>
      <div className={p.buy}>
        <Button size="lg" className={p.buyMain} onClick={() => { if (!inBuild) addPart(P); }}>{inBuild ? 'In your build' : current ? 'Swap into build' : 'Add to build'}</Button>
        <Button variant="ghost" size="lgSlim" className={p.buyAlt} aria-pressed={compare.includes(P.id)} onClick={() => toggleCompare(P.id)}>
          {compare.includes(P.id) ? 'In compare' : 'Add to compare'}
        </Button>
      </div>
      <div data-rv="1" className={p.verdict} role="status" style={{ background: tint(vc, VERDICT_BG_PCT), borderColor: tint(vc, VERDICT_BORDER_PCT) }}>
        <Dot c={vc} size={7} glowPx={12} />
        <span className={p.verdictText}>{verdict}</span>
      </div>
      <PartStatsGrid st={st} />
      <PriceAlert P={P} current={st?.cur ?? lo?.price ?? null} />
    </div>
  );
}
