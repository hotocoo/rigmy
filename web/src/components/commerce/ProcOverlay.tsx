'use client';

import { Eyebrow, Progress, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { plural } from '@/lib/format';
import { color } from '@/lib/tokens';
import { PROC_STEPS } from './useCheckout';
import s from './checkout.module.css';

/** Blocking progress dialog while the order is saved and the retailer hand-off is prepared. `proc` is 1-based. */
export function ProcOverlay({ proc, shops, total }: { proc: number; shops: number; total: string }) {
  const n = PROC_STEPS.length, done = proc >= n;
  return (
    <div className={s.overlay}>
      <div data-rv="s" className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="proc-title" aria-busy={!done}>
        <div className={s.dialogHead}>
          <Eyebrow c={color.blueSoft}>{'Retailer hand-off · ' + plural(shops, 'shop')}</Eyebrow>
          <span className={s.dialogNote}>No payment taken</span>
        </div>
        <Text v="dialogTitle" as="h2" id="proc-title" aria-live="polite">{done ? 'Order saved' : PROC_STEPS[proc - 1] + '…'}</Text>
        <Progress value={proc / n} glowing label="Order progress" />
        <ol className={s.procSteps}>
          {PROC_STEPS.map((l, i) => {
            const dn = i < proc - 1 || done, act = i === proc - 1 && !done;
            return (
              <li key={l} className={cx(s.procStep, dn && s.procDone, act && s.procActive)} aria-current={act ? 'step' : undefined}>
                <span className={s.procDot} aria-hidden />{l}
              </li>
            );
          })}
        </ol>
        <div className={s.dialogFoot}><span>Total</span><span>{total}</span></div>
      </div>
    </div>
  );
}
