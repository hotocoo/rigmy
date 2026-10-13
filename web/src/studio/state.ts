// Shared state and lifecycle plumbing for one live scene. The scene modules (camera, interaction, build, frame)
// all read and write this object; it owns timers, tweens, DOM listeners and the async build chain.
import * as THREE from 'three';
import { Tweens, type Kit, type Part } from './materials';
import { CAT, type Layout } from './model';
import type { Brand } from './palette';
import type { Stage } from './stage';
import type {
  BuildItem, CableOpts, CalloutNote, PartId, PickTarget, StudioBuild, StudioEventName, StudioEvents, StudioMode,
} from './types';

export type Emit = <K extends StudioEventName>(ev: K, payload: StudioEvents[K]) => void;
export type Vec3 = readonly [number, number, number];

export interface SceneState {
  readonly mode: StudioMode;
  readonly reducedMotion: boolean;
  readonly brand: Brand;
  readonly kit: Kit;
  readonly S: Stage;
  readonly wrap: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly emit: Emit;
  readonly tweens: Tweens;
  readonly parts: Partial<Record<PartId, Part>>;
  /** Cable routing options, merged from `cables` messages. */
  readonly cableOpts: CableOpts;
  /** Hero pointer parallax (−1…1) and intro progress (0→1 over the reveal). */
  readonly ptr: { x: number; y: number };
  readonly intro: { k: number };

  cur: StudioBuild;
  L: Layout | null;
  selected: PickTarget | null;
  selNote: CalloutNote | null;
  hovered: PickTarget | null;
  issues: PickTarget[];
  /** Global explode target (0 assembled … 1 exploded). */
  explodeG: number;
  /** Scene clock (s), advanced by the frame loop. */
  T: number;
  built: boolean;
  cableSig: string;
  hlCable: string | null;
  xray: boolean;
  stageShow: Set<string> | null;
  heroP: number;
  shiftX: number;
  /** Scene time of the last camera interaction (Infinity while the user is orbiting). */
  lastInteract: number;
  disposed: boolean;

  tween: Tweens['add'];
  /** setTimeout that is cancelled on dispose and never fires after it. */
  later(fn: () => void, ms: number): void;
  wait(ms: number): Promise<void>;
  /** addEventListener that is removed on dispose. */
  listen<K extends keyof HTMLElementEventMap>(el: HTMLElement | Document | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions): void;
  /** Serialise async build steps; errors are logged, not thrown. */
  chain(fn: () => Promise<void> | void): void;
  partList(): Part[];
  /** Live bounds of a category's (non-leaving) parts. */
  catBox(cat: string, box: THREE.Box3): THREE.Box3;
  /** Bounds of a category at its *target* explode position. */
  partCenter(cat: PickTarget): THREE.Box3;
  curItem(c: PickTarget): BuildItem | undefined;
  removePart(id: PartId): void;
  /** Cancel timers and tweens and remove DOM listeners. */
  shutdown(): void;
}

export function createSceneState(init: {
  mode: StudioMode; reducedMotion: boolean; brand: Brand; kit: Kit; S: Stage; wrap: HTMLElement; emit: Emit;
}): SceneState {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const cleanups: (() => void)[] = [];
  const tweens = new Tweens();
  let busy: Promise<void> = Promise.resolve();

  const st: SceneState = {
    ...init,
    canvas: init.S.renderer.domElement,
    tweens,
    parts: {},
    cableOpts: { route: 'tidy', sleeve: 'black' },
    ptr: { x: 0, y: 0 },
    intro: { k: 0 },
    cur: {}, L: null,
    selected: null, selNote: null, hovered: null, issues: [],
    explodeG: 0, T: 0, built: false,
    cableSig: '', hlCable: null, xray: false, stageShow: null,
    heroP: 0, shiftX: 0, lastInteract: 0,
    disposed: false,

    tween: tweens.add.bind(tweens),
    later(fn, ms) {
      const id = setTimeout(() => { timers.delete(id); if (!st.disposed) fn(); }, ms);
      timers.add(id);
    },
    wait(ms) { return new Promise<void>((r) => st.later(r, ms)); },
    listen(el, type, fn, o) {
      el.addEventListener(type, fn as EventListener, o);
      cleanups.push(() => el.removeEventListener(type, fn as EventListener, o));
    },
    chain(fn) { busy = busy.then(fn).catch((err: unknown) => { if (!st.disposed) console.error('[rigmy studio]', err); }); },
    partList() { return Object.values(st.parts).filter((p): p is Part => !!p); },
    catBox(cat, box) {
      box.makeEmpty();
      for (const p of st.partList()) if (CAT[p.id] === cat && !p.leaving) box.expandByObject(p.group);
      return box;
    },
    partCenter(cat) {
      const box = new THREE.Box3();
      for (const p of st.partList()) {
        if (CAT[p.id] !== cat || p.leaving) continue;
        const save = p.group.position.clone();
        p.group.position.copy(p.base).addScaledVector(p.offset, p.eT); p.group.updateMatrixWorld(true);
        box.expandByObject(p.group);
        p.group.position.copy(save); p.group.updateMatrixWorld(true);
      }
      return box;
    },
    curItem(c) { return c === 'cables' ? undefined : st.cur[c]; },
    // removeFromParent (not root.remove): solo parts live in a wrapper group, which the prototype's root.remove()
    // missed, leaving the previous product's (disposed) meshes on screen after a solo switch.
    removePart(id) { const p = st.parts[id]; if (!p) return; p.group.removeFromParent(); p.dispose(); delete st.parts[id]; },
    shutdown() {
      st.disposed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      tweens.clear();
      cleanups.forEach((f) => f());
      cleanups.length = 0;
    },
  };
  return st;
}
