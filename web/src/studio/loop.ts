// Render scheduling. At most one render per animation frame; when frames overrun, renders are spaced out so the
// loop never takes more than `MAX_RENDER_DUTY` of the main thread; the loop pauses while the studio is offscreen,
// the tab is hidden or the page is being left; every rendered frame feeds the adaptive-quality governor.
import { FRAME_OVER_BUDGET_MS, type createQualityGovernor } from './quality';

/** Longest step fed to springs and tweens (s); longer gaps (pauses, skipped frames) are clamped. */
const MAX_DT = 0.05;
/** Upper bound on the share of wall time spent rendering (main thread and GPU) once frames overrun the budget. */
export const MAX_RENDER_DUTY = 0.5;

export interface RenderLoop {
  /** Stop for good and remove the observers. */
  stop(): void;
}

/** What a step did: rendered a frame, skipped because the GPU is still busy with the previous one (counts as load),
 *  or skipped while waiting for something else, such as shader warm-up (not measured). */
export type StepResult = 'rendered' | 'gpu-busy' | 'waiting';

export function startLoop(host: HTMLElement, step: (dt: number) => StepResult, governor: ReturnType<typeof createQualityGovernor>): RenderLoop {
  let raf = 0, stopped = false, lastRender = 0, nextAllowed = 0, forcedIdle = 0;
  const gate = { inView: true, pageVisible: !document.hidden, pageShown: true };

  const tick = (now: number): void => {
    raf = 0;
    if (!canRun()) return;
    if (now < nextAllowed) { schedule(); return; } // coalesce: hand this vsync back to the page
    const t0 = performance.now();
    const dt = Math.min((t0 - lastRender) / 1000, MAX_DT);
    let result: StepResult = 'waiting';
    try { result = step(dt); } catch (err) { console.error('[rigmy studio] frame error', err); }
    const t1 = performance.now(), cost = t1 - t0;
    if (result === 'waiting') { lastRender = t0; governor.settle(t1); nextAllowed = 0; forcedIdle = 0; schedule(); return; }
    if (result === 'gpu-busy') { schedule(); return; }
    // Load = this frame's JS cost or the render-to-render gap (GPU backlog shows up here), excluding our own idling.
    const gap = Math.max(0, t0 - lastRender - forcedIdle);
    lastRender = t0;
    governor.sample(cost, gap, t1);
    // Over budget (main-thread cost or GPU backlog): idle long enough that rendering takes at most MAX_RENDER_DUTY.
    const load = Math.max(cost, gap);
    forcedIdle = load > FRAME_OVER_BUDGET_MS ? load * (1 / MAX_RENDER_DUTY - 1) : 0;
    nextAllowed = t1 + forcedIdle;
    schedule();
  };
  const canRun = (): boolean => !stopped && gate.inView && gate.pageVisible && gate.pageShown;
  const schedule = (): void => { if (!raf) raf = requestAnimationFrame(tick); };
  /** Start or pause after a gate change; a resume restarts timing so the gap is neither simulated nor measured. */
  const update = (): void => {
    if (canRun()) {
      if (raf) return;
      lastRender = performance.now(); nextAllowed = 0; forcedIdle = 0;
      governor.settle(lastRender);
      schedule();
    } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  };

  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => { const e = entries[entries.length - 1]; if (e) { gate.inView = e.isIntersecting; update(); } })
    : null;
  io?.observe(host);
  const onVisibility = (): void => { gate.pageVisible = !document.hidden; update(); };
  const onPageHide = (): void => { gate.pageShown = false; update(); };
  const onPageShow = (): void => { gate.pageShown = true; update(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  update();

  return {
    stop(): void {
      stopped = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    },
  };
}
