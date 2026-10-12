'use client';

import type { CSSProperties } from 'react';
import { cx } from '@/lib/cx';
import { color } from '@/lib/tokens';
import s from './ui.module.css';

/**
 * Status track: dots on a 2px rail that fills (and glows) in `c` up to `current`. With `onPick` every step is a button
 * (disabled while `busy`) titled by `stepTitle`. Used for each shop's order status.
 */
export function Stepper({ steps, current, c = color.blue, onPick, busy, label, stepTitle }: {
  steps: readonly string[];
  current: number;
  c?: string;
  onPick?: (i: number) => void;
  busy?: boolean;
  label: string;
  stepTitle?: (step: string) => string;
}) {
  const n = steps.length, inset = 50 / n + '%';
  return (
    <div className={s.stepper} style={{ '--c': c } as CSSProperties}>
      <div className={s.stepRail} style={{ left: inset, right: inset }} aria-hidden>
        <div className={s.stepFill} style={{ width: (n > 1 ? (current / (n - 1)) * 100 : 0) + '%' }} />
      </div>
      <ol className={s.stepList} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-label={label}>
        {steps.map((l, i) => {
          const cls = cx(s.step, i <= current && s.stepReached, i === current && current < n - 1 && s.stepCurrent);
          const body = <><span className={s.stepDot} aria-hidden /><span>{l}</span></>;
          return (
            <li key={l}>
              {onPick
                ? <button type="button" onClick={() => onPick(i)} disabled={busy} aria-busy={busy || undefined} title={stepTitle?.(l)} aria-current={i === current ? 'step' : undefined} className={cls}>{body}</button>
                : <span className={cls} aria-current={i === current ? 'step' : undefined}>{body}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Steps drawn as 2px bars over their labels.
 * - tabs: numbered mono-caps tabs (checkout); earlier steps are buttons back to them.
 * - timeline: equal-width progress (order placed); finished steps turn green.
 */
export function StepBar({ steps, current, variant = 'tabs', onPick, label }: {
  steps: readonly string[];
  current: number;
  variant?: 'tabs' | 'timeline';
  onPick?: (i: number) => void;
  label: string;
}) {
  const tabs = variant === 'tabs';
  return (
    <ol className={cx(s.bars, tabs ? s.barsTabs : s.barsTimeline)} aria-label={label}>
      {steps.map((l, i) => {
        const cls = cx(s.barStep, i < current && s.barDone, i === current && s.barNow);
        const text = tabs ? String(i + 1).padStart(2, '0') + ' ' + l : l;
        const body = <><span className={s.barLine} aria-hidden /><span>{text}</span></>;
        return (
          <li key={l} className={s.barItem}>
            {tabs && onPick
              ? <button type="button" disabled={i >= current} onClick={() => onPick(i)} aria-current={i === current ? 'step' : undefined} className={cls}>{body}</button>
              : <span className={cls} aria-current={i === current ? 'step' : undefined}>{body}</span>}
          </li>
        );
      })}
    </ol>
  );
}
