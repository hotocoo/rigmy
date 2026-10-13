'use client';

import { useEffect, useImperativeHandle, useRef, type CSSProperties, type Ref } from 'react';
import type { PickTarget, StudioHandle, StudioMode, StudioMsg, StudioUnavailableReason } from './types';

export type { StudioMsg, StudioMode, PickTarget, StudioUnavailableReason } from './types';

export interface StudioRef {
  /** Send a protocol message. Messages sent before the engine is ready are queued and flushed on ready. */
  send(msg: StudioMsg): void;
}

export interface StudioProps {
  mode: StudioMode;
  className?: string;
  style?: CSSProperties;
  /** Fires once the studio accepts messages. Push the full current state from here (the prototype host's pushAll).
   *  Also fires when WebGL is unavailable (after `onUnavailable`): the fallback lists the parts from `build` / `solo`. */
  onReady?: (api: StudioRef) => void;
  /** User clicked a part / empty space (studio mode) or pressed Escape. */
  onPick?: (part: PickTarget | null) => void;
  /** The 3D view can't run (no WebGL, renderer failed, engine failed to load) or lost its GPU context. The studio
   *  shows its own fallback; use this to adapt the surrounding UI (for example hide 3D-only controls). */
  onUnavailable?: (reason: StudioUnavailableReason) => void;
  /** A lost WebGL context came back and the 3D view resumed. */
  onRestored?: () => void;
  /** Transparent canvas, no backdrop dome. */
  transparent?: boolean;
  /** Backdrop base colour (hex). Defaults to the mode's background token (hero --bg, studio --bg-raised, solo --surface). */
  bg?: string;
  /** Force reduced motion on/off. Default: follows `prefers-reduced-motion`. */
  reducedMotion?: boolean;
  ref?: Ref<StudioRef>;
}

/** Client-only 3D build studio. Lazy-loads three.js + the engine on mount and tears everything down on unmount.
 *  Never throws: without WebGL it renders an accessible fallback and calls `onUnavailable`. */
export default function Studio({ mode, className, style, onReady, onPick, onUnavailable, onRestored, transparent, bg, reducedMotion, ref }: StudioProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<StudioHandle | null>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<StudioMsg[]>([]);
  const cbRef = useRef({ onReady, onPick, onUnavailable, onRestored });
  useEffect(() => { cbRef.current = { onReady, onPick, onUnavailable, onRestored }; });

  const apiRef = useRef<StudioRef>({
    send(msg) {
      const h = handleRef.current;
      if (h && readyRef.current) h.send(msg);
      else queueRef.current.push(msg);
    },
  });
  useImperativeHandle(ref, () => apiRef.current, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let handle: StudioHandle | null = null;
    const rm =
      reducedMotion ??
      (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    import('./engine')
      .then(({ createStudio }) => {
        if (cancelled) return;
        const h = createStudio(host, { mode, transparent, bg, reducedMotion: rm });
        handle = h;
        handleRef.current = h;
        h.on('pick', ({ part }) => cbRef.current.onPick?.(part));
        h.on('unavailable', ({ reason }) => cbRef.current.onUnavailable?.(reason));
        h.on('restored', () => cbRef.current.onRestored?.());
        h.on('ready', () => {
          if (cancelled) return;
          readyRef.current = true;
          const q = queueRef.current.splice(0);
          for (const m of q) h.send(m);
          cbRef.current.onReady?.(apiRef.current);
        });
      })
      .catch((err: unknown) => {
        // The engine chunk failed to load (offline, CDN error) or threw while starting: report instead of throwing.
        console.error('[rigmy studio] failed to start', err);
        if (!cancelled) cbRef.current.onUnavailable?.('error');
      });

    return () => {
      cancelled = true;
      readyRef.current = false;
      handleRef.current = null;
      handle?.dispose();
      handle = null;
    };
  }, [mode, transparent, bg, reducedMotion]);

  return <div ref={hostRef} className={className} style={{ position: 'relative', overflow: 'hidden', ...style }} />;
}
