// Applying builds: first build + reveal, whole-rig rebuilds, single-part swaps, cable re-runs, explode and scan pulses.
import * as THREE from 'three';
import { E, V3 } from './materials';
import { CAT, CATS, ORDER, computeLayout, makePart, type CablesVis, type Layout } from './model';
import { FLOOR_Y, LIGHT } from './stage';
import type { CameraRig } from './camera';
import type { Interaction } from './interaction';
import type { SceneState } from './state';
import type { BuildItem, CableOpts, PartId, PickTarget, StudioBuild, StudioCat } from './types';

// ---------- tuning (prototype values) ----------
/** First build: parts start this far exploded and invisible, then assemble on the REVEAL timeline (ms). */
const FIRST_BUILD_EXPLODE = 1.8;
const REVEAL = {
  rims: { ms: 700 },
  keyFill: { ms: 1600, delay: 150 },
  spot: { ms: 1400, delay: 450 },
  intro: { ms: 2600 },
  atmosphere: { ms: 2400, delay: 300 },
  grid: { ms: 1600, delay: 1200 },
  gridPulseAt: 1300,
  plinth: { ms: 900, delay: 1500, rimGlow: 2.2, haloOpacity: 0.18 },
  parts: { caseDelay: 0, delay: 420, stagger: 85 },
  glows: { delay: 1700, stagger: 110 },
  interior: { ms: 1200, delay: 1800 },
  doneAt: 2700,
};
/** Case / form-factor change: everything blows out (staggered), lights dim, the rig is rebuilt and settles back in. */
const REBUILD = { outStagger: 40, outExplode: 1.5, dimTo: 0.55, dimMs: 500, swapAt: 620, inExplode: 1.5, inDelay: 60, inStagger: 80, relightMs: 900, pulseDelay: 300, refocusDelay: 200, refocusMs: 1200 };
/** Single-part swap: the old part flies out this far, the new one flies in and its glows ignite afterwards (ms). */
const SWAP = { explode: 2.4, outMs: 360, igniteAt: 520, refocusMs: 1000 };
/** Cable runs cross-fade out for this long before being rebuilt (ms). */
const CABLE_FADE_MS = 200;
/** Staggered explode: per-part delay, then camera re-frame delay and flight (ms). */
const EXPLODE = { stagger: 70, refocusDelay: 80, refocusMs: 1200 };
/** Arrival scan sweep: default delay, box padding, outline growth, duration and peak opacities. */
const SCAN = { delay: 520, pad: 0.006, grow: 0.014, ms: 950, line: 0.95, fill: 0.07 };
/** Lighting fitted to the case: plinth margin, contact shadow, interior light, spot aim and area lights. */
const FIT = {
  plinth: 1.02, contact: { w: 1.7, d: 1.35 },
  inner: { x: 0.02, y: 0.62 }, spotY: 0.5,
  areaTop: { x: 0.01, w: 0.75, d: 0.8, inset: 0.016 },
  areaFront: { w: 0.75, h: 0.62, y: 0.55, inset: 0.045, aimZ: -2 },
};

/** Resting position of the interior light inside a case. */
export const innerIdle = (lay: Layout, out: THREE.Vector3): THREE.Vector3 => out.set(FIT.inner.x, lay.h * FIT.inner.y, 0);

export type Builder = ReturnType<typeof createBuilder>;

