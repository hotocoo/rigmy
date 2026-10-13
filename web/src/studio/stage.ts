// Scene dressing: renderer/camera/controls (ex <three-d-stage>), environment, backdrop dome, showroom floor,
// plinth, grid sweep, lights, scan box and selection brackets. Dust + light cone: atmosphere.ts; post-processing: post.ts.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { NOISE_GL, createCone, createDust, type U } from './atmosphere';
import { bakeEnvironment } from './environment';
import { createGpuFence } from './gpu';
import { createPost } from './post';
import { createWarmup } from './warmup';
import type { Quality } from './quality';
import { cnv, disposeTree, V3, type Kit } from './materials';
import { CONTACT_SHADOW_STOPS, FLOOR_ALPHA_STOPS, SCENE_COLOR } from './palette';
import type { StudioMode } from './types';

// ---------- tuning ----------
/** Full ("lit") light intensities; the reveal fades each light up from 0 to these. */
export const LIGHT = { key: 0.8, spot: 24, rim: 2.6, rim2: 1.1, fill: 0.3, env: 1.0, inner: 0.3, top: 3, front: 1.1 };
/** three.js shader error checks (synchronous info-log reads); development only. */
const CHECK_SHADER_ERRORS = process.env.NODE_ENV !== 'production';
/** Height of the plinth top: the build's root sits here and floor-level effects are offset from it. */
export const FLOOR_Y = 0.018;
/** Renderer: device-pixel-ratio cap and ACES exposure. */
const RENDER = { maxPixelRatio: 1.5, exposure: 1.08 } as const;
/** Perspective camera and OrbitControls defaults (pc-studio overrides limits per mode). */
const CAMERA = { fov: 45, near: 0.01, far: 500, start: [3, 2.2, 4] as const, damping: 0.08, autoRotateSpeed: 1.2 };
/** Ambient hemisphere fill once the PMREM environment carries the lighting. */
const HEMI_INTENSITY = 0.08;
/** Backdrop dome (follows the camera). */
const BACKDROP = { radius: 14, segments: [64, 32] as const, renderOrder: -10 };
/** Showroom floor, plinth (unit radius, scaled by sizePlinth), emissive rim, outer halo ring and contact shadow. */
const FLOOR = {
  radius: 3.2, segments: 96, gradientPx: 256,
  material: { metalness: 0.15, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 0.45 },
};
const PLINTH = {
  segments: 128,
  material: { metalness: 0.5, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.28, envMapIntensity: 0.35 },
  rim: { tube: 0.0013, radialSegments: 8, tubularSegments: 200, y: 0.0182 },
  halo: { inner: 1.32, outer: 1.322, segments: 200, y: 0.0006 },
  contact: { y: 0.0187, renderOrder: 2, scale: 1.25 },
};
/** Floor grid ring: geometry span, height, and its inner radius relative to the plinth. */
const GRID = { inner: 0.05, outer: 2.6, segments: 160, y: 0.0009, renderOrder: 1, startR: 0.3, plinthGap: 1.035, idlePulse: -99 };
/** Key / fill / spot / rims / interior / area light placement and shapes (intensities in LIGHT, colours in palette). */
const LIGHTS = {
  key: [1.8, 2.2, 2.8] as const,
  fill: [-2.6, 1.0, 1.8] as const,
  spot: {
    pos: [0.85, 2.2, 1.35] as const, distance: 6, angle: 0.4, penumbra: 0.7, decay: 1.3,
    shadow: { mapSize: 2048, bias: -0.00008, normalBias: 0.0012, near: 0.8, far: 4.5, radius: 4 },
  },
  rim: [-2.4, 1.8, -2.4] as const,
  rim2: [2.6, 0.9, -2.3] as const,
  inner: { distance: 0.8, decay: 1.6 },
  area: { width: 0.16, height: 0.3 },
};
const SCAN_RENDER_ORDER = 997, BRACKET_RENDER_ORDER = 999;
/** Each corner bracket is 8 corners × 3 arms; each arm a 2-vertex segment of 3 floats. */
const BRACKET_FLOATS = 8 * 3 * 2 * 3;


