'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { useRig } from '@/lib/store';
import type { StudioBuild } from '@/studio/types';
import s from './ar.module.css';

type Phase = 'idle' | 'working' | 'session' | 'error';

/** "View in your room": AR Quick Look on iOS, WebXR on Android, a GLB download elsewhere. */
export function ArButton({ build }: { build: () => StudioBuild }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [placed, setPlaced] = useState(false);
  const [msg, setMsg] = useState('');
  const overlay = useRef<HTMLDivElement>(null);
  const rotate = useRef<() => void>(() => {});
  const exit = useRef<() => void>(() => {});

  async function start() {
    const b = build();
    if (!Object.keys(b).length) { setPhase('error'); setMsg('Add a part first.'); return; }
    setPhase('working'); setMsg('');
    const ar = await import('@/studio/ar');
    const { model, tex } = ar.buildArModel(b, useRig.getState().cables);
    try {
      const mode = await ar.arSupport();
      if (mode === 'quicklook') ar.openBlob(await ar.exportUsdz(model), 'rigmy-build.usdz', true);
      else if (mode === 'download') { ar.openBlob(await ar.exportGlb(model), 'rigmy-build.glb', false); setMsg('AR needs a phone. Downloaded rigmy-build.glb (true scale, metres).'); }
      else if (overlay.current) {
        setPhase('session');
        await ar.runWebXr(model, overlay.current, { onPlaced: setPlaced, bindRotate: (fn) => { rotate.current = fn; }, bindExit: (fn) => { exit.current = fn; } });
      }
      setPhase('idle');
    } catch (err) {
      console.error('[rigmy ar]', err);
      setPhase('error'); setMsg('AR could not start on this device.');
    } finally {
      tex.dispose();
    }
  }

  return (
    <>
      <Button variant="glass" size="tool" busy={phase === 'working'} onClick={() => void start()} title="View this build at real size in your room">AR</Button>
      {msg && <p className={s.toast} role="status">{msg}</p>}
      <div ref={overlay} className={s.overlay} hidden={phase !== 'session'}>
        <p className={s.hint} role="status">{placed ? 'Tap the floor to move it' : 'Point at the floor, then tap to place'}</p>
        <div className={s.bar}>
          <Button variant="glass" size="tool" onClick={() => rotate.current()} disabled={!placed}>Rotate</Button>
          <Button variant="glass" size="tool" onClick={() => exit.current()}>Exit AR</Button>
        </div>
      </div>
    </>
  );
}
