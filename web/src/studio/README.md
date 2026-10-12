# RigMY 3D build studio

TypeScript port of the prototype's `project/pc-studio.html` and the `<three-d-stage>` element it was built on. It covers the procedural PC model, the showroom stage, post-processing and the `{ rig: … }` message protocol. The iframe and `postMessage` are gone. The host now talks to the engine through a typed `send()` and listens for events.

| File | Contents |
| --- | --- |
| `types.ts` | Public types: `StudioMode`, `StudioMsg`, `StudioEvents`, `StudioHandle`, `PartVis`… (no runtime code) |
| `engine.ts` | Public entry: `createStudio(container, opts)`. Owns the container, events, WebGL detection, the fallback, and the journal of host state replayed after context loss |
| `scene.ts` | One live scene: creates the stage and wires the modules below, dispatches `StudioMsg`, runs the loop, handles `webglcontextlost` / `restored`, releases everything |
| `state.ts` | Shared scene state plus lifecycle plumbing (cancellable timers, tweens, DOM listeners, the async build chain, part lookups) |
| `camera.ts` | Flights, per-part focus poses, `view` presets, studio intro, hero camera rig |
| `interaction.ts` | Picking, hover tooltip, click / Escape, selection, issues, corner brackets, callout |
| `build.ts` | First build + reveal timeline, whole-rig rebuilds, single-part swaps, cable re-runs, explode, scan pulses |
| `solo.ts` | Solo product viewer (turntable framing) |
| `frame.ts` | Per-frame update: springs, fades, dimming, cable highlight, fans, mood colour, atmosphere, idle orbit, interior light |
| `stage.ts` | Renderer, camera, OrbitControls, environment, backdrop, floor/plinth/grid, lights, dust, scanner, brackets. Light intensities, geometry sizes, shadow and bloom settings are grouped at the top |

Every module keeps its tuning (camera poses, timelines, explode distances, spring, rates…) as named constants at the top; the values are the prototype's.
| `model.ts` | Per-part builders, part catalogue constants (`CAT`, `ORDER`, `LABEL`, `IDX`), demo build, `buildPart` / `makePart` |
| `geometry.ts` | Mesh helpers: rounded boxes, geometry merge, fans, pump LCD texture |
| `layout.ts` | Case/motherboard-derived layout and per-part placements |
| `cables.ts` | Cable runs (tidy / stock routing) |
| `materials.ts` | Tweens/easing, canvas textures, material factory, `Kit`, `Part` |
| `loop.ts` | Render scheduling: one render per animation frame, duty-cycle cap, pause offscreen / hidden / `pagehide` |
| `quality.ts` | Adaptive-quality levels and the governor that steps them down / up from measured frame load |
| `warmup.ts` | Shader + texture warm-up, one program per tick, before anything is drawn |
| `gpu.ts` | Fence-based GPU pacing (at most one batch in flight, never a blocking wait) |
| `environment.ts` | Procedural softbox environment baked to PMREM |
| `atmosphere.ts` | Dust motes and the volumetric light cone (plus the shared GLSL noise) |
| `post.ts` | Composer: NaN guard, bloom, output, chromatic/vignette/grain |
| `palette.ts` | **Every scene colour** (lights, environment, floor, brackets, material presets, canvas textures) and `resolveBrand()`, which reads the brand tokens the scene mirrors |
| `overlay.ts` | DOM over the canvas: callout, tooltip, WebGL probe and the "3D preview unavailable" fallback, styled only with globals.css tokens |
| `Studio.tsx` | `'use client'` React wrapper |

## Usage

```tsx
'use client';
import { useRef } from 'react';
import Studio, { type StudioRef } from '@/studio/Studio';

export function BuilderStage({ build, sel, explode }: Props) {
  const studio = useRef<StudioRef>(null);
  return (
    <Studio
      ref={studio}
      mode="studio"
      style={{ position: 'absolute', inset: 0 }}
      onReady={(api) => {
        // Push the full current state, like the prototype host's pushAll().
        api.send({ rig: 'cables', opts: { route: 'tidy', sleeve: 'black' } });
        api.send({ rig: 'build', build });
        if (explode) api.send({ rig: 'explode', v: explode, stagger: true });
        if (sel) api.send({ rig: 'select', part: sel });
      }}
      onPick={(part) => setSel((s) => (s === part ? null : part))}
      onUnavailable={() => setHas3d(false)} // optional: the studio renders its own fallback
      onRestored={() => setHas3d(true)}
    />
  );
}
// later, on state change:
studio.current?.send({ rig: 'select', part: 'gpu' });
```

