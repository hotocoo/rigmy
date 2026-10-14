'use client';

import { useMemo } from 'react';
import { SaveShare } from '@/components/market/SaveShare';
import { useGo } from '@/components/shell/useGo';
import { Button, Eyebrow, Meta, Notice, Text } from '@/components/ui';
import { useRegion } from '@/lib/content';
import { useData } from '@/lib/data';
import { href, ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import type { CatId } from '@/lib/types';
import { BuilderStage } from './BuilderStage';
import { BuildRow } from './BuildRow';
import { downloadCsv } from './csv';
import { SwapList } from './swaps';
import { PerformanceCard, PowerMeter } from './Notices';
import { errText, partPrice, powerView, presetName, totalView } from './shared';
import { useStudioHost } from './useStudioHost';
import s from './builder.module.css';
import l from './layout.module.css';

export function BuilderPage() {
  const d = useData();
  const go = useGo();
  const build = useRig((x) => x.build), region = useRig((x) => x.region), sel = useRig((x) => x.sel);
  const set = useRig((x) => x.set), removePart = useRig((x) => x.removePart);
  const host = useStudioHost('builder');

  const checks = useMemo(() => d.engine.compat(build), [d, build]);
  const plan = useMemo(() => d.engine.plan(build, region, {}), [d, build, region]);
  const pw = useMemo(() => powerView(d.engine.power(build)), [d, build]);
  const count = d.categories.filter((c) => build[c.id] && d.byId[build[c.id]!]).length;
  const errs = checks.filter((c) => c.status === 'error');
  const reg = useRegion();
  const tot = totalView(d, build, region, plan.best, count);
  const buildName = presetName(d, build) || (count ? 'Custom build' : 'Empty build');
  const browse = (cat: CatId) => go(href.parts(cat), { facet: 'All', previewId: build[cat] || null });

  return (
    <div className={l.split}>
      <section className={l.side} aria-labelledby="build-name">
        <header className={s.head}>
          <div className={s.headText}>
            <Eyebrow>{'Your build · ' + count + '/' + d.categories.length}</Eyebrow>
            <Text v="name" as="h1" id="build-name">{buildName}</Text>
          </div>
          <div className={s.headTools}>
            <SaveShare build={build} region={region} variant="mini" />
            <Button variant="mini" onClick={() => downloadCsv(d, build, region)}>CSV</Button>
            <Button variant="mini" onClick={() => set({ build: {}, sel: null, picks: {} })}>Clear</Button>
          </div>
        </header>

        <ul className={s.rows} aria-label="Parts">
          {d.categories.map((c) => {
            const id = build[c.id];
            const p = id ? d.byId[id] || null : null;
            return (
              <BuildRow key={c.id} cat={c} part={p} price={p ? partPrice(d, p.id, region) : null} checks={checks} selected={sel === c.id}
                onSelect={() => set((x) => ({ sel: x.sel === c.id ? null : c.id }))}
                onDetail={() => p && go(href.part(p.id))}
                onBrowse={() => browse(c.id)}
                onRemove={() => removePart(c.id)} />
            );
          })}
        </ul>

        <SwapList d={d} build={build} region={region} />

        <div className={s.power}><PowerMeter pw={pw} /><PerformanceCard build={build} /></div>

        <footer className={s.foot}>
          <div className={s.totals}>
            <div className={s.totalBlock}>
              <Text v="capsWide">{'Lowest total · ' + reg.name}</Text>
              <Text v="figureLg">{tot.total}</Text>
            </div>
            <Meta className={s.note}>{tot.note}</Meta>
          </div>
          {errs.length > 0 && <Notice tone="error">{errText(errs)}</Notice>}
          <div className={s.ctas}>
            <Button size="tall" className={s.ctaMain} onClick={() => go(ROUTES.review.path)}>Review build</Button>
            <Button variant="ghost" size="tall" className={s.ctaAlt} onClick={() => go(ROUTES.cables.path)}>Cables</Button>
            <Button variant="ghost" size="tall" className={s.ctaAlt} onClick={() => go(ROUTES.guide.path)}>Build guide</Button>
          </div>
        </footer>
      </section>

      <BuilderStage host={host} checks={checks} />
    </div>
  );
}
