// Per-frame update: part springs/fades/dimming, cable highlight, fans, mood colour, atmosphere, idle orbit,
// interior light, hero camera, view offset and callout placement.
import * as THREE from 'three';
import { V3 } from './materials';
import { CAT } from './model';
import { SCENE_COLOR } from './palette';
import { innerIdle } from './build';
import type { CameraRig } from './camera';
import type { Interaction } from './interaction';
import type { SceneState, Vec3 } from './state';

// ---------- tuning (prototype values) ----------
/** Explode spring: stiffness and damping ratio (slightly under-damped). */
const SPRING_K = 140, SPRING_C = 2 * Math.sqrt(SPRING_K) * 0.82;
/** Exponential approach rates (1/s) for per-frame smoothing. */
const RATE = { fade: 7, glow: 4, dim: 6, mood: 1.6, tint: 2, inner: 3, autoRotate: 1 };
/** Parts hidden by `stage` fly to this explode; cables fade out once explode passes `cablesHideAbove`. */
const STAGE_HIDDEN_EXPLODE = 1.6, CABLES_HIDE_ABOVE = 0.3;
/** Fade levels: x-ray glass/fans, and the threshold below which a part is not drawn. */
const XRAY_FADE = 0.06, VISIBLE_ABOVE = 0.015;
/** Highlighted cable run: pulsing emissive (base ± amp at `speed` rad/s); other runs dim to `others`. */
const CABLE_HL = { base: 0.35, amp: 0.2, speed: 4, others: 0.4 };
/** Fan speed while glows are off, as a fraction of full speed. */
const ROTOR_IDLE = 0.25;
/** Mood colour mixes: dust toward white, light cone toward mood, rim light toward white. */
const MIX = { dustWhite: 0.62, coneMood: 0.18, rimWhite: 0.3 };
/** Dust point-size scale per pixel of focal length. */
const DUST_SCALE = 0.0016;
/** Studio idle auto-rotate: seconds without interaction, and speed. */
const IDLE = { after: 9, speed: 0.35 };
/** Interior light offset from the selected part's centre. */
const INNER_SEL_OFFSET: Vec3 = [0.06, 0.02, 0];

