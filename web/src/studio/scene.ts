// One live WebGL scene: wires the stage and the scene modules together, dispatches messages, runs the loop and
// handles WebGL context loss. Created and replaced by engine.ts.
import { TexCache, type Kit } from './materials';
import { DEFAULT_BUILD } from './model';
import { createBuilder } from './build';
import { createCamera } from './camera';
import { createFrame } from './frame';
import { createInteraction } from './interaction';
import type { Brand } from './palette';
import { createSolo } from './solo';
import { startLoop } from './loop';
import { QUALITY_LEVELS, createQualityGovernor } from './quality';
import { createStage } from './stage';
import { createSceneState, type Emit } from './state';
import type { PartId, StudioMsg, StudioOptions } from './types';

/** Deferred teardown runs when the browser is idle, or after this long at the latest (ms). */
const DEFERRED_FREE_TIMEOUT_MS = 2000;
const whenIdle = (fn: () => void): void => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: DEFERRED_FREE_TIMEOUT_MS });
  else setTimeout(fn, 0);
};

/** Host `bg` option ('07080b' / '#07080b') → 0xRRGGBB (short or invalid strings are zero-padded, as the prototype did). */
const parseBg = (bg: string): number => parseInt((bg.replace(/[^0-9a-f]/gi, '') + '000000').slice(0, 6), 16);

export interface SceneHandle { send(msg: StudioMsg): void; dispose(): void }
export interface SceneHooks {
  /** The GL context was lost; the scene has already released itself. */
  lost(): void;
  /** The browser restored the context; the owner should start a fresh scene. */
  restored(): void;
}

/** Start the scene inside `wrap`. Throws if the renderer cannot start (nothing is left behind). */
/** `lowPower`: WebGL runs on a software rasteriser (or with a major performance caveat), so start at the lowest
 *  quality level instead of discovering it frame by frame. */
export function runScene(wrap: HTMLElement, opts: StudioOptions, device: { brand: Brand; lowPower: boolean }, emit: Emit, hooks: SceneHooks): SceneHandle {
  const { brand } = device;
  const startLevel = device.lowPower ? QUALITY_LEVELS.length - 1 : 0;
  const tex = new TexCache();
  const kit: Kit = { tex, brand };
  let S: ReturnType<typeof createStage>;
  try {
    S = createStage(wrap, kit, {
      mode: opts.mode, bg: opts.bg ? parseBg(opts.bg) : brand.bg, transparent: !!opts.transparent, reducedMotion: !!opts.reducedMotion,
      size: { w: wrap.clientWidth || 1, h: wrap.clientHeight || 1 }, pixelRatioCap: QUALITY_LEVELS[startLevel].pixelRatio, envMapSize: QUALITY_LEVELS[startLevel].envMapSize,
    });
  } catch (err) {
    tex.dispose();
    throw err;
  }
  const st = createSceneState({ mode: opts.mode, reducedMotion: !!opts.reducedMotion, brand, kit, S, wrap, emit });
  const { controls, moodT } = S;
  const canvas = st.canvas;

  const cam = createCamera(st);
  const ix = createInteraction(st, cam);
  const builder = createBuilder(st, cam, ix);
  const solo = createSolo(st, cam, builder);
  const frame = createFrame(st, cam, ix);

  function handle(m: StudioMsg): void {
    switch (m.rig) {
      case 'build': builder.applyBuild(m.build); break;
      case 'solo': solo.show(m.cat, m.item); break;
      case 'select': ix.select(m.part, m.note); break;
      case 'explode': builder.setExplode(m.v, m.stagger); break;
      case 'issues': ix.setIssues(m.parts); break;
      case 'view': if (st.mode === 'studio') { ix.dropSelection(); const [t, p] = cam.viewPose(m.name); void cam.flyTo(t, p); } break;
      case 'cables': builder.setCables(m.opts); break;
      case 'cable': st.hlCable = m.id || null; break;
      case 'xray': st.xray = !!m.v; break;
      case 'stage': st.stageShow = m.show ? new Set(m.show) : null; break;
      case 'scroll': st.heroP = m.p; break;
      case 'pointer': st.ptr.x = m.x; st.ptr.y = m.y; break;
      case 'frame': st.shiftX = m.shiftX || 0; break;
      case 'mood': moodT.set(m.color || brand.accent); break;
      case 'pulse': builder.pulseAt(m.part || null, 0); break;
    }
  }

  // ---------- resize + loop (ex three-d-stage) ----------
  const fit = (): void => { if (st.disposed) return; S.resize(wrap.clientWidth || 1, wrap.clientHeight || 1); };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(wrap);
  // Quality first: the level decides shadows etc., which are part of the shader keys warmed below.
  const governor = createQualityGovernor((q) => S.setQuality(q), startLevel);
  // Shader warm-up (warmup.ts): the stage and every new part are compiled ahead and linked a program per tick; the
  // scene holds still (no simulation, no render) meanwhile, so no visible frame ever stalls on a shader.
  S.warmup.add(S.scene, false);
  S.warmup.addPost();
  kit.onPartReady = (p) => { S.warmup.add(p.group, true); };
  const loop = startLoop(wrap, (dt) => {
    // Never make a synchronous GL call while the GPU is still busy: it would block until the backlog drains.
    if (S.gpuBusy()) return S.warmup.pending ? 'waiting' : 'gpu-busy';
    if (S.warmup.pending) { S.warmup.step(); S.markGpu(); return 'waiting'; }
    frame(dt); controls.update(); S.render(dt);
    return 'rendered';
  }, governor);

  // ---------- WebGL context loss ----------
  // On loss, stop and release everything at once: GPU deletes are no-ops on a lost context, whereas deleting after a
  // restore would hit the new context with stale handles. The canvas stays (under the fallback) to receive
  // `webglcontextrestored`; the owner then builds a fresh scene and replays the host's state into it.
  const onLost = (e: Event): void => {
    e.preventDefault(); // allow the browser to restore the context
    if (st.disposed) return;
    stop();
    free(true);
    hooks.lost();
  };
  const onRestored = (): void => { detachCanvas(); hooks.restored(); };
  function detachCanvas(): void {
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    canvas.remove();
  }
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  // ---------- opt-in demo build ----------
  if (typeof opts.fallbackDelay === 'number') {
    st.later(() => {
      if (st.built) return;
      if (st.mode === 'solo') solo.show('gpu', DEFAULT_BUILD.gpu); else builder.applyBuild(DEFAULT_BUILD);
    }, opts.fallbackDelay);
  }

  /** Cheap, synchronous part of teardown: stop the loop, timers, observers and listeners, drop the overlays. */
  function stop(): void {
    st.shutdown();
    loop.stop();
    ro.disconnect();
    cam.dispose();
    ix.dispose();
  }
  /** GPU/heap release: meshes, materials, textures, render targets, the context itself. */
  function free(contextLost: boolean): void {
    for (const id of Object.keys(st.parts) as PartId[]) st.removePart(id);
    S.dispose(contextLost);
    tex.dispose();
  }

  return {
    send(msg: StudioMsg): void {
      if (st.disposed) return;
      try { handle(msg); } catch (err) { console.error('[rigmy studio] message failed', msg.rig, err); }
    },
    dispose(): void {
      detachCanvas();
      if (st.disposed) return;
      // Keep unmount (route changes) fast: stop now, release GPU resources once the browser is idle.
      stop();
      whenIdle(() => free(false));
    },
  };
}
