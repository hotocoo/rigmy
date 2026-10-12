'use client';

import type { MouseEvent } from 'react';
import { Button, Dot, IconButton, Meta } from '@/components/ui';
import { cx } from '@/lib/cx';
import { keySpecs } from '@/lib/format';
import { tone } from '@/lib/tokens';
import type { Category, Check, Product } from '@/lib/types';
import s from './builder.module.css';

const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn(); };

export interface BuildRowProps {
  cat: Category;
  part: Product | null;
  price: { text: string; price: number | null } | null;
  checks: Check[];
  selected: boolean;
  onSelect: () => void;
  onDetail: () => void;
  onBrowse: () => void;
  onRemove: () => void;
}

/** One category slot in the builder: chosen part, specs, compatibility flag, price and actions. */
export function BuildRow({ cat, part, price, checks, selected, onSelect, onDetail, onBrowse, onRemove }: BuildRowProps) {
  const bad = checks.find((k) => k.status === 'error' && k.parts.includes(cat.id));
  const flag = bad || checks.find((k) => k.status === 'warn' && k.parts.includes(cat.id));
  const flagColor = bad ? tone.error : tone.warn;
  return (
    <li onClick={onSelect} className={cx(s.row, selected && s.rowOn)}>
      <span className={s.idx} aria-hidden>{cat.idx}</span>
      {/* The whole row selects on click; this button gives the same action to keyboard and screen-reader users. */}
      <button type="button" className={s.pick} aria-pressed={selected}>
        <span className={s.cat}>{cat.long}</span>
        <span className={cx(s.name, !!part && s.nameSet)}>{part ? part.name : 'Choose a ' + cat.long.toLowerCase()}</span>
        {part && <Meta>{keySpecs(part)}</Meta>}
        {flag && <span className={s.flag} style={{ color: flagColor }}><Dot c={flagColor} glowPx={0} />{flag.label + ' · ' + flag.value}</span>}
      </button>
      <div className={s.end}>
        <span className={cx(s.price, price?.price == null && !!price && s.priceNone)}>{price ? price.text : '—'}</span>
        <div className={s.acts}>
          {part && <Button variant="quiet" size="xs" onClick={stop(onDetail)} aria-label={'View ' + part.name + ' in 3D'}>3D</Button>}
          <Button variant={part ? 'mini' : 'primary'} size="xs" wide onClick={stop(onBrowse)} aria-label={(part ? 'Change ' : 'Choose ') + cat.long.toLowerCase()}>{part ? 'Change' : 'Choose'}</Button>
          {part && <IconButton tone="remove" onClick={stop(onRemove)} label={'Remove ' + part.name} />}
        </div>
      </div>
    </li>
  );
}
