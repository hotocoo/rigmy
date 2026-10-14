'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui';
import { useRig } from '@/lib/store';
import type { StudioBuild } from '@/studio/types';
import s from './ar.module.css';

type Phase = 'idle' | 'working' | 'session' | 'error';
type ArModule = typeof import('@/studio/ar');
type ArMode = Awaited<ReturnType<ArModule['arSupport']>>;

/** "View in your room": AR Quick Look on iOS, WebXR on Android, a GLB download elsewhere. */
export function ArButton({ build }: { build: () => StudioBuild }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [placed, setPlaced] = useState(false);
  const [msg, setMsg] = useState('');
  const overlay = useRef<HTMLDivElement>(null);
  const rotate = useRef<() => void>(() => {});
  const exit = useRef<() => void>(() => {});
  // Loaded ahead of the tap so a WebXR session can be requested while the tap still counts as a user activation.
  const ar = useRef<{ mod: ArModule; mode: ArMode } | null>(null);
  useEffect(() => {
    let live = true;
    import('@/studio/ar').then(async (mod) => { const mode = await mod.arSupport(); if (live) ar.current = { mod, mode }; }).catch((err: unknown) => console.error('[rigmy ar]', err));
    return () => { live = false; };
  }, []);

  async function start() {
    const b = build();
    if (!Object.keys(b).length) { setPhase('error'); setMsg('Add a part first.'); return; }
    setMsg('');
    const loaded = ar.current ?? { mod: await import('@/studio/ar'), mode: undefined };
    const { mod } = loaded;
    const cables = useRig.getState().cables;
    let tex: { dispose(): void } | null = null;
    const makeModel = () => { const m = mod.buildArModel(b, cables); tex = m.tex; return m.model; };
    try {
      const mode = loaded.mode ?? (await mod.arSupport());
      if (mode === 'webxr' && overlay.current) {
        // The overlay must be on screen before the session takes it over as its DOM overlay.
        flushSync(() => { setPhase('session'); setPlaced(false); });
        await mod.runWebXr(makeModel, overlay.current, { onPlaced: setPlaced, bindRotate: (fn) => { rotate.current = fn; }, bindExit: (fn) => { exit.current = fn; } });
      } else {
        setPhase('working');
        if (mode === 'quicklook') mod.openBlob(await mod.exportUsdz(makeModel()), 'rigmy-build.usdz', true);
        else { mod.openBlob(await mod.exportGlb(makeModel()), 'rigmy-build.glb', false); setMsg('AR needs a phone. Downloaded rigmy-build.glb (true scale, metres).'); }
      }
      setPhase('idle');
    } catch (err) {
      console.error('[rigmy ar]', err);
      setPhase('error'); setMsg('AR could not start on this device.');
    } finally {
      (tex as { dispose(): void } | null)?.dispose();
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