export interface Bracket {
  line: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  k: number; kT: number;
  cat: string | null;
  alpha: number;
  box: THREE.Box3;
  pulse: boolean;
}

export interface StageOptions {
  mode: StudioMode;
  /** Backdrop base colour (0xRRGGBB). */
  bg: number;
  transparent: boolean;
  reducedMotion: boolean;
  /** Initial CSS size and pixel-ratio cap, applied before any GPU work is queued (a later canvas resize would block
   *  the main thread until that work finishes). */
  size: { w: number; h: number };
  pixelRatioCap: number;
  /** PMREM face size for the environment bake (smaller is much cheaper on software GL). */
  envMapSize: number;
}

/** Everything the <three-d-stage> element provided, plus pc-studio's dressing. Throws if WebGL cannot start; anything
 *  created before the failure is released first. */
export function createStage(host: HTMLElement, kit: Kit, opts: StageOptions) {
  // preserveDrawingBuffer keeps the last frame readable (screenshots / toDataURL).
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    return dressStage(renderer, host, kit, opts);
  } catch (err) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    throw err;
  }
}

function dressStage(renderer: THREE.WebGLRenderer, host: HTMLElement, kit: Kit, opts: StageOptions) {
  const MODE = opts.mode, { tex } = kit, accent = kit.brand.accent;
  // ----- <three-d-stage> boot -----
  // In production, skip three's per-program error checks: they read shader info logs synchronously, which stalls
  // the main thread until every compile finishes (seconds on software GL). Development keeps them for diagnostics.
  renderer.debug.checkShaderErrors = CHECK_SHADER_ERRORS;
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.outline = 'none';
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  camera.position.set(...CAMERA.start);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = CAMERA.damping;
  controls.autoRotate = false;
  controls.autoRotateSpeed = CAMERA.autoRotateSpeed;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  const hemi = new THREE.HemisphereLight(SCENE_COLOR.hemiSky, SCENE_COLOR.hemiGround, HEMI_INTENSITY);
  scene.add(hemi);
  // Key and fill start dark; the reveal fades them up to LIGHT.*.
  const key = new THREE.DirectionalLight(SCENE_COLOR.key, 0);
  scene.add(key);
  const fill = new THREE.DirectionalLight(SCENE_COLOR.fill, 0);
  scene.add(fill);
  // (the stage's ShadowMaterial ground plane is hidden by pc-studio, so it is omitted here)

  const root = new THREE.Group(); root.name = 'rigmy_build'; root.position.y = FLOOR_Y;
  scene.add(root);

  // ----- pc-studio renderer tuning -----
  /** Full-quality pixel ratio for this device (adaptive quality only ever lowers it). */
  const basePixelRatio = Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio);
  renderer.setPixelRatio(Math.min(basePixelRatio, opts.pixelRatioCap));
  renderer.setSize(opts.size.w, opts.size.h);
  // pc-studio asked for PCFSoftShadowMap; three r184 deprecates it and falls back to PCFShadowMap at
  // first render (with a console warning). Set the effective type directly: identical output, no warning.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = RENDER.exposure;
  if (opts.transparent) renderer.setClearColor(SCENE_COLOR.clear, 0);

  // ----- environment (procedural softboxes → PMREM) -----
  scene.background = null;
  const envTex = bakeEnvironment(renderer, accent, opts.envMapSize);
  scene.environment = envTex;

  const moodC = new THREE.Color(accent), moodT = new THREE.Color(accent);

  // ----- backdrop dome -----
  const backdropMat = new THREE.ShaderMaterial({
    name: 'backdrop', side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uBg: { value: new THREE.Color(opts.bg) }, uTint: { value: moodC.clone() }, uK: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uBg; uniform vec3 uTint; uniform float uK; uniform float uTime; varying vec3 vDir; ' + NOISE_GL + ' void main(){ vec3 d = normalize(vDir); float hz = exp(-abs(d.y - 0.03) * 7.0); float up = smoothstep(-0.1, 0.95, d.y); float n = fbm(d * 2.2 + vec3(uTime * 0.011, uTime * 0.004, -uTime * 0.007)); float w = smoothstep(0.48, 0.9, n) * (0.3 + 0.7 * smoothstep(-0.15, 0.6, d.y)); float streak = exp(-abs(d.y - 0.42 - 0.05 * sin(d.x * 3.0 + uTime * 0.05)) * 26.0) * smoothstep(0.55, 0.75, fbm(d * 5.0 + uTime * 0.02)); vec3 c = uBg + uTint * (hz * 0.016 + w * 0.011 + streak * 0.006) * uK + vec3(0.55, 0.65, 0.85) * up * 0.0035 * uK; gl_FragColor = vec4(c, 1.0); }',
  });
  const backdropU = backdropMat.uniforms as { uBg: U<THREE.Color>; uTint: U<THREE.Color>; uK: U<number>; uTime: U<number> };
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(BACKDROP.radius, ...BACKDROP.segments), backdropMat);
  backdrop.renderOrder = BACKDROP.renderOrder; backdrop.frustumCulled = false; backdrop.visible = !opts.transparent; scene.add(backdrop);

  // ----- floor, plinth, rim, halo, contact shadow -----
  const gpx = FLOOR.gradientPx, gmid = gpx / 2;
  const radial = (stops: [number, string][]) => new THREE.CanvasTexture(cnv(gpx, gpx, (g) => { const gr = g.createRadialGradient(gmid, gmid, 0, gmid, gmid, gmid); stops.forEach((s) => gr.addColorStop(s[0], s[1])); g.fillStyle = gr; g.fillRect(0, 0, gpx, gpx); }));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(FLOOR.radius, FLOOR.segments), new THREE.MeshPhysicalMaterial({ name: 'showroom_floor', color: SCENE_COLOR.floor, ...FLOOR.material, transparent: true, alphaMap: radial(FLOOR_ALPHA_STOPS) }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const plinthMat = new THREE.MeshPhysicalMaterial({ name: 'plinth', color: SCENE_COLOR.plinth, ...PLINTH.material, roughnessMap: tex.get('noise') });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, FLOOR_Y, PLINTH.segments), plinthMat); plinth.position.y = FLOOR_Y / 2; plinth.receiveShadow = true; scene.add(plinth);
  const rimMat = new THREE.MeshStandardMaterial({ name: 'plinth_rim', color: SCENE_COLOR.plinthRimBase, emissive: accent, emissiveIntensity: 0 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, PLINTH.rim.tube, PLINTH.rim.radialSegments, PLINTH.rim.tubularSegments), rimMat); rim.rotation.x = Math.PI / 2; rim.position.y = PLINTH.rim.y; scene.add(rim);
  const haloMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0 });
  const halo = new THREE.Mesh(new THREE.RingGeometry(PLINTH.halo.inner, PLINTH.halo.outer, PLINTH.halo.segments), haloMat); halo.rotation.x = -Math.PI / 2; halo.position.y = PLINTH.halo.y; scene.add(halo);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radial(CONTACT_SHADOW_STOPS), transparent: true, depthWrite: false, toneMapped: false }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = PLINTH.contact.y; contact.renderOrder = PLINTH.contact.renderOrder; scene.add(contact);

  // ----- floor grid: rings + spokes, sweep, ripple pulses -----
  const gridMat = new THREE.ShaderMaterial({
    name: 'floor_grid', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uK: { value: 0 }, uColor: { value: moodC.clone() }, uTime: { value: 0 }, uPulse: { value: GRID.idlePulse }, uR0: { value: GRID.startR } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uK, uTime, uPulse, uR0; uniform vec3 uColor; varying vec2 vP; void main(){ float r = length(vP); float ang = atan(vP.y, vP.x); float s = 0.075; float dr = abs(fract(r / s + 0.5) - 0.5) * s; float w = fwidth(r) * 1.1; float rl = 1.0 - smoothstep(0.0, w, dr); float na = 72.0; float da = abs(fract(ang / 6.2831853 * na + 0.5) - 0.5) / na * 6.2831853 * r; float tl = (1.0 - smoothstep(0.0, w * 1.2, da)) * step(0.5, fract(r / (s * 2.0))); float f = smoothstep(uR0, uR0 + 0.05, r) * (1.0 - smoothstep(0.5, 2.3, r)); float sa = mod(ang + uTime * 0.32, 6.2831853); float sweep = exp(-sa * 1.8); float ag = uTime - uPulse; float pr = uR0 + ag * 1.15; float pulse = ag > 0.0 ? exp(-abs(r - pr) * 34.0) * exp(-ag * 1.4) : 0.0; float a = (rl * 0.55 + tl * 0.3) * f * (0.18 + sweep * 0.9) + pulse * f * 1.6; a *= uK * 0.2; gl_FragColor = vec4(uColor * a, a); }',
  });
  const gridU = gridMat.uniforms as { uK: U<number>; uColor: U<THREE.Color>; uTime: U<number>; uPulse: U<number>; uR0: U<number> };
  const grid = new THREE.Mesh(new THREE.RingGeometry(GRID.inner, GRID.outer, GRID.segments, 1), gridMat); grid.rotation.x = -Math.PI / 2; grid.position.y = GRID.y; grid.renderOrder = GRID.renderOrder; scene.add(grid);
  function sizePlinth(r: number): void { gridU.uR0.value = r * GRID.plinthGap; plinth.scale.set(r, 1, r); rim.scale.set(r, r, 1); halo.scale.set(r, r, 1); contact.scale.set(r * PLINTH.contact.scale, r * PLINTH.contact.scale, 1); }

  // ----- lights -----
  key.castShadow = false; key.position.set(...LIGHTS.key);
  fill.position.set(...LIGHTS.fill);
  const sp = LIGHTS.spot;
  const spot = new THREE.SpotLight(SCENE_COLOR.spot, 0, sp.distance, sp.angle, sp.penumbra, sp.decay); spot.position.set(...sp.pos);
  spot.castShadow = true; spot.shadow.mapSize.set(sp.shadow.mapSize, sp.shadow.mapSize); spot.shadow.bias = sp.shadow.bias; spot.shadow.normalBias = sp.shadow.normalBias; spot.shadow.camera.near = sp.shadow.near; spot.shadow.camera.far = sp.shadow.far; spot.shadow.radius = sp.shadow.radius;
  scene.add(spot); scene.add(spot.target);
  const rimLight = new THREE.DirectionalLight(SCENE_COLOR.rim, 0); rimLight.position.set(...LIGHTS.rim); scene.add(rimLight);
  const rim2 = new THREE.DirectionalLight(SCENE_COLOR.rim2, 0); rim2.position.set(...LIGHTS.rim2); scene.add(rim2);
  const inner = new THREE.PointLight(SCENE_COLOR.innerCool, 0, LIGHTS.inner.distance, LIGHTS.inner.decay); scene.add(inner);
  RectAreaLightUniformsLib.init();
  const areaTop = new THREE.RectAreaLight(SCENE_COLOR.areaTop, 0, LIGHTS.area.width, LIGHTS.area.height), areaFront = new THREE.RectAreaLight(accent, 0, LIGHTS.area.width, LIGHTS.area.height);
  scene.add(areaTop, areaFront);
  scene.environmentIntensity = 0;

  // ----- atmosphere -----
  const { dustU, DUSTK, setFraction: setDustFraction } = createDust(scene, MODE, opts.reducedMotion);
  const { coneU, cone } = createCone(scene, sp.angle);

  // ----- scan box (part-arrival sweep; unit square, scaled to the part) -----
  const scanMat = new THREE.LineBasicMaterial({ color: SCENE_COLOR.scanLine, transparent: true, opacity: 0, depthTest: false });
  const scanLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new V3(-0.5, 0, -0.5), new V3(0.5, 0, -0.5), new V3(0.5, 0, 0.5), new V3(-0.5, 0, 0.5)]), scanMat);
  const scanFillMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const scanFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), scanFillMat); scanFill.rotation.x = -Math.PI / 2;
  const scanner = new THREE.Group(); scanner.add(scanLine, scanFill); scanner.visible = false; scanner.renderOrder = SCAN_RENDER_ORDER; scene.add(scanner);

  // ----- corner brackets -----
  function makeBracket(color: number, alpha: number): Bracket {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BRACKET_FLOATS), 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false }));
    l.renderOrder = BRACKET_RENDER_ORDER; l.frustumCulled = false; scene.add(l);
    return { line: l, k: 0, kT: 0, cat: null, alpha, box: new THREE.Box3(), pulse: false };
  }

  const post = createPost(renderer, scene, camera);
  let size = { ...opts.size };
  const applySize = (): void => { camera.aspect = size.w / size.h; camera.updateProjectionMatrix(); post.setSize(size.w, size.h); };
  applySize();
  /** Resize to the container. A no-op when unchanged: assigning the canvas size reallocates the drawing buffer. */
  function resize(w: number, h: number): void {
    if (w === size.w && h === size.h) return;
    size = { w, h };
    renderer.setSize(w, h);
    applySize();
  }
  const render = (dt: number): void => { post.render(dt); markGpu(); };
  const warmup = createWarmup(renderer, scene, camera, post);
  // ----- GPU pacing (gpu.ts) -----
  const fence = createGpuFence(renderer.getContext() as WebGL2RenderingContext);
  const gpuBusy = fence.busy, markGpu = fence.mark;
  markGpu(); // the environment bake above

  /** Apply an adaptive-quality level (see quality.ts). Cheap: no shader recompiles, the shadow map is reallocated
   *  lazily on the next render. */
  function setQuality(q: Quality): void {
    const pr = Math.min(basePixelRatio, q.pixelRatio);
    if (renderer.getPixelRatio() !== pr) { renderer.setPixelRatio(pr); applySize(); }
    post.setEffects(q.effects);
    post.setMsaa(q.msaa);
    const shadow = Math.round(LIGHTS.spot.shadow.mapSize * q.shadowScale);
    if (spot.shadow.mapSize.x !== shadow) {
      spot.shadow.mapSize.set(shadow, shadow);
      spot.shadow.map?.dispose(); spot.shadow.map = null;
    }
    spot.castShadow = q.shadows;
    setDustFraction(q.dust);
  }

  /** Release everything. With `contextLost` the GPU deletes are no-ops, no loss is forced, and the canvas is left in
   *  place so it can still receive `webglcontextrestored`; the caller removes it then. */
  function dispose(contextLost = false): void {
    fence.dispose();
    warmup.dispose();
    post.dispose();
    controls.dispose();
    spot.shadow.dispose();
    for (const l of [spot, key, fill, rimLight, rim2, inner, hemi, areaTop, areaFront]) l.dispose();
    disposeTree(scene);
    envTex.dispose();
    scene.environment = null;
    renderer.setAnimationLoop(null);
    renderer.dispose();
    if (contextLost) return;
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  return {
    renderer, scene, camera, controls, root, key, fill, hemi, spot, rimLight, rim2, inner, areaTop, areaFront,
    moodC, moodT, backdrop, backdropU, rimMat, halo, haloMat, contact, gridU, dustU, DUSTK, coneU, cone,
    scanner, scanMat, scanFillMat, makeBracket, sizePlinth, resize, render, gpuBusy, markGpu, setQuality, warmup, dispose,
  };
}
export type Stage = ReturnType<typeof dressStage>;