- **Sizing.** The component renders a `div` with `position: relative; overflow: hidden`. Give it a size, for example `position:absolute; inset:0` inside a sized parent, which is how the prototype placed its iframes. The canvas, callout and tooltip fill it, and a `ResizeObserver` tracks its size.
- **Props.**
  - `mode` (required)
  - `className`, `style`
  - `onReady(api)`: also fires when WebGL is unavailable, so the state you push still feeds the fallback's part list
  - `onPick(part)`
  - `onUnavailable(reason)`: `'unsupported' | 'error' | 'context-lost'` (see [Without WebGL](#without-webgl)). Also called with `'error'` if the engine chunk fails to load
  - `onRestored()`: a lost context came back and the scene was rebuilt
  - `transparent`
  - `bg`: backdrop colour (hex). The default is the mode's background token, read from the computed style at creation: hero `--bg`, studio `--bg-raised`, solo `--surface` (today `07080b` / `0b0d12` / `0c0e13`, the prototype's `?bg=` values).
  - `reducedMotion`: defaults to `prefers-reduced-motion`. When on, it turns off idle auto-rotate (the studio idle orbit and the solo turntable) and the dust motes.
  - `ref`: an imperative `{ send(msg) }`.
- **Changing props.** If `mode`, `transparent`, `bg` or `reducedMotion` changes, the engine is torn down and rebuilt.
- **Message queue.** Messages sent through the ref before the engine is ready are queued. The queue is flushed just before `onReady` runs. It is only a safety net: send your authoritative state from `onReady`.
- **No demo build by default.** The prototype showed a demo rig if the host sent nothing within 1.4 s. The studio now shows only what the host sends, so the app never displays a build the user didn't choose. Standalone or dev pages can opt in with `createStudio(el, { mode, fallbackDelay: DEMO_BUILD_DELAY })` (exported from `engine.ts`); the demo carries no prices.
- **Tokens.** The callout, tooltip and fallback use the CSS variables from `app/globals.css` (through `lib/tokens`), plus the studio-scoped `--rs-*` properties described under *Overlay styling*, so the page must load globals.css, as every app page does. Scene colours are numbers (WebGL needs them) and all live in `palette.ts`. The ones that mirror brand tokens — the accent (`--blue`: glows, default mood, plinth rim, halo, scan fill, cable highlight), the per-mode background and the mono face on the pump LCD (`--mono`) — are read from the container's computed style when the studio is created, falling back to `BRAND_FALLBACK` if a variable is missing or unparseable. A token change therefore needs no studio edit; it applies to studios created after it.
- **Fonts.** The overlays use `--sans` / `--mono` (Archivo and JetBrains Mono, which `app/layout.tsx` already loads).
- **Server rendering.** The engine is safe to import during SSR because nothing touches `window` at module scope. `Studio` still loads it with a dynamic import inside `useEffect`, so three.js is only fetched on the client.

### Without React

```ts
const { createStudio } = await import('@/studio/engine');
const studio = createStudio(el, { mode: 'hero' });
const off = studio.on('ready', () => studio.send({ rig: 'build', build }));
studio.on('pick', ({ part }) => …);
studio.on('unavailable', ({ reason }) => …); // fallback is already on screen
studio.dispose(); // cancels rAF + timers, disposes geometries/materials/textures/render targets, loses the GL context, removes DOM + listeners
```

## Performance on weak GPUs

The studio must never monopolise the main thread, even on software GL (SwiftShader, llvmpipe).

- **Loop (`loop.ts`).** At most one render per animation frame. If a frame's load goes over `FRAME_OVER_BUDGET_MS` (load is the larger of its JS cost and the render-to-render gap), the next renders are spaced so rendering takes at most `MAX_RENDER_DUTY` of wall time. The loop pauses while the container is offscreen (`IntersectionObserver`), while the tab is hidden, and on `pagehide`. It resumes on `pageshow`.
- **GPU pacing (`gpu.ts`).** A fence after each render or warm-up batch is polled, never waited on. Nothing synchronous touches GL while the GPU is still busy, so a GPU backlog can't block the page.
- **Adaptive quality (`quality.ts`).** Levels from full quality down:
  1. pixel ratio capped at 1
  2. pixel ratio 0.75
  3. bloom and chromatic/vignette/grain off
  4. half-size shadow map, half the dust, no MSAA
  5. pixel ratio 0.5, no shadows, a quarter of the dust, and a 128 px environment map at creation

  The governor steps down after `SUSTAIN_DOWN_MS` over budget. It steps up after `SUSTAIN_UP_MS` of headroom, and that wait doubles whenever a step up is soon undone. Software renderers (detected through `failIfMajorPerformanceCaveat` or the renderer string) start at the lowest level.
- **Warm-up (`warmup.ts`).** Every program the scene, each new part (including its fading variant) and the post passes need is prepared one material per tick, together with the textures, before the scene draws. No visible frame stalls on a shader compile. In production three's synchronous shader-error checks are off; they stay on in development.
- **Teardown.** `dispose()` stops the loop, observers, timers and DOM at once. GPU and heap resources are released at the next idle period (`requestIdleCallback`, at most 2 s later), so route changes are not held up.

## Modes

| Mode | Used on (prototype) | Behaviour |
| --- | --- | --- |
| `hero` | Home landing hero (`bg=07080b`) | No orbit input. The camera is driven by `scroll`, `pointer`, `explode`, `select` and `frame`, with a slow sway. Dust is strongest here. Clicks and tooltips are disabled. |
| `studio` | Builder, Cables, Guide, Review (`bg=0b0d12`) | Orbit and zoom. After 9 s idle with nothing selected, it auto-rotates. Hovering shows a tooltip and bracket, clicking emits `pick`, and Escape clears the selection. Camera flights follow `select`/`view`/`explode`. Opens with an intro fly-in. |
| `solo` | Browse and Part pages (`bg=0c0e13`) | One product on a turntable, sized to the plinth. It is driven by `solo` messages. |

## Message protocol (`StudioMsg`)

Every message has a `rig` discriminator. The payloads match the prototype exactly.

| Message | Payload | Effect |
| --- | --- | --- |
| `build` | `build: StudioBuild` (`Partial<Record<StudioCat, BuildItem>>`; `BuildItem = { id, label, price?, sub?, vis: PartVis }`) | **First call:** builds everything and plays the reveal (lights fade up, parts fly in, glows ignite, intro camera in studio mode), then emits `revealed` after about 2.7 s. **Case or motherboard form factor changed, or motherboard added/removed:** the whole rig explodes out, dims and rebuilds. **Any other changed category** (compared by `id`): that part flies out, the new one flies in, the floor ripples and a scan box sweeps the part. Cables are re-run afterwards if the motherboard, GPU or case changed. |
| `solo` | `cat: StudioCat`, `item: { id, label, vis }` | Replaces the scene with one product. The plinth is resized, the camera flies in and the turntable starts. `case` shows the chassis, fans and glass. |
| `select` | `part: PickTarget \| null`, `note?: { title?, sub?, price?, tone?: 'error' \| 'warn' }` | Blue corner brackets surround the category and everything else dims. A callout shows `NN · Label`, price, name and sub-line; the note overrides these, and `cables` needs a note because it has no build item. **studio:** the camera flies to the part's preset. **hero:** the camera eases toward it. `null` clears the selection. |
| `explode` | `v: number` (0 = assembled, 1 = fully exploded; values in between work), `stagger?: boolean` | Spring-animates every part along its explode offset. `stagger` fans the parts out in order 70 ms apart and, in studio mode, re-frames the camera. Above 0.3 the cables fade out. |
| `issues` | `parts: PickTarget[]` | Up to 4 pulsing red brackets. The backdrop, grid, plinth rim and interior light warm to red (not in hero). If the selected part is listed, its callout gets the `err` style. |
| `view` | `name: 'hero' \| 'side' \| 'top' \| 'front'` | Studio only. Clears the selection and flies to a preset pose. The distance scales with case height, aspect ratio and explode. |
| `cables` | `opts?: Partial<{ route: 'tidy' \| 'stock'; sleeve: 'black' \| 'white' \| 'blue' }>` | Merges the options into the cable settings and cross-fades a rebuild of the cable runs. `stock` gives loose, wobbly loops; `tidy` gives combs and grommets. Not used in solo. |
| `cable` | `id: 'cable_24pin' \| 'cable_eps' \| 'cable_gpu' \| 'cable_fp' \| null` | Makes one cable run glow with a pulse and dims the other runs to 40%. |
| `xray` | `v: boolean` | Fades the side glass and the front fans to 6% so the interior shows through. |
| `stage` | `show: PartId[] \| null` | Build-guide staging. Parts not listed fly out (explode 1.6) and fade. `null` shows everything. `PartId` includes `fans`, `glass` and `cables`. |
| `scroll` | `p: number` (0–1) | Hero only: page scroll progress, which drives the azimuth. |
| `pointer` | `x, y: number` (−1…1, viewport-normalised) | Hero only: mouse parallax. |
| `frame` | `shiftX?: number` (fraction of width) | Shifts the camera view offset sideways so the rig sits off-centre next to copy. |
| `mood` | `color?: string \| number` | Accent colour, eased in over about 1 s. It applies to the backdrop, grid, dust, light cone, rim light and plinth rim. The default is `#3d8bff`. |
| `pulse` | `part?: PickTarget \| null` | Floor ripple now, plus a scan sweep over `part` if one is given. |

## Events (`handle.on`)

| Event | Payload | When |
| --- | --- | --- |
| `ready` | `{ mode }` | The engine is live and accepting messages. It fires once, in a microtask after `createStudio`; late subscribers are called immediately. This matches the prototype's `{ rig: 'ready' }` post, which also came before any build. |
| `pick` | `{ part: PickTarget \| null }` | Studio mode. A click (< 5 px movement) on a part, or on empty space (`null`). The engine also toggles its own selection, as the prototype did. Pressing Escape while the studio has focus and something is selected emits `{ part: null }`. |
| `revealed` | `{}` | About 2.7 s after the first build or solo, when the reveal finishes (prototype `{ rig: 'revealed' }`). Fires once per studio; a scene rebuilt after context loss does not repeat it. |
| `unavailable` | `{ reason: 'unsupported' \| 'error' \| 'context-lost' }` | The 3D view cannot run, or stopped. At start-up it fires just before `ready` (same microtask). Late subscribers get it immediately while the view is still down. |
| `restored` | `{}` | After `unavailable` with `context-lost`: the browser restored the context and the scene is running again. |

All additions are backward compatible: `StudioMsg`, `StudioRef` and the existing events are unchanged.

## Without WebGL

`createStudio` (and so `<Studio>`) never throws because of WebGL.

- **Detection.** Before creating the renderer, the engine probes for a WebGL2 context (what three r184 needs) and releases the probe at once. If there is none, or if the renderer still fails to start, it renders the fallback and emits `unavailable` with `unsupported` or `error`. The handle stays valid: `send()` is accepted, `ready` still fires, and `dispose()` cleans up.
- **Fallback.** A `role="status"` / `aria-live="polite"` panel fills the container on the mode's background with a faint token grid. It shows the eyebrow "3D preview unavailable", one sentence explaining why, and a list of the build's parts (category, product name and price when given) built from the latest `build` or `solo` message. Because `ready` still fires, the state hosts push from `onReady` fills the list with no extra code.
- **Context loss.** On `webglcontextlost` the engine stops the loop, releases the scene while the context is gone (GPU deletes are no-ops then, so nothing touches the restored context later), shows the fallback and emits `unavailable` with `context-lost`. On `webglcontextrestored` it builds a fresh scene, replays the latest state the host sent (`mood`, `cables`, `build`/`solo`, `explode`, `issues`, `xray`, `stage`, `cable`, `frame`, `scroll`, `pointer`, `select`; one-shot `view` and `pulse` are not replayed), hides the fallback and emits `restored`. The rebuilt scene plays its reveal again.

## Differences from the prototype

- **Shadow map type.** The prototype set `PCFSoftShadowMap`. three r184 deprecates it and falls back to `PCFShadowMap` with a warning at first render. The port sets `PCFShadowMap` directly, so the output is identical without the warning.
- **Solo part removal.** When switching solo products, the old meshes are now actually removed. The prototype's `root.remove(part.group)` missed groups nested in the solo wrapper.
- **Overlay styling.** The callout and tooltip keep the prototype's exact values. Where a global token matches exactly it is used (`--fg`, `--fg-soft`, `--fg-bright`, `--blue-soft`, `--line-2`, `--radius`, `--sans` / `--mono`, `--ease-out`, `--warn` at 60 %, `type.tag` / `type.kicker` with the prototype's tracking). The rest are studio-scoped custom properties on `.rigmy-studio` (`--rs-callout-bg`, `--rs-callout-edge`, `--rs-error-edge`, `--rs-error-key`, `--rs-warn-key`, `--rs-tip-bg`, `--rs-callout-fade` 260 ms, `--rs-tip-fade` 160 ms), defined once in `overlay.ts`. Transitions are off under `prefers-reduced-motion`.
- **Callout and tooltip placement.** They are absolutely positioned inside the container rather than `position: fixed` on `body`, and their coordinates are relative to the container. They keep `box-sizing: content-box`, so the global `* { box-sizing: border-box }` reset does not change their size.
- **Escape key.** It only acts after the user has pointer-downed inside the studio, and stops when they click elsewhere. This mimics iframe focus, so Escape elsewhere on the page is unaffected.
- **Dropped debug code.** No `window.__rig` / `window.__bloom` debug globals, no export toolbar, and the invisible stage ground plane is not created.
