'use client';

import { Button, Meta, Notice, Progress, Text } from '@/components/ui';
import { featuredPreset } from '@/lib/content';
import { useData } from '@/lib/data';
import { perfOf } from '@/lib/perf';
import { useRig } from '@/lib/store';
import { tone } from '@/lib/tokens';
import type { Build } from '@/lib/types';
import type { PowerView } from './shared';
import s from './layout.module.css';

/** Warning shown when the build lacks what a page needs, offering the configured featured preset as a start. */
export function PresetNotice({ message, className }: { message: string; className?: string }) {
  const d = useData();
  const set = useRig((x) => x.set);
  const preset = featuredPreset(d);
  return (
    <Notice tone="warn" role="status" className={className}>
      <span>{message}</span>
      {preset && (
        <Button variant="ghost" size="sm" onClick={() => set({ build: { ...preset.build }, picks: {} })}>
          {'Load the ' + preset.name + ' preset'}
        </Button>
      )}
    </Notice>
  );
}

/** Estimated draw against the chosen PSU. */
export function PowerMeter({ pw }: { pw: PowerView }) {
  return (
    <>
      <Text v="capsWide" as="div" className={s.capsLabel}><span>Estimated power</span><span style={{ color: pw.color }}>{pw.text}</span></Text>
      <Progress value={pw.ratio} c={pw.color} height={4} />
      <Meta>{pw.rec}</Meta>
    </>
  );
}

/** Gaming performance class of the build's GPU and CPU, with a balance note. Estimates in bands, never frame rates. */
export function PerformanceCard({ build }: { build: Build }) {
  const d = useData();
  const cpu = build.cpu ? d.byId[build.cpu] ?? null : null, gpu = build.gpu ? d.byId[build.gpu] ?? null : null;
  if (!cpu && !gpu) return null;
  const v = perfOf(cpu, gpu);
  return (
    <div className={s.perf} aria-label="Estimated gaming performance">
      <Text v="capsWide" as="div" className={s.capsLabel}><span>Gaming estimate</span></Text>
      <dl className={s.perfList}>
        {gpu && <><dt>Graphics</dt><dd>{v.gpu ? v.gpu.band : 'No estimate for this card yet'}</dd></>}
        {cpu && <><dt>Processor</dt><dd>{v.cpu ? v.cpu.label[0].toUpperCase() + v.cpu.label.slice(1) + ' for gaming' : 'No estimate for this CPU yet'}</dd></>}
      </dl>
      {v.balance && <Meta style={{ color: tone[v.balance.tone] }}>{v.balance.text}</Meta>}
      <Meta>Estimated from typical review results, not measured frame rates.</Meta>
    </div>
  );
}
