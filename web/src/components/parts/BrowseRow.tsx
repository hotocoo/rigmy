'use client';

import type { MouseEvent } from 'react';
import { Button, Panel, Text } from '@/components/ui';
import { useData } from '@/lib/data';
import { keySpecs, plural } from '@/lib/format';
import { color } from '@/lib/tokens';
import type { Build, Product, RegionId } from '@/lib/types';
import { FitLine, InBuild, PartPrice } from './bits';
import { fitOf, priceOf } from './derive';
import b from './browse.module.css';
import s from './parts.module.css';

interface Props {
  p: Product;
  build: Build;
  region: RegionId;
  selected: boolean;
  comparing: boolean;
  onPreview: () => void;
  onCompare: () => void;
  onDetails: () => void;
  onAdd: () => void;
}

/** One part in the browse list. Clicking anywhere previews it; the actions do not. */
export function BrowseRow({ p, build, region, selected, comparing, onPreview, onCompare, onDetails, onAdd }: Props) {
  const d = useData();
  const pr = priceOf(d, p.id, region), fit = fitOf(d, build, p);
  const inBuild = build[p.cat] === p.id;
  const act = (f: () => void) => (e: MouseEvent) => { e.stopPropagation(); f(); };
  return (
    <Panel as="article" data-rv="1" interactive on={selected} onClick={onPreview} className={b.row}>
      {/* Keyboard access to the preview: the click bubbles to the row's handler. */}
      <button type="button" className={b.rowMain} aria-pressed={selected} aria-label={`Preview ${p.brand} ${p.name}`}>
        <span className={s.glyph} aria-hidden>{p.glyph}</span>
        <span className={b.info}>
          <Text v="eyebrowSm">{p.brand}</Text>
          <Text v="titleSm" c={color.fg} className={s.pretty}>{p.name}</Text>
          <Text v="meta" c={color.fg4}>{keySpecs(p)}</Text>
          <FitLine {...fit} />
        </span>
      </button>
      <div className={b.side}>
        <PartPrice value={pr.lo?.price} empty={pr.empty} size="row" />
        <span className={b.shops}>{pr.avail + ' of ' + plural(d.retailers.length, 'shop')}</span>
        <div className={b.actions}>
          <Button variant="mini" on={comparing} onClick={act(onCompare)}>{comparing ? 'Comparing' : 'Compare'}</Button>
          <Button variant="mini" onClick={act(onDetails)}>Details</Button>
          {inBuild ? <InBuild size="sm" /> : <Button size="tiny" onClick={act(onAdd)}>{build[p.cat] ? 'Swap in' : 'Add'}</Button>}
        </div>
      </div>
    </Panel>
  );
}
