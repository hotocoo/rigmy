'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useGo } from '@/components/shell/useGo';
import { Button, Eyebrow, Meta, Notice, StepBar, Text } from '@/components/ui';
import { useNow } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { plural } from '@/lib/format';
import { useUserLoc } from '@/lib/location';
import { ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { DetailsStep } from './DetailsStep';
import { PageHead, SummaryTotals } from './parts';
import { ProcOverlay } from './ProcOverlay';
import { RetailersStep } from './RetailersStep';
import { ReviewStep } from './ReviewStep';
import { buildOrder, pickupGroupsOf, usePlaceOrder, useSlots, validateDetails, type FieldErrors, type FieldKey } from './useCheckout';
import { useCommerce, type Commerce } from './useCommerce';
import { stepLabel } from './util';
import s from './checkout.module.css';
import cs from './commerce.module.css';

const STEPS = ['Details', 'Retailers', 'Review'] as const;
const DETAILS = 0, RETAILERS = 1, REVIEW = 2;

function CheckoutSummary({ c }: { c: Commerce }) {
  return (
    <aside className={cx(cs.aside, cs.asideTight)} aria-label="Order summary">
      <Eyebrow>{c.cartPlan}</Eyebrow>
      <SummaryTotals parts={c.partsText} fee={c.feeText} total={c.totalText} totalType="figure" />
      <Meta>{c.payNote}</Meta>
      {c.missing.length > 0 && <span className={s.missingNote}>{plural(c.missing.length, 'part has', 'parts have') + ' no listing here yet and are not included.'}</span>}
    </aside>
  );
}

/** Why checkout can't start, with the one action that fixes it. */
function NotReady({ c }: { c: Commerce }) {
  const go = useGo();
  const empty = c.count === 0, blocked = c.errs.length > 0;
  return (
    <div className={cs.empty}>
      {blocked && !empty
        ? <Notice tone="error">{c.errText}</Notice>
        : <Text v="body" as="p" className={cs.p}>{empty ? 'Your cart is empty.' : 'No retailer listings yet for these parts in ' + c.regionName + '.'}</Text>}
      {empty ? <Button onClick={() => go(ROUTES.build.path)}>Start a build</Button>
        : blocked ? <Button onClick={() => go(ROUTES.review.path)}>Fix in review</Button>
          : <Button onClick={() => go(ROUTES.cart.path)}>Back to cart</Button>}
    </div>
  );
}

export function CheckoutView() {
  const go = useGo();
  const c = useCommerce();
  const co = useRig((st) => st.co), setCo = useRig((st) => st.setCo);
  const now = useNow(null);
  const here = useUserLoc();
  const slots = useSlots(c, now);
  const pickupGroups = pickupGroupsOf(c, co, here, now);
  const branchOf = (rid: string) => pickupGroups.find((p) => p.g.rid === rid)?.sel?.b || null;
  const { proc, place } = usePlaceOrder();
  const [errors, setErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  const setField = (k: FieldKey, v: string) => {
    setCo({ [k]: v });
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const toStep = (step: number) => setCo({ step, err: '' });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (co.step === DETAILS) {
      const v = validateDetails(co);
      setErrors(v.errors);
      if (v.summary) {
        setCo({ err: v.summary });
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
        return;
      }
      return toStep(RETAILERS);
    }
    if (co.step === RETAILERS) return toStep(REVIEW);
    place(buildOrder(c, co, slots, branchOf));
  };
  const back = () => (co.step > DETAILS ? toStep(co.step - 1) : go(ROUTES.cart.path));
  const nextLabel = co.step === REVIEW ? 'Place order · ' + c.totalText : co.step === RETAILERS ? 'Review order' : 'Continue to retailers';
  const ready = c.count > 0 && c.has && c.errs.length === 0;

  return (
    <div className={cx(cs.page, cs.wCart)}>
      <PageHead eyebrow={stepLabel(ROUTES.checkout.step) + ' · Buy from each retailer'} title="Checkout"
        right={ready ? <StepBar steps={STEPS} current={co.step} onPick={toStep} label="Checkout steps" /> : undefined} />

      {!ready ? <NotReady c={c} /> : (
        <div className={cs.layout}>
          <form ref={formRef} noValidate onSubmit={submit} className={cx(cs.main, cs.mainLoose)} aria-label={STEPS[co.step]}>
            {co.step === DETAILS && <DetailsStep c={c} slots={slots} pickupGroups={pickupGroups} errors={errors} setField={setField} />}
            {co.step === RETAILERS && <RetailersStep groups={c.groups} pickup={c.pickup} branchOf={(rid) => branchOf(rid)?.name || null} />}
            {co.step === REVIEW && <ReviewStep c={c} slots={slots} pickupGroups={pickupGroups} />}
            {co.err && <Notice tone="error" size="lg">{co.err}</Notice>}
            <div className={cs.actions}>
              <Button variant="ghost" size="lgSlim" onClick={back}>Back</Button>
              <Button type="submit" size="lg" wide disabled={proc > 0}>{nextLabel}</Button>
            </div>
          </form>
          <CheckoutSummary c={c} />
        </div>
      )}

      {proc > 0 && <ProcOverlay proc={proc} shops={c.groups.length} total={c.totalText} />}
    </div>
  );
}
