'use client';

import { useParams } from 'next/navigation';
import { BackLink, Text } from '@/components/ui';
import { regionById } from '@/lib/content';
import { useData, useStats } from '@/lib/data';
import { useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import type { Product } from '@/lib/types';
import { PageEmpty } from './bits';
import { useBrowse } from './hooks';
import { lastBrowseCat } from './lastCategory';
import { NearbyStores } from './NearbyStores';
import { OffersTable } from './OffersTable';
import { PartSummary } from './PartSummary';
import { PriceHistory } from './PriceHistory';
import { SoloStudio } from './SoloStudio';
import { SpecList } from './SpecList';
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
  return <PartView key={product.id} P={product} />;
}

function PartView({ P }: { P: Product }) {
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
