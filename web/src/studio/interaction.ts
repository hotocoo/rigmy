// Selection and pointer interaction: picking, hover tooltip, click-to-pick, Escape, corner brackets and the callout.
import * as THREE from 'three';
import { V3, matData, type Part } from './materials';
import { CAT, LABEL } from './model';
import { createCallout, createTooltip } from './overlay';
import { SCENE_COLOR } from './palette';
import type { Bracket } from './stage';
import type { CameraRig } from './camera';
import type { SceneState } from './state';
import type { BuildItem, CalloutNote, PartId, PickTarget } from './types';

// ---------- tuning (prototype values) ----------
/** Corner brackets: ease rate, box padding, arm length (fraction of the box edge), issue pulse, visibility threshold,
 *  per-bracket opacity, max issue brackets; a reselect restarts from `reselectFrom`, the callout shows above `calloutFrom`. */
const BRACKET = {
  rate: 10, pad: 0.012, arm: 0.2, pulse: { speed: 5, min: 0.6 }, visibleAbove: 0.01,
  alpha: { select: 1, hover: 0.35, issue: 0.9 }, maxIssues: 4, reselectFrom: 0.2, calloutFrom: 0.3,
};
/** Pointer input: click movement tolerance (px), hover raycast throttle (ms), minimum fade for a part to be pickable. */
const INPUT = { clickTolerance: 5, hoverThrottle: 40, pickableFade: 0.3 };

export type Interaction = ReturnType<typeof createInteraction>;

