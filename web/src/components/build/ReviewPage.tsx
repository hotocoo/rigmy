'use client';

import { useMemo } from 'react';
import { toast } from '@/components/shell/motion';
import { useGo } from '@/components/shell/useGo';
import { Button, Eyebrow, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { useData } from '@/lib/data';
import { href, ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color, tone } from '@/lib/tokens';
import type { Check } from '@/lib/types';
import { PerformanceCard, PowerMeter } from './Notices';
import { ReviewChecks } from './ReviewChecks';
import { choiceText, idx2, powerView, totalView } from './shared';
import { StageCaption, StudioStage } from './StudioStage';
import { useStudioHost } from './useStudioHost';
import l from './layout.module.css';
import r from './review.module.css';

const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

export function ReviewPage() {
  const d = useData();
  const go = useGo();
  const build = useRig((x) => x.build), region = useRig((x) => x.region), setPart = useRig((x) => x.setPart);
  const host = useStudioHost('review');

  const checks = useMemo(() => d.engine.compat(build), [d, build]);
  const plan = useMemo(() => d.engine.plan(build, region, {}), [d, build, region]);
  const pw = useMemo(() => powerView(d.engine.power(build)), [d, build]);
  const total = d.categories.length;
  const count = d.categories.filter((c) => build[c.id] && d.byId[build[c.id]!]).length;
  const missing = total - count;
  const errs = checks.filter((c) => c.status === 'error');
  const okN = checks.filter((c) => c.status === 'ok').length;
  const tot = totalView(d, build, region, plan.best, count);

  const head = errs.length ? plural(errs.length, 'problem to fix', 'problems to fix') : missing > 0 ? plural(missing, 'part still missing', 'parts still missing') : 'Everything fits';
  const headColor = errs.length ? tone.error : missing > 0 ? tone.warn : tone.ok;

  const applyFix = (c: Check) => {
    if (!c.fix) return;
    setPart(c.fix.cat, c.fix.id);
    const p = d.byId[c.fix.id];
    if (p) toast((p.short || p.name) + ' added to your build');
  };

  return (
    <div className={l.split}>
      <section className={r.main} aria-labelledby="review-title">
        <header className={r.head}>
          <Eyebrow>{'Step ' + idx2(ROUTES.review.step) + ' · ' + okN + ' of ' + checks.length + ' checks passed'}</Eyebrow>
          <Text v="headline" as="h1" id="review-title" c={headColor}>{head}</Text>
        </header>

        <ReviewChecks checks={checks} onFix={applyFix} onFocus={(c) => { if (c.parts[0]) host.post({ rig: 'select', part: c.parts[0] }); }} />

        <div className={r.power}><PowerMeter pw={pw} /><PerformanceCard build={build} /></div>

        <ul className={r.parts} aria-label="Parts in your build">
          {d.categories.map((c) => {
            const id = build[c.id];
            const p = id ? d.byId[id] || null : null;
            const o = p ? plan.best.choice[p.id] : null;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => go(href.parts(c.id), { facet: 'All', previewId: id || null })} className={cx(r.part, !p && r.partMissing)}>
                  <Text v="tagLoose">{c.long}</Text>
                  <Text v="label">{p ? p.name : 'Missing'}</Text>
                  <Text v="dataLg" c={p && !o ? color.muted : color.fg2}>{p ? choiceText(d, p.id, region, o) : '—'}</Text>
                </button>
              </li>
            );
          })}
        </ul>

        <footer className={r.foot}>
          <Button variant="ghost" size="tall" onClick={() => go(ROUTES.build.path)}>Back to build</Button>
          <div className={r.footEnd}>
            <span title={tot.note} className={r.total}>
              <span className={r.totalValue}>{tot.total}</span>
              {!tot.priced && <span className={r.totalNote}>{tot.note}</span>}
            </span>
            <Button size="tall" wide onClick={() => go(ROUTES.prices.path)}>Compare prices</Button>
          </div>
        </footer>
      </section>

      <StudioStage host={host} label="3D review" variant="aside">
        <StageCaption>Problems are outlined in red</StageCaption>
      </StudioStage>
    </div>
  );
}
