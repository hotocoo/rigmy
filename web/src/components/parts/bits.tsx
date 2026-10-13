'use client';

import { Button, Dot, Price, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { tone as toneColor, type TypeName } from '@/lib/tokens';
import type { Tone } from '@/lib/types';
import s from './parts.module.css';

/** How a part fits the current build (engine verdict). */
export function FitLine({ text, tone, size = 'base' }: { text: string; tone: Tone; size?: 'sm' | 'base' | 'md' }) {
  const c = toneColor[tone];
  return (
    <div className={cx(s.fit, size === 'sm' && s.fitSm, size === 'md' && s.fitMd)} style={{ color: c }}>
      <Dot c={c} glowPx={0} />{text}
    </div>
  );
}

/** Type style of a part's price on each parts page (browse row, compare column, live preview, part hero). */
const PRICE_TYPE = { row: 'price16', compare: 'priceLg', preview: 'price22', hero: 'figureXl' } as const satisfies Record<string, TypeName>;
/** A part's lowest price at one of the parts pages' display sizes, or its honest empty label. */
export function PartPrice({ value, empty, size }: { value: number | null | undefined; empty: string; size: keyof typeof PRICE_TYPE }) {
  return <Price value={value} empty={empty} v={PRICE_TYPE[size]} className={s.nowrap} />;
}

/** Status shown in place of an "Add" action when the part is already in the build. */
export function InBuild({ size }: { size: 'sm' | 'md' }) {
  return <span className={cx(s.inBuild, size === 'sm' ? s.inBuildSm : s.inBuildMd)}>In build</span>;
}

/** Page-level empty / not-found message with one way forward. */
export function PageEmpty({ title, lead, action, onAction }: { title: string; lead: string; action?: string; onAction?: () => void }) {
  return (
    <div className={s.emptyPage}>
      <Text v="h2" as="h1">{title}</Text>
      <Text v="body" as="p" className={s.emptyLead}>{lead}</Text>
      {action && onAction && <Button onClick={onAction}>{action}</Button>}
    </div>
  );
}

