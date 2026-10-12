'use client';

import { Button, Meta, Notice, Progress, Text } from '@/components/ui';
import { featuredPreset } from '@/lib/content';
import { useData } from '@/lib/data';
import { useRig } from '@/lib/store';
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