export function createFrame(st: SceneState, cam: CameraRig, ix: Interaction): (dt: number) => void {
  const { S, canvas, brand } = st;
  const { scene, camera, controls, spot, inner, rimLight, rimMat, moodC, moodT, backdrop, backdropU, gridU, dustU, coneU, cone } = S;
  const WARM = new THREE.Color(SCENE_COLOR.issueWarm), WHITE = new THREE.Color(SCENE_COLOR.white);
  const INNER_COOL = new THREE.Color(SCENE_COLOR.innerCool), INNER_WARM = new THREE.Color(SCENE_COLOR.innerWarm);
  const CONE_BASE = new THREE.Color(SCENE_COLOR.cone);
  const DOWN = new V3(0, -1, 0), INNER_OFF = new V3(...INNER_SEL_OFFSET), wantIdle = new V3(), tmpV = new V3(), tmpS = new V3(), tmpB = new V3();
  const approach = (dt: number, rate: number): number => Math.min(1, dt * rate);
  let vw = 0, vh = 0, vs: number | null = null;

  return function frame(dt: number): void {
    st.T += dt;
    st.tweens.step(dt);
    const T = st.T, selected = st.selected, sel = ix.selection;
    for (const p of st.partList()) {
      const hid = !!st.stageShow && !st.stageShow.has(p.id);
      const eTg = hid ? STAGE_HIDDEN_EXPLODE : p.eT;
      const fT = hid ? 0 : (st.xray && (p.id === 'glass' || p.id === 'fans')) ? XRAY_FADE : (p.id === 'cables' && st.explodeG > CABLES_HIDE_ABOVE) ? 0 : p.fadeT;
      const a = SPRING_K * (eTg - p.e) - SPRING_C * p.v; p.v += a * dt; p.e += p.v * dt;
      p.fade += (fT - p.fade) * approach(dt, RATE.fade);
      p.group.visible = p.fade > VISIBLE_ABOVE;
      p.glowK += (p.glowT - p.glowK) * approach(dt, RATE.glow);
      const dimT = selected && CAT[p.id] !== selected && st.mode !== 'solo' ? 1 : 0; p.dim += (dimT - p.dim) * approach(dt, RATE.dim);
      p.group.position.copy(p.base).addScaledVector(p.offset, p.e);
      p.apply();
      if (p.cableMats) for (const id in p.cableMats) { const m = p.cableMats[id], on = st.hlCable === id; m.emissive.setHex(brand.accent); m.emissiveIntensity = on ? CABLE_HL.base + CABLE_HL.amp * Math.sin(T * CABLE_HL.speed) : 0; if (st.hlCable && !on) m.color.multiplyScalar(CABLE_HL.others); }
      for (const r of p.rotors) r.rotor.rotation.z -= r.speed * dt * (ROTOR_IDLE + (1 - ROTOR_IDLE) * p.glowK);
    }
    {
      const warm = st.issues.length && st.mode !== 'hero'; moodC.lerp(moodT, approach(dt, RATE.mood)); const tint = warm ? WARM : moodC;
      backdropU.uTint.value.lerp(tint, approach(dt, RATE.tint)); backdropU.uTime.value = T; backdrop.position.copy(scene.worldToLocal(tmpB.copy(camera.position)));
      gridU.uTime.value = T; gridU.uColor.value.lerp(tint, approach(dt, RATE.tint));
      dustU.uTime.value = T; dustU.uColor.value.copy(moodC).lerp(WHITE, MIX.dustWhite);
      coneU.uTime.value = T; coneU.uColor.value.copy(CONE_BASE).lerp(moodC, MIX.coneMood);
      rimLight.color.copy(moodC).lerp(WHITE, MIX.rimWhite);
      const dir = tmpS.copy(spot.target.position).sub(spot.position).normalize();
      cone.position.copy(spot.position); cone.quaternion.setFromUnitVectors(DOWN, dir);
      dustU.uSpot.value.copy(spot.position).applyMatrix4(scene.matrixWorld); dustU.uDir.value.copy(dir).transformDirection(scene.matrixWorld);
      dustU.uScale.value = canvas.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * DUST_SCALE;
      if (st.mode === 'studio') { const idle = !st.reducedMotion && !selected && T - st.lastInteract > IDLE.after; controls.autoRotate = idle; controls.autoRotateSpeed += ((idle ? IDLE.speed : 0) - controls.autoRotateSpeed) * approach(dt, RATE.autoRotate); }
    }
    ix.updateBrackets(dt);
    // contextual interior light: follows focus, warms on issues
    if (st.L) {
      const want = selected ? scene.worldToLocal(sel.getCenter(tmpV)) : innerIdle(st.L, wantIdle);
      if (selected && !sel.isEmpty()) inner.position.lerp(want.add(INNER_OFF), approach(dt, RATE.inner));
      else if (st.mode !== 'solo') inner.position.lerp(want, approach(dt, RATE.inner));
      const warm = st.issues.length ? 1 : 0;
      inner.color.lerp(warm ? INNER_WARM : INNER_COOL, approach(dt, RATE.inner));
      rimMat.emissive.lerp(warm ? WARM : moodC, approach(dt, RATE.inner));
    }
    cam.updateHero(dt, selected ? sel : null);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w !== vw || h !== vh || st.shiftX !== vs) { vw = w; vh = h; vs = st.shiftX; if (st.shiftX) camera.setViewOffset(w, h, -w * st.shiftX, 0, w, h); else camera.clearViewOffset(); }
    if (st.mode === 'hero') camera.lookAt(controls.target);
    ix.placeCallout();
  };
}
