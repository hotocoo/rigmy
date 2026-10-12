'use client';

import { useMemo } from 'react';
import { useGo } from '@/components/shell/useGo';
import { Button, Eyebrow, Panel, Text } from '@/components/ui';
import { useData } from '@/lib/data';
import { fmt, pluralWord } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import type { Build } from '@/lib/types';
import { PRESET_LINES } from './config';
import s from './home.module.css';

/** "Starting points": the configured preset builds with their real lowest total. */
export function Presets() {
  const d = useData();
  const go = useGo();
  const region = useRig((x) => x.region), set = useRig((x) => x.set);

  const presets = useMemo(() => d.presets.map((pr) => {
    const plan = d.engine.plan(pr.build, region, {}), n = plan.rows.length, miss = plan.best.missing;
    const unpriced = !n || miss >= n;
    return {
      ...pr,
      lines: PRESET_LINES.map((c) => pr.build[c]).filter((id): id is string => !!id && !!d.byId[id]).map((id) => d.byId[id].name),
      label: !unpriced && miss ? 'Partial total · ' + miss + ' ' + pluralWord(miss, 'part') + ' unpriced' : 'Lowest total',
      total: unpriced ? null : plan.best.total,
    };
  }), [d, region]);

  const load = (build: Build) => { set({ build: { ...build }, picks: {} }); go(ROUTES.build.path); };

  if (!presets.length) return null;
  return (
    <section className={s.presets} aria-labelledby="home-presets">
      <div data-rv="1" className={s.presetsHead}>
        <Eyebrow>Starting points</Eyebrow>
        <Text v="titleXlLoose" as="h2" id="home-presets">Load a build and change what you like</Text>
      </div>
      <div className={s.presetGrid}>
        {presets.map((p) => (
          <Panel key={p.id} as="article" data-rv="1" className={s.preset}>
            <div className={s.presetTop}>
              <Text v="presetName" as="h3">{p.name}</Text>
              <Text v="tagLoose" c={color.blueSoft}>{p.tier}</Text>
            </div>
            <Text v="bodySm" as="p" className={s.presetNote}>{p.note}</Text>
            <ul className={s.presetLines}>{p.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <div className={s.presetFoot}>
              <div className={s.presetTotal}>
                <span className={s.presetLabel}>{p.label}</span>
                {p.total != null ? <span className={s.presetPrice}>{fmt(p.total)}</span> : <Text v="dataLg" c={color.dim}>No price yet</Text>}
              </div>
              <Button size="mdc" onClick={() => load(p.build)} aria-label={'Load the ' + p.name + ' build'}>Load build</Button>
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}