export function createBuilder(st: SceneState, cam: CameraRig, ix: Interaction) {
  const { S, kit } = st;
  const { scene, root, key, fill, spot, rimLight, rim2, inner, areaTop, areaFront, contact, rimMat, haloMat, gridU, dustU, DUSTK, coneU, backdropU, scanner, scanMat, scanFillMat } = S;

  function pulseAt(cat: PickTarget | null, delay = SCAN.delay): void {
    gridU.uPulse.value = st.T + delay / 1000;
    st.later(() => {
      const box = cat ? st.partCenter(cat) : null; if (!box || box.isEmpty()) return;
      const s = box.getSize(new V3()); box.expandByScalar(SCAN.pad); scanner.scale.set(s.x + SCAN.grow, 1, s.z + SCAN.grow); const c = box.getCenter(new V3()); scanner.position.set(c.x, box.min.y, c.z); scanner.visible = true;
      st.tween(SCAN.ms, (k) => { scanner.position.y = box.min.y + (box.max.y - box.min.y) * k; const o = Math.sin(Math.PI * k); scanMat.opacity = o * SCAN.line; scanFillMat.opacity = o * SCAN.fill; if (k >= 1) scanner.visible = false; }, { e: E.inOut });
    }, delay);
  }

  const cablesVis = (b: StudioBuild): CablesVis => ({ ...st.cableOpts, mobo: !!b.mobo, gpuVis: b.gpu ? b.gpu.vis : null });
  const sigOf = (b: StudioBuild): string => [b.mobo && b.mobo.id, b.gpu && b.gpu.id, b.case && b.case.id, st.cableOpts.route, st.cableOpts.sleeve].join('|');
  const catOf = (id: PartId): StudioCat | null => { const c = CAT[id]; return c === 'cables' ? null : c; };
  const sameIds = (a: BuildItem | undefined, b: BuildItem | undefined): boolean => (!a && !b) || !!(a && b && a.id === b.id);

  function buildAll(b: StudioBuild, eStart: number, fadeStart: number): void {
    const lay = (st.L = computeLayout(b));
    for (const id of ORDER) {
      const cat = catOf(id); if (!cat) continue;
      const item = b[cat]; if (!item) continue;
      const p = makePart(id, kit, item.vis, lay); p.e = eStart; p.eT = eStart; p.fade = fadeStart; p.fadeT = fadeStart;
      st.parts[id] = p; root.add(p.group);
    }
    if (b.mobo) { const p = makePart('cables', kit, cablesVis(b), lay); p.e = eStart; p.eT = eStart; p.fade = fadeStart; p.fadeT = fadeStart; st.parts.cables = p; root.add(p.group); }
    st.cableSig = sigOf(b);
    S.sizePlinth(Math.max(lay.w, lay.d) * FIT.plinth);
    contact.scale.set(lay.w * FIT.contact.w, lay.d * FIT.contact.d, 1);
    innerIdle(lay, inner.position);
    spot.target.position.set(0, lay.h * FIT.spotY, 0);
    const at = FIT.areaTop, af = FIT.areaFront;
    areaTop.width = lay.w * at.w; areaTop.height = lay.d * at.d; areaTop.position.set(at.x, FLOOR_Y + lay.h - at.inset, 0); areaTop.lookAt(at.x, -1, 0);
    const frontY = FLOOR_Y + lay.h * af.y;
    areaFront.width = lay.w * af.w; areaFront.height = lay.h * af.h; areaFront.position.set(0, frontY, lay.d / 2 - af.inset); areaFront.lookAt(0, frontY, af.aimZ);
  }
  async function rebuildCables(): Promise<void> {
    const L = st.L;
    if (!L || st.mode === 'solo' || !st.built) return; const sig = sigOf(st.cur); if (sig === st.cableSig) return; st.cableSig = sig;
    const old = st.parts.cables; if (old) { old.fadeT = 0; await st.wait(CABLE_FADE_MS); st.removePart('cables'); }
    if (!st.cur.mobo || !st.L) return;
    const p = makePart('cables', kit, cablesVis(st.cur), st.L); p.e = st.explodeG; p.eT = st.explodeG; p.fade = 0; p.fadeT = 1; st.parts.cables = p; root.add(p.group);
  }

  function applyBuild(b: StudioBuild): void {
    const prev = st.cur; st.cur = b || {};
    const cur = st.cur;
    if (!st.built) { st.built = true; buildAll(cur, FIRST_BUILD_EXPLODE, 0); reveal(); ix.renderCallout(); return; }
    ix.renderCallout();
    const caseChanged = !sameIds(prev.case, cur.case) || (prev.mobo && cur.mobo && prev.mobo.vis.ff !== cur.mobo.vis.ff) || (!!prev.mobo !== !!cur.mobo);
    if (caseChanged) {
      const R = REBUILD;
      st.chain(async () => {
        const ids = Object.keys(st.parts) as PartId[];
        ids.forEach((id, i) => st.later(() => { const p = st.parts[id]; if (p) { p.eT = R.outExplode; p.fadeT = 0; } }, i * R.outStagger));
        dimLights(R.dimTo, R.dimMs);
        await st.wait(R.swapAt);
        ids.forEach(st.removePart);
        buildAll(st.cur, R.inExplode, 0);
        ORDER.forEach((id, i) => st.later(() => { const p = st.parts[id]; if (p) { p.eT = st.explodeG; p.fadeT = 1; } }, R.inDelay + i * R.inStagger));
        dimLights(1, R.relightMs); pulseAt(null, R.pulseDelay);
        if (st.mode === 'studio') st.later(() => { void cam.focus(st.selected, R.refocusMs); }, R.refocusDelay);
      });
      return;
    }
    for (const cat of CATS) {
      if (cat === 'case') continue;
      const a = prev[cat], n = cur[cat];
      if (sameIds(a, n)) continue;
      st.chain(async () => {
        const old = st.parts[cat];
        if (old) { old.leaving = true; old.eT = SWAP.explode; old.fadeT = 0; }
        await st.wait(old ? SWAP.outMs : 0);
        if (old) st.removePart(cat);
        if (n && st.L) {
          const p = makePart(cat, kit, n.vis, st.L); p.e = SWAP.explode; p.eT = st.explodeG; p.fade = 0; p.fadeT = 1; p.glowK = 0; p.glowT = 0;
          st.parts[cat] = p; root.add(p.group);
          st.later(() => { p.glowT = 1; }, SWAP.igniteAt);
          pulseAt(cat);
        }
        if (st.mode === 'studio' && st.selected === cat) void cam.focus(cat, SWAP.refocusMs);
      });
    }
    st.chain(() => rebuildCables());
  }
  function dimLights(k: number, dur: number): void {
    const s = { key: key.intensity, spot: spot.intensity };
    void st.tween(dur, (t) => { key.intensity = s.key + (LIGHT.key * k - s.key) * t; spot.intensity = s.spot + (LIGHT.spot * k - s.spot) * t; }, { e: E.out });
  }
  /** Fade the stage up and assemble the parts that are currently in `st.parts`. */
  function reveal(): void {
    const R = REVEAL, tw = st.tween;
    st.intro.k = 0;
    void tw(R.rims.ms, (t) => { rimLight.intensity = LIGHT.rim * t; rim2.intensity = LIGHT.rim2 * t; }, { e: E.out });
    void tw(R.keyFill.ms, (t) => { key.intensity = LIGHT.key * t; fill.intensity = LIGHT.fill * t; scene.environmentIntensity = LIGHT.env * t; }, { delay: R.keyFill.delay, e: E.out });
    void tw(R.spot.ms, (t) => { spot.intensity = LIGHT.spot * t; }, { delay: R.spot.delay, e: E.out });
    void tw(R.intro.ms, (t) => { st.intro.k = t; }, { e: E.inOut });
    void tw(R.atmosphere.ms, (t) => { dustU.uK.value = DUSTK * t; coneU.uK.value = t; backdropU.uK.value = t; }, { delay: R.atmosphere.delay, e: E.out });
    void tw(R.grid.ms, (t) => { gridU.uK.value = t; }, { delay: R.grid.delay, e: E.out });
    st.later(() => { gridU.uPulse.value = st.T; }, R.gridPulseAt);
    void tw(R.plinth.ms, (t) => { rimMat.emissiveIntensity = R.plinth.rimGlow * t; haloMat.opacity = R.plinth.haloOpacity * t; }, { delay: R.plinth.delay, e: E.out });
    ORDER.forEach((id, i) => {
      const p = st.parts[id]; if (!p) return;
      p.glowK = 0; p.glowT = 0;
      st.later(() => { p.eT = st.explodeG; p.fadeT = 1; }, (id === 'case' ? R.parts.caseDelay : R.parts.delay) + i * R.parts.stagger);
      st.later(() => { p.glowT = 1; }, R.glows.delay + i * R.glows.stagger);
    });
    const lit = st.mode === 'solo' ? 0 : 1;
    void tw(R.interior.ms, (t) => { inner.intensity = LIGHT.inner * t; areaTop.intensity = LIGHT.top * lit * t; areaFront.intensity = LIGHT.front * lit * t; }, { delay: R.interior.delay });
    if (st.mode === 'studio') cam.studioIntro();
    st.later(() => st.emit('revealed', {}), R.doneAt);
  }

  function setExplode(v: number, stagger?: boolean): void {
    st.explodeG = v;
    const ids = ORDER.filter((id) => { const p = st.parts[id]; return !!p && !p.leaving; });
    ids.forEach((id, i) => { const p = st.parts[id]; if (!p) return; if (stagger) st.later(() => { if (!p.leaving) p.eT = st.explodeG; }, (v > 0 ? i : ids.length - i) * EXPLODE.stagger); else p.eT = v; });
    if (st.mode === 'studio' && stagger) st.later(() => { void cam.focus(st.selected, EXPLODE.refocusMs); }, EXPLODE.refocusDelay);
  }
  function setCables(opts: Partial<CableOpts> | undefined): void {
    Object.assign(st.cableOpts, opts || {}); st.cableSig = '';
    st.chain(() => rebuildCables());
  }

  return { applyBuild, reveal, setExplode, setCables, pulseAt };
}
