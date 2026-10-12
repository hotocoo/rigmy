'use client';

import type { ReactNode } from 'react';
import { Eyebrow, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { color, type TypeName } from '@/lib/tokens';
import s from './commerce.module.css';

/** Title style of each page-head variant: a flow step, the order-placed page, order tracking. */
const TITLE: Record<'step' | 'done' | 'track', TypeName> = { step: 'headline', done: 'done', track: 'pageHero' };

/** Eyebrow + page title, with an optional right-hand slot (totals, step tabs). */
export function PageHead({ eyebrow, eyebrowColor, title, variant = 'step', lead, right, reveal }: {
  eyebrow: ReactNode; eyebrowColor?: string; title: ReactNode; variant?: 'step' | 'done' | 'track'; lead?: ReactNode; right?: ReactNode; reveal?: boolean;
}) {
  const text = (
    <div className={cx(s.headText, variant !== 'step' && s.headTextLoose)} {...(reveal && !right ? { 'data-rv': '1' } : null)}>
      <Eyebrow c={eyebrowColor}>{eyebrow}</Eyebrow>
      <Text v={TITLE[variant]} as="h1" className={variant === 'track' ? s.balance : undefined}>{title}</Text>
      {lead && (variant === 'done' ? <p className={s.leadDone}>{lead}</p> : <Text v="body" as="p" className={s.lead}>{lead}</Text>)}
    </div>
  );
  if (!right) return text;
  return <div className={s.head} {...(reveal ? { 'data-rv': '1' } : null)}>{text}{right}</div>;
}

/** Big mono total with a caption, right-aligned in the page head. */
export function HeadTotal({ value, note, size = 'lg' }: { value: ReactNode; note: ReactNode; size?: 'lg' | 'md' }) {
  return (
    <div className={s.headRight}>
      {size === 'lg' ? <span className={s.bigTotal}>{value}</span> : <Text v="figureLg">{value}</Text>}
      <Text v={size === 'lg' ? 'metaTight' : 'meta'}>{note}</Text>
    </div>
  );
}

/** Parts / delivery lines and the total, as shown in the cart and checkout summaries. */
export function SummaryTotals({ parts, fee, total, totalType = 'figureLg' }: { parts: string; fee: string; total: string; totalType?: 'figureLg' | 'figure' }) {
  return (
    <>
      <dl className={s.lines}>
        <div className={s.line}><dt>Parts</dt><dd>{parts}</dd></div>
        <div className={s.line}><dt>Delivery</dt><dd>{fee}</dd></div>
      </dl>
      <div className={s.total}>
        <span className={s.totalLabel}>Total</span>
        <Text v={totalType}>{total}</Text>
      </div>
    </>
  );
}

/** Retailer card header: name + meta on the left, ETA + terms on the right. */
export function CardHead({ title, meta, eta, side, titleColor }: { title: ReactNode; meta: ReactNode; eta?: ReactNode; side?: ReactNode; titleColor?: string }) {
  return (
    <div className={s.cardHead}>
      <div className={s.stack}>
        <Text v="title" c={titleColor}>{title}</Text>
        <Text v="metaTight">{meta}</Text>
      </div>
      {(eta || side) && (
        <div className={s.stackEnd}>
          {eta && <Text v="data" c={color.blueSoft}>{eta}</Text>}
          {side && <Text v="metaTight">{side}</Text>}
        </div>
      )}
    </div>
  );
}

/** Category / name / price row inside a retailer card. */
export function ItemRow({ cat, name, price, muted }: { cat: ReactNode; name: ReactNode; price: ReactNode; muted?: boolean }) {
  return (
    <div className={s.item}>
      <Text v="tagLoose" c={muted ? color.dim : undefined}>{cat}</Text>
      {typeof name === 'string' ? <Text v="label" c={muted ? color.fg3 : undefined}>{name}</Text> : name}
      <Text v="dataLg" c={muted ? color.dim : undefined}>{price}</Text>
    </div>
  );
}
