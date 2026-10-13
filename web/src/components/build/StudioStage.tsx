'use client';

import type { ReactNode } from 'react';
import { Eyebrow, Segmented } from '@/components/ui';
import { cx } from '@/lib/cx';
import { color } from '@/lib/tokens';
import Studio from '@/studio/Studio';
import type { ViewName } from '@/studio/types';
import type { StudioHost } from './useStudioHost';
import s from './layout.module.css';

/** Sticky 3D stage beside the parts column; overlays are passed as children. */
export function StudioStage({ host, label, variant, children }: { host: StudioHost; label: string; variant?: 'tall' | 'aside'; children?: ReactNode }) {
  return (
    <section className={cx(s.stage, variant === 'tall' && s.stageTall, variant === 'aside' && s.stageAside)} aria-label={label}>
      <Studio mode="studio" onReady={host.onReady} onPick={host.onPick} className={s.canvas} />
      {children}
    </section>
  );
}

/** Blue eyebrow pinned to the stage's top-left corner. */
export function StageCaption({ children }: { children: ReactNode }) {
  return <Eyebrow c={color.blueSoft} className={s.caption}>{children}</Eyebrow>;
}

/** Camera-angle buttons over the stage (momentary: the studio owns the camera, so nothing stays selected). */
export function ViewSwitch({ views, onView }: { views: readonly (readonly [ViewName, string])[]; onView: (v: ViewName) => void }) {
  return <Segmented variant="glass" label="Camera view" items={views.map(([id, label]) => ({ id, label }))} onChange={onView} />;
}
