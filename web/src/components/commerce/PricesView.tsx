'use client';

import { useGo } from '@/components/shell/useGo';
import { Button, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { fmt, MODE_LABEL, plural } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { HeadTotal, PageHead } from './parts';
import { isPriced, PlanStrategies } from './PlanStrategies';
import { PriceMatrix } from './PriceMatrix';
import { useCommerce } from './useCommerce';
import { etaLower, stepLabel } from './util';
import s from './commerce.module.css';

export function PricesView() {
  const go = useGo();
  const planMode = useRig((st) => st.planMode);
  const c = useCommerce();
  const { d, chosen, count } = c;
  const priced = isPriced(chosen, count);
  const total = priced ? fmt(chosen.total) : '—';
  const meta = priced
    ? MODE_LABEL[planMode] + ' · ' + plural(chosen.shops, 'shop') + ' · arrives in ' + etaLower(d.engine.maxEta(chosen.choice))
    : d.retailers.length ? 'No retailer listings yet for this build' : 'No retailer listings yet';

  return (
    <div className={cx(s.page, s.wPlan)}>
      <PageHead eyebrow={stepLabel(ROUTES.prices.step) + ' · Delivering to ' + c.regionName} title="Choose how to buy" right={<HeadTotal value={total} note={meta} />} />

      {count === 0 ? (
        <div className={cx(s.empty, s.emptyLoose)}>
          <Text v="body" as="p" className={s.p}>Add parts to your build to compare shops.</Text>
          <Button onClick={() => go(ROUTES.build.path)}>Go to builder</Button>
        </div>
      ) : (
        <>
          <PlanStrategies c={c} />
          <PriceMatrix c={c} />
          <div className={s.actions}>
            <Button variant="ghost" size="tall" onClick={() => go(ROUTES.review.path)}>Back to review</Button>
            <Button size="tall" wide onClick={() => go(ROUTES.cart.path)}>{'Add to cart · ' + total}</Button>
          </div>
        </>
      )}
    </div>
  );
}
