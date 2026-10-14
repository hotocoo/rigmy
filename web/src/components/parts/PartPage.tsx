'use client';

import { useParams } from 'next/navigation';
import { ArButton } from '@/components/build/ArButton';
import { BackLink, Text } from '@/components/ui';
import { regionById } from '@/lib/content';
import { useGo } from '@/components/shell/useGo';
import { useData, useStats } from '@/lib/data';
import { ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import type { CatalogPart, PartStats, Product } from '@/lib/types';
import type { PartVis } from '@/studio/types';
import { PageEmpty } from './bits';
import { useBrowse } from './hooks';
import { lastBrowseCat } from './lastCategory';
import { NearbyStores } from './NearbyStores';
import { OffersTable } from './OffersTable';
import { PartStatsGrid } from './PartStatsGrid';
import { PartSummary } from './PartSummary';
import { PriceAlert } from './PriceAlert';
import { PriceHistory } from './PriceHistory';
import { SoloStudio } from './SoloStudio';
import { SpecList } from './SpecList';
import { priceOf } from './derive';
import { PartPrice } from './bits';
import p from './part.module.css';
import s from './parts.module.css';

/** Part detail (/part/[id]): 3D view, price verdict + stats + alert, price history, nearby stores, online offers, specs. */
export function PartPage() {
  const { id } = useParams<{ id: string }>();
  const d = useData();
  const browse = useBrowse();
  const product = d.byId[decodeURIComponent(id || '')];
  if (!product) {
    const fallback = lastBrowseCat(d);
    return (
      <div className={s.page}>
        <PageEmpty
          title="This part isn't in the catalogue"
          lead="It may have been removed or the link is mistyped."
          action={fallback ? 'Browse parts' : undefined}
          onAction={fallback ? () => browse(fallback) : undefined}
        />
      </div>
    );
  }
  // Market listings (discovered from retailer feeds, not verified into the catalogue) get a
  // price/stock/history page without build, compare or 3D features.
  const cat = product.cat;
  if (!cat) return <MarketPartView key={product.id} P={product} />;
  return <PartView key={product.id} P={{ ...product, cat }} />;
}

function PartView({ P }: { P: CatalogPart }) {
  const d = useData();
  const browse = useBrowse();
  const region = useRig((x) => x.region);
  const stats = useStats();
  const cd = d.cat(P.cat), reg = regionById(d, region);
  return (
    <div className={s.page}>
      <BackLink onClick={() => browse(P.cat)}>All {cd.long} options</BackLink>

      <div className={p.hero}>
        <div className={p.stage}>
          <SoloStudio product={P} />
          <div className={p.stageCaption}>
            <Text v="eyebrow" c={color.blueSoft}>{cd.long} · 3D</Text>
            <span className={p.hint}>Drag to rotate · scroll to zoom</span>
          </div>
          <div className={p.stageTools}>
            <ArButton build={() => ({ [P.cat]: { id: P.id, label: P.name, vis: P.vis as PartVis } })} />
          </div>
        </div>
        <PartSummary P={P} stats={stats} />
      </div>

      <PriceHistory productId={P.id} />
      <NearbyStores P={P} />

      <div className={p.lower}>
        <OffersTable productId={P.id} regionName={reg.name} />
        <SpecList P={P} />
      </div>
    </div>
  );
}

/** Detail view for a market listing: identity, price verdict, history and online offers — no build features. */
function MarketPartView({ P }: { P: Product }) {
  const d = useData();
  const go = useGo();
  const region = useRig((x) => x.region);
  const stats = useStats();
  const reg = regionById(d, region);
  return (
    <div className={s.page}>
      <BackLink onClick={() => go(ROUTES.parts.path)}>All parts</BackLink>

      <div className={p.hero}>
        <div className={p.summary}>
          <div className={p.titleBlock}>
            <Text v="eyebrow">{P.brand}{P.market ? ' · ' + P.market : ''}</Text>
            <Text v="productTitle" as="h1" className={p.balance}>{P.name}</Text>
            <Text v="meta">
              Market listing — discovered from a retailer feed and not yet verified into the catalogue, so it
              cannot be added to a build. Prices, stock and history below are live from the retailer.
            </Text>
          </div>
          <MarketSummary P={P} stats={stats} />
        </div>
      </div>

      <PriceHistory productId={P.id} />

      <div className={p.lower}>
        <OffersTable productId={P.id} regionName={reg.name} />
      </div>
    </div>
  );
}

/** Price verdict, stats and alert for a market listing (no build/compare actions). */
function MarketSummary({ P, stats }: { P: Product; stats: Record<string, PartStats> | null }) {
  const d = useData();
  const region = useRig((x) => x.region);
  const pr = priceOf(d, P.id, region), lo = pr.lo;
  const st = stats?.[P.id] ?? null;
  const priceNote = lo
    ? 'Lowest at ' + (d.retailerById[lo.retailerId]?.name || lo.retailerId) + (lo.eta ? ' · ' + lo.eta.toLowerCase() + ' to ' + regionById(d, region).name : '')
    : pr.listed ? 'No shop has stock in your region' : 'No retailer listings tracked for this product yet';
  const verdict = st?.verdict
    || (!stats ? 'Loading price stats…' : pr.listed ? 'Not enough price history yet for a verdict.' : 'No retailer lists this product yet, so there is no price to judge.');
  return (
    <>
      <div className={p.priceBlock}>
        <PartPrice value={lo?.price} empty={pr.empty} size="hero" />
        <Text v="meta">{priceNote}</Text>
      </div>
      <div className={p.verdict} role="status">
        <span className={p.verdictText}>{verdict}</span>
      </div>
      <PartStatsGrid st={st} />
      <PriceAlert P={P} current={st?.cur ?? lo?.price ?? null} />
    </>
  );
}
