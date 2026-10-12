// RigMY 3D build studio — public entry point (port of project/pc-studio.html + three-d-stage.js).
// Browser-only: call createStudio() from an effect. Importing this module touches no DOM/window at top level.
// createStudio owns the container, events, the WebGL fallback and the host-state journal; the live scene itself is
// scene.ts (camera.ts, interaction.ts, build.ts, solo.ts, frame.ts over the shared state.ts).
import { CATS } from './model';
import { createFallback, mountRoot, probeWebGL, type SummaryRow } from './overlay';
import { resolveBrand } from './palette';
import { runScene, type SceneHandle } from './scene';
import type { Emit } from './state';
import type { StudioEventName, StudioEvents, StudioHandle, StudioMode, StudioMsg, StudioOptions, StudioUnavailableReason } from './types';

export type * from './types';

/** Suggested `fallbackDelay` for standalone / dev pages that want the prototype's demo build (its embedded value, ms).
 *  The app never passes it, so it only ever shows builds the user chose. */
export const DEMO_BUILD_DELAY = 1400;

/** Persistent state messages, in the order they are replayed into a rebuilt scene (`view` and `pulse` are one-shot). */
const REPLAY_ORDER: StudioMsg['rig'][] = ['mood', 'cables', 'build', 'solo', 'explode', 'issues', 'xray', 'stage', 'cable', 'frame', 'scroll', 'pointer', 'select'];

type Listeners = { [K in StudioEventName]: Set<(p: StudioEvents[K]) => void> };

/** Create a studio inside `container`. Never throws for missing WebGL: it renders a fallback and emits `unavailable`. */
export function createStudio(container: HTMLElement, opts: StudioOptions): StudioHandle {
  const MODE: StudioMode = opts.mode;
  let disposed = false;
  const listeners: Listeners = { ready: new Set(), pick: new Set(), revealed: new Set(), unavailable: new Set(), restored: new Set() };
  const emit: Emit = (ev, payload) => {
    for (const cb of [...listeners[ev]]) { try { cb(payload); } catch (err) { console.error('[rigmy studio] listener error', err); } }
  };

  const wrap = mountRoot(container);
  const fallback = createFallback(wrap, { mode: MODE, transparent: !!opts.transparent });
  /** Current reason the 3D view is down (null while it runs); `announced` once the start-up state was emitted. */
  let down: StudioUnavailableReason | null = null, announced = false, ready = false;
  const setDown = (reason: StudioUnavailableReason | null): void => {
    down = reason;
    if (reason) fallback.show(reason); else fallback.hide();
    if (!announced) return; // start-up state is emitted from the microtask below
    if (reason) emit('unavailable', { reason }); else emit('restored', {});
  };

  // Latest state the host has sent, replayed into a fresh scene after a lost context is restored.
  const journal = new Map<StudioMsg['rig'], StudioMsg>();
  const brand = resolveBrand(container, MODE);
  let revealed = false;
  /** `revealed` describes the first reveal only; a scene rebuilt after context loss replays its reveal silently. */
  const sceneEmit: Emit = (ev, payload) => {
    if (ev === 'revealed') { if (revealed) return; revealed = true; }
    emit(ev, payload);
  };
  const start = (): SceneHandle | null => {
    try {
      return runScene(wrap, opts, { brand, lowPower: tier === 'software' }, sceneEmit, { lost: () => setDown('context-lost'), restored: restart });
    } catch (err) {
      console.error('[rigmy studio] WebGL failed to start', err);
      return null;
    }
  };
  function restart(): void {
    if (disposed) return;
    scene = start();
    if (!scene) { setDown('error'); return; }
    for (const rig of REPLAY_ORDER) { const m = journal.get(rig); if (m) scene.send(m); }
    setDown(null);
  }

  let scene: SceneHandle | null = null;
  const tier = probeWebGL();
  if (tier === 'none') setDown('unsupported');
  else {
    scene = start();
    if (!scene) setDown('error');
  }

  queueMicrotask(() => {
    if (disposed) return;
    announced = true;
    if (down) emit('unavailable', { reason: down });
    ready = true;
    emit('ready', { mode: MODE });
  });

  /** Journal the host's state and keep the fallback's textual build summary in step with it. */
  function track(msg: StudioMsg): void {
    if (REPLAY_ORDER.includes(msg.rig)) {
      const prev = journal.get(msg.rig);
      // `cables` options merge across messages; `build` and `solo` replace each other.
      journal.set(msg.rig, msg.rig === 'cables' && prev?.rig === 'cables' ? { rig: 'cables', opts: { ...prev.opts, ...msg.opts } } : msg);
      if (msg.rig === 'build') journal.delete('solo');
      if (msg.rig === 'solo') journal.delete('build');
    }
    if (msg.rig === 'build') {
      const b = msg.build || {};
      fallback.setRows(CATS.flatMap((cat): SummaryRow[] => { const it = b[cat]; return it ? [{ cat, label: it.label, price: it.price }] : []; }));
    } else if (msg.rig === 'solo' && msg.item) fallback.setRows([{ cat: msg.cat, label: msg.item.label }]);
  }

  return {
    send(msg: StudioMsg): void {
      if (disposed || !msg || typeof msg !== 'object') return;
      track(msg);
      if (scene) scene.send(msg);
    },
    on(event, cb) {
      const set = listeners[event] as Set<typeof cb>;
      set.add(cb);
      // Sticky state for late subscribers: `ready` once fired, `unavailable` while the view is down.
      const replay = event === 'ready' ? (ready ? { mode: MODE } : null) : event === 'unavailable' && announced && down ? { reason: down } : null;
      if (replay) queueMicrotask(() => { if (!disposed && set.has(cb)) (cb as (p: typeof replay) => void)(replay); });
      return () => { set.delete(cb); };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      scene?.dispose();
      scene = null;
      for (const k of Object.keys(listeners) as StudioEventName[]) listeners[k].clear();
      wrap.remove();
    },
  };
}
