'use client';

import { Button, Dot, Eyebrow } from '@/components/ui';
import { useRig } from '@/lib/store';
import { color, tone } from '@/lib/tokens';
import type { Check } from '@/lib/types';
import type { ViewName } from '@/studio/types';
import { StudioStage, ViewSwitch } from './StudioStage';
import type { StudioHost } from './useStudioHost';
import s from './builder.module.css';
import l from './layout.module.css';

const VIEWS = [['hero', 'Hero'], ['side', 'Side'], ['front', 'Front'], ['top', 'Top']] as const satisfies readonly (readonly [ViewName, string])[];

/** The builder's 3D studio with explode / x-ray / camera controls and the compatibility chips. */
export function BuilderStage({ host, checks }: { host: StudioHost; checks: Check[] }) {
  const explode = useRig((x) => x.explode), xray = useRig((x) => x.xray), set = useRig((x) => x.set);
  return (
    <StudioStage host={host} label="3D build studio">
      <div className={s.intro}>
        <Eyebrow c={color.blueSoft}>3D studio</Eyebrow>
        <span className={s.hint}>Drag to orbit · scroll to zoom · click a part</span>
      </div>
      <div className={l.tools}>
        <Button variant="glass" size="tool" on={!!explode} onClick={() => set((x) => ({ explode: x.explode ? 0 : 1 }))}>Explode</Button>
        <Button variant="glass" size="tool" on={xray} onClick={() => set((x) => ({ xray: !x.xray }))}>X-ray</Button>
        <ViewSwitch views={VIEWS} onView={(name) => { set({ sel: null }); host.post({ rig: 'view', name }); }} />
      </div>
      <div className={s.checks} role="group" aria-label="Compatibility checks">
        {checks.map((c) => (
          <button key={c.id} type="button" className={s.check} onClick={() => { if (c.parts[0]) set({ sel: c.parts[0] }); }}>
            <Dot c={tone[c.status]} glowPx={0} /><span>{c.label}</span><span className={s.checkValue}>{c.value}</span>
          </button>
        ))}
      </div>
    </StudioStage>
  );
}
