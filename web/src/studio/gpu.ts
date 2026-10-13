// GPU pacing. Keep at most one batch of GPU work in flight: a fence placed after each render / warm-up batch is polled
// (never waited on) before the next one. Queuing more than the GPU can drain makes the next synchronous GL call block
// the main thread until the backlog clears, which on software GL means seconds.
export function createGpuFence(gl: WebGL2RenderingContext) {
  let fence: WebGLSync | null = null;
  const drop = (): void => { if (fence) { gl.deleteSync(fence); fence = null; } };
  return {
    /** True while the last marked batch is still executing. */
    busy(): boolean {
      if (!fence) return false;
      if (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) return true;
      drop();
      return false;
    },
    /** Mark the end of a batch of GPU work (and flush it). */
    mark(): void {
      drop();
      fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
    },
    dispose: drop,
  };
}
