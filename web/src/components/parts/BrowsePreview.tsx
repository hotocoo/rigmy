'use client';

import { Fragment } from 'react';
import { Button, Panel, Text } from '@/components/ui';
import { useData } from '@/lib/data';
import { color } from '@/lib/tokens';
import type { Build, Product, RegionId } from '@/lib/types';
import { PartPrice } from './bits';
import { priceOf, specRows } from './derive';
import { SoloStudio } from './SoloStudio';
import b from './browse.module.css';
import s from './parts.module.css';

/** Sticky live 3D preview of the selected part with its price, key specs and build actions. */
export function BrowsePreview({ p, build, region, onAdd, onDetails }: { p: Product; build: Build; region: RegionId; onAdd: () => void; onDetails: () => void }) {
  const d = useData();
  const pr = priceOf(d, p.id, region), lo = pr.lo;
  const shop = lo
    ? 'Lowest at ' + (d.retailerById[lo.retailerId]?.name || lo.retailerId) + (lo.eta ? ' · ' + lo.eta : '')
    : pr.listed ? '' : 'No retailer listings tracked yet';
  const current = build[p.cat];
  return (
    <Panel as="aside" className={b.preview}>
      <div className={b.stage}>
        <SoloStudio product={p} />
        <Text v="eyebrowSm" c={color.blueSoft} className={b.stageLabel}>Live preview · drag to rotate</Text>
      </div>
      <div className={b.previewBody}>
        <div className={b.previewTitle}>
          <Text v="eyebrowSm">{p.brand}</Text>
          <Text v="previewTitle" as="h2" className={s.pretty}>{p.name}</Text>
        </div>
        <div className={b.priceLine}>
          <PartPrice value={lo?.price} empty={pr.empty} size="preview" />
          <Text v="metaTight" className={b.shopNote}>{shop}</Text>
        </div>
        <dl className={b.specs}>
          {specRows(d, p).map((sp) => (
            <Fragment key={sp.label}>
              <dt>{sp.label}</dt>
              <dd>{sp.value}</dd>
            </Fragment>
          ))}
        </dl>
        <div className={b.cta}>
          <Button className={s.grow} onClick={() => { if (current !== p.id) onAdd(); }}>
            {current === p.id ? 'In your build' : current ? 'Swap into build' : 'Add to build'}
          </Button>
          <Button variant="ghost" onClick={onDetails}>Prices and specs</Button>
        </div>
      </div>
    </Panel>
  );
}