export function createInteraction(st: SceneState, cam: CameraRig) {
  const { S, wrap, canvas } = st;
  const { camera, root } = S;
  const callout = createCallout(wrap);
  const tip = createTooltip(wrap);
  const tmpV = new V3(), tmpS = new V3();

  // ---------- brackets ----------
  function updateBracket(b: Bracket, dt: number): void {
    b.k += (b.kT - b.k) * Math.min(1, dt * BRACKET.rate);
    const show = b.cat && b.k > BRACKET.visibleAbove;
    b.line.visible = !!show; if (!show || !b.cat) return;
    st.catBox(b.cat, b.box); if (b.box.isEmpty()) { b.line.visible = false; return; }
    b.box.expandByScalar(BRACKET.pad);
    const mn = b.box.min, mx = b.box.max, s = b.box.getSize(tmpS), arm = BRACKET.arm * b.k;
    const posAttr = b.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = posAttr.array as Float32Array; let i = 0;
    const seg = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => { a[i++] = x1; a[i++] = y1; a[i++] = z1; a[i++] = x2; a[i++] = y2; a[i++] = z2; };
    for (const x of [mn.x, mx.x]) for (const y of [mn.y, mx.y]) for (const z of [mn.z, mx.z]) {
      const sx = x === mn.x ? 1 : -1, sy = y === mn.y ? 1 : -1, sz = z === mn.z ? 1 : -1;
      seg(x, y, z, x + sx * s.x * arm, y, z); seg(x, y, z, x, y + sy * s.y * arm, z); seg(x, y, z, x, y, z + sz * s.z * arm);
    }
    posAttr.needsUpdate = true;
    const pm = BRACKET.pulse.min;
    b.line.material.opacity = b.k * b.alpha * (b.pulse ? pm + (1 - pm) * Math.sin(st.T * BRACKET.pulse.speed) : 1);
  }
  const selB = S.makeBracket(SCENE_COLOR.bracketSelect, BRACKET.alpha.select), hovB = S.makeBracket(SCENE_COLOR.bracketHover, BRACKET.alpha.hover);
  const issueB = Array.from({ length: BRACKET.maxIssues }, () => S.makeBracket(SCENE_COLOR.bracketIssue, BRACKET.alpha.issue));

  // ---------- callout ----------
  function renderCallout(): void {
    const c = st.selected; if (!c || (!st.curItem(c) && !st.selNote)) { callout.render(null); return; }
    const cc: Partial<BuildItem> = st.curItem(c) || {};
    const o: CalloutNote = st.selNote || {};
    callout.render({
      cat: c,
      price: o.price || cc.price || '',
      title: o.title || cc.label || '',
      sub: o.sub || cc.sub || '',
      tone: o.tone === 'error' || st.issues.includes(c) ? 'error' : o.tone === 'warn' ? 'warn' : null,
    });
  }
  function placeCallout(): void {
    if (!st.selected || selB.k < BRACKET.calloutFrom || selB.box.isEmpty()) return;
    const W = wrap.clientWidth, H = wrap.clientHeight; let maxX = -Infinity, minX = Infinity, minY = Infinity;
    const mn = selB.box.min, mx = selB.box.max;
    for (const x of [mn.x, mx.x]) for (const y of [mn.y, mx.y]) for (const z of [mn.z, mx.z]) {
      tmpV.set(x, y, z).project(camera); const sx = (tmpV.x * 0.5 + 0.5) * W, sy = (-tmpV.y * 0.5 + 0.5) * H;
      maxX = Math.max(maxX, sx); minX = Math.min(minX, sx); minY = Math.min(minY, sy);
    }
    callout.place(minX, maxX, minY);
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(ev: PointerEvent): PickTarget | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const partOf = (h: THREE.Intersection): Part | undefined => st.parts[h.object.userData.part as PartId];
    const ok = (h: THREE.Intersection): boolean => { const pp = partOf(h); return !!pp && pp.fade > INPUT.pickableFade; };
    const matOf = (h: THREE.Intersection): THREE.Material => (h.object as THREE.Mesh).material as THREE.Material;
    const all = ray.intersectObjects(root.children, true);
    const hits = all.filter((h) => { if (!ok(h)) return false; const m = matOf(h); return !matData(m).isGlass && !(m.transparent && matData(m).t0); });
    if (hits.length) return CAT[hits[0].object.userData.part as PartId];
    const g = all.find(ok);
    return g ? CAT[g.object.userData.part as PartId] : null;
  }

  // ---------- selection ----------
  function select(cat: PickTarget | null | undefined, note: CalloutNote | null | undefined): void {
    st.selected = cat || null; st.selNote = note || null;
    selB.cat = st.selected; selB.k = st.selected ? Math.min(selB.k, BRACKET.reselectFrom) : selB.k; selB.kT = st.selected ? 1 : 0;
    hovB.kT = 0;
    renderCallout();
    if (st.mode === 'studio') void cam.focus(st.selected);
  }
  /** Drop the selection without a camera move (a `view` preset flies the camera itself). */
  function dropSelection(): void { st.selected = null; selB.kT = 0; renderCallout(); }
  function setIssues(list: PickTarget[] | null | undefined): void {
    st.issues = list || [];
    issueB.forEach((b, i) => { b.cat = st.issues[i] || null; b.kT = st.issues[i] ? 1 : 0; b.pulse = true; });
    renderCallout();
  }

  // ---------- pointer + keyboard ----------
  let down: { x: number; y: number } | null = null;
  // An iframe only receives keys after it was clicked; mimic that focus scoping for Escape.
  let hasFocus = false;
  st.listen(document, 'pointerdown', (e) => { hasFocus = wrap.contains(e.target as Node); }, { capture: true });
  st.listen(canvas, 'pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  st.listen(canvas, 'pointerup', (e) => {
    if (!down || st.mode === 'hero') return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null; if (moved > INPUT.clickTolerance) return;
    const c = pick(e);
    if (st.mode === 'studio') { select(c === st.selected ? null : c, null); st.emit('pick', { part: c || null }); }
  });
  let lastMove = 0;
  st.listen(canvas, 'pointermove', (e) => {
    if (st.mode !== 'studio' || e.buttons) { tip.hide(); return; }
    const now = performance.now(); if (now - lastMove < INPUT.hoverThrottle) return; lastMove = now;
    const c = pick(e); st.hovered = c && c !== st.selected ? c : null;
    hovB.cat = st.hovered; hovB.kT = st.hovered ? 1 : 0;
    canvas.style.cursor = c ? 'pointer' : 'grab';
    const item = st.hovered ? st.curItem(st.hovered) : undefined;
    if (st.hovered && item) {
      const r = wrap.getBoundingClientRect();
      tip.show(LABEL[st.hovered] + ' · ' + item.label, e.clientX - r.left, e.clientY - r.top);
    } else tip.hide();
  });
  st.listen(canvas, 'pointerleave', () => { hovB.kT = 0; tip.hide(); });
  st.listen(window, 'keydown', (e) => { if (hasFocus && e.key === 'Escape' && st.selected) { select(null, null); st.emit('pick', { part: null }); } });

  return {
    renderCallout, placeCallout, select, dropSelection, setIssues,
    /** Bounds around the selected category (padded), updated each frame. */
    selection: selB.box,
    updateBrackets(dt: number): void { updateBracket(selB, dt); updateBracket(hovB, dt); issueB.forEach((b) => updateBracket(b, dt)); },
    dispose(): void { callout.remove(); tip.remove(); },
  };
}
