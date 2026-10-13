// Shader warm-up. The first use of a program blocks the main thread until the driver has compiled and linked it (and
// until everything queued before it has run), and without KHR_parallel_shader_compile — ANGLE on SwiftShader, for
// one — there is no way to wait for that asynchronously. So programs are prepared one material at a time on separate
// ticks, outside rendering: one multi-second stall in the first frame becomes short tasks the page can interleave.
import * as THREE from 'three';
import type { createPost } from './post';

/** Time budget per tick for preparing programs and textures (ms); at least one item is prepared per tick. */
const LINK_BUDGET_MS = 8;

/** The bit of three's per-material renderer state we touch: the program the material resolved to. */
type ProgramRef = { currentProgram?: { getUniforms(): unknown } };

/** One unit of warm-up: compile what `obj` needs for `target` (three's program keys depend on the destination) with
 *  `lights` as the lighting scene, optionally with its materials switched to their transparent variant. */
interface Task { obj: THREE.Object3D; target: THREE.WebGLRenderTarget | null; lights: THREE.Scene; transparent: boolean }

export function createWarmup(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, post: ReturnType<typeof createPost>) {
  const tasks: Task[] = [];
  /** Textures to upload (and mipmap) ahead of the first frame, one per tick like the programs. */
  const textures: THREE.Texture[] = [];
  const seenTex = new WeakSet<THREE.Texture>();
  let primeOutput = false;
  const quad = new THREE.BufferGeometry(), bare = new THREE.Scene();

  /** One task per distinct material under `root`, so each tick submits and links a single program. */
  function enqueue(root: THREE.Object3D, target: THREE.WebGLRenderTarget | null, lights: THREE.Scene, fadeVariants: boolean): void {
    const seen = new Set<THREE.Material>();
    root.traverse((o) => {
      const m = (o as Partial<THREE.Mesh>).material;
      if (!m || Array.isArray(m) || seen.has(m)) return;
      seen.add(m);
      for (const v of Object.values(m) as unknown[]) if (v instanceof THREE.Texture && !seenTex.has(v)) { seenTex.add(v); textures.push(v); }
      tasks.push({ obj: o, target, lights, transparent: false });
      if (fadeVariants && !m.transparent) tasks.push({ obj: o, target, lights, transparent: true });
    });
  }

  function run(t: Task): void {
    const mat = (t.obj as THREE.Mesh).material as THREE.Material;
    const prevTarget = renderer.getRenderTarget(), wasT = mat.transparent;
    if (t.transparent) { mat.transparent = true; mat.needsUpdate = true; }
    renderer.setRenderTarget(t.target);
    try {
      // compile() with a single object still gathers lights from `lights`; it returns the materials it prepared.
      for (const m of renderer.compile(t.obj, camera, t.lights)) {
        // Internal three.js state (typed as unknown): forcing getUniforms() performs the program's first use now.
        (renderer.properties.get(m) as ProgramRef).currentProgram?.getUniforms();
      }
    } finally {
      renderer.setRenderTarget(prevTarget);
      if (t.transparent) { mat.transparent = wasT; mat.needsUpdate = true; }
    }
  }

  return {
    /** Programs still to prepare (rendering should wait until this is false). */
    get pending(): boolean { return tasks.length > 0 || textures.length > 0 || primeOutput; },
    /** Queue the programs `obj` needs as the RenderPass draws it (into the composer target), and with `fadeVariants`
     *  also the transparent variant Part.apply switches to while a part fades. */
    add(obj: THREE.Object3D, fadeVariants: boolean): void { enqueue(obj, post.sceneTarget, scene, fadeVariants); },
    /** Queue the post-processing programs for both destinations a pass can have (intermediate target or screen). */
    addPost(): void {
      // Passes draw a lone full-screen triangle (position + uv, no lights or environment), like three's FullScreenQuad,
      // so warm that exact shape against an empty scene for the program keys to match.
      if (!quad.getAttribute('position')) {
        quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
        quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
      }
      const group = new THREE.Group();
      for (const m of post.materials()) group.add(new THREE.Mesh(quad, m));
      enqueue(group, post.sceneTarget, bare, false);
      enqueue(group, null, bare, false);
      primeOutput = true;
    },
    /** Prepare queued programs for up to LINK_BUDGET_MS (at least one per call). */
    step(): void {
      const end = performance.now() + LINK_BUDGET_MS;
      do {
        const t = tasks.shift();
        if (t) { run(t); continue; }
        const tex = textures.shift();
        if (tex) { renderer.initTexture(tex); continue; }
        if (primeOutput) { primeOutput = false; post.primeOutput(); }
        return;
      } while (performance.now() < end);
    },
    dispose(): void { tasks.length = 0; textures.length = 0; quad.dispose(); },
  };
}
