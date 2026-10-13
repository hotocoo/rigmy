'use client';

import { useGo } from '@/components/shell/useGo';
import { EmptyState, Eyebrow, Progress, Text } from '@/components/ui';
import { useGuide } from '@/lib/content';
import { cx } from '@/lib/cx';
import { useData } from '@/lib/data';
import { href, ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import type { GuideStepDef, Product } from '@/lib/types';
import { GuideCard } from './GuideCard';
import { PresetNotice } from './Notices';
import { idx2 } from './shared';
import { StudioStage } from './StudioStage';
import { useStudioHost } from './useStudioHost';
import g from './guide.module.css';
import l from './layout.module.css';

export function GuidePage() {
  const d = useData();
  const go = useGo();
  const build = useRig((x) => x.build), guideStep = useRig((x) => x.guideStep), set = useRig((x) => x.set);
  const host = useStudioHost('guide');
  const steps = useGuide();
  const n = steps.length;
  const count = d.categories.filter((c) => build[c.id]).length;
  const totalMin = steps.reduce((a, st) => a + st.minutes, 0);
  const i = Math.max(0, Math.min(guideStep, n - 1)), st = steps[i];
  const partOf = (cat: GuideStepDef['cat']): Product | null => (cat && cat !== 'cables' && build[cat] ? d.byId[build[cat]!] || null : null);
  const goStep = (j: number) => set({ guideStep: Math.max(0, Math.min(n - 1, j)) });

  return (
    <div className={l.split}>
      <section className={cx(l.side, l.sideNarrow)} aria-labelledby="guide-title">
        <div className={g.head}>
          <Eyebrow>{'About ' + totalMin + ' minutes in total'}</Eyebrow>
          <Text v="pageTitle" as="h1" id="guide-title">Build guide</Text>
          {n > 0 && <div className={g.progress}><Progress value={(i + 1) / n} /></div>}
        </div>

        {n === 0 && <div className={g.notice}><EmptyState title="No guide steps yet" body="The assembly guide is configured on the server; it will appear here once steps are published." /></div>}
        {n > 0 && count === 0 && <PresetNotice className={g.notice} message="Your build is empty, so the 3D steps have nothing to show." />}

        <ol className={g.steps} aria-label="Assembly steps">
          {steps.map((step, j) => {
            const p = partOf(step.cat);
            const on = j === i;
            return (
              <li key={j}>
                <button type="button" onClick={() => goStep(j)} aria-current={on ? 'step' : undefined} className={cx(g.step, on && g.stepOn)}>
                  <span className={cx(g.num, j < i && g.numDone)}>{idx2(j + 1)}</span>
                  <span className={g.body}>
                    <span className={g.stepTitle}>{step.title}</span>
                    <Text v="metaTight">{p ? p.name : step.cat === 'cables' ? 'Cable runs' : step.cat ? 'Not in your build' : 'Whole build'}</Text>
                  </span>
                  <span className={g.mins}>{step.minutes + ' min'}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <StudioStage host={host} label="3D assembly preview" variant="tall">
        {st && (
          <GuideCard step={st} index={i} total={n} part={partOf(st.cat)}
            onPart={(p) => go(href.part(p.id))}
            onBack={() => goStep(i - 1)}
            onNext={() => goStep(i + 1)}
            onFinish={() => go(ROUTES.review.path)} />
        )}
      </StudioStage>
    </div>
  );
}
