/**
 * Pixel Frontier - Real-Time Rolling Frame Rate & Performance Profiler
 *
 * Implements a true rolling 1-second frame counter driven by requestAnimationFrame timestamps.
 * Tracks average and worst-case execution times for physics, rendering, chunk management,
 * and chunk generation without faking values or relying on single-frame measurements.
 */

export interface FrameSample {
  timestamp: number;
  frameTime: number; // Total JS work duration (performance.now() difference)
  updateTime: number; // Physics & player logic
  renderTime: number; // Canvas drawing
  chunkMgmtTime: number; // Chunk position & queue updates
  chunkGenTime: number; // Chunk terrain generation & offscreen canvas rendering
}

export interface ProfilerStats {
  fps: number;
  avgFrameTime: number;
  worstFrameTime: number;
  renderTime: number;
  physicsTime: number;
  chunkMgmtTime: number;
  chunkGenTime: number;
  queuedChunks: number;
  frameTime: number; // Alias for avgFrameTime
  updateTime: number; // Alias for physicsTime
}

export class PerformanceProfiler {
  private samples: FrameSample[] = [];
  private rafTimestamps: number[] = [];
  private lastStats: ProfilerStats = {
    fps: 60,
    avgFrameTime: 0,
    worstFrameTime: 0,
    renderTime: 0,
    physicsTime: 0,
    chunkMgmtTime: 0,
    chunkGenTime: 0,
    queuedChunks: 0,
    frameTime: 0,
    updateTime: 0,
  };

  /**
   * Records a completed frame into the rolling window
   */
  public recordFrame(
    rAFTimestamp: number,
    frameTime: number,
    updateTime: number,
    renderTime: number,
    chunkMgmtTime: number,
    chunkGenTime: number,
    queuedChunks: number
  ) {
    this.rafTimestamps.push(rAFTimestamp);
    this.samples.push({
      timestamp: rAFTimestamp,
      frameTime,
      updateTime,
      renderTime,
      chunkMgmtTime,
      chunkGenTime,
    });

    // Prune entries older than 1 second (1000 ms)
    const windowStart = rAFTimestamp - 1000;

    while (this.rafTimestamps.length > 0 && this.rafTimestamps[0] <= windowStart) {
      this.rafTimestamps.shift();
    }

    while (this.samples.length > 0 && this.samples[0].timestamp <= windowStart) {
      this.samples.shift();
    }

    // Compute rolling metrics
    this.updateStats(rAFTimestamp, queuedChunks);
  }

  private updateStats(now: number, queuedChunks: number) {
    const frameCount = this.rafTimestamps.length;
    let fps = 60;

    if (frameCount >= 2) {
      const windowDurationMs = now - this.rafTimestamps[0];
      if (windowDurationMs >= 200) {
        // Precise frame rate over the actual elapsed time in the window
        fps = Math.round((frameCount - 1) / (windowDurationMs / 1000));
      }
    } else if (frameCount === 1) {
      fps = 60;
    }

    let sumFrameTime = 0;
    let worstFrameTime = 0;
    let sumRender = 0;
    let sumUpdate = 0;
    let sumChunkMgmt = 0;
    let sumChunkGen = 0;
    let worstChunkGen = 0;

    const count = this.samples.length || 1;

    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i];
      sumFrameTime += s.frameTime;
      if (s.frameTime > worstFrameTime) {
        worstFrameTime = s.frameTime;
      }
      sumRender += s.renderTime;
      sumUpdate += s.updateTime;
      sumChunkMgmt += s.chunkMgmtTime;
      sumChunkGen += s.chunkGenTime;
      if (s.chunkGenTime > worstChunkGen) {
        worstChunkGen = s.chunkGenTime;
      }
    }

    const avgFrameTime = sumFrameTime / count;
    const avgRender = sumRender / count;
    const avgUpdate = sumUpdate / count;
    const avgChunkMgmt = sumChunkMgmt / count;
    // For chunk generation, show the worst active time in the window if any chunk was generated,
    // otherwise average
    const chunkGenStat = worstChunkGen > 0 ? worstChunkGen : sumChunkGen / count;

    this.lastStats = {
      fps: Math.max(1, fps),
      avgFrameTime,
      worstFrameTime,
      renderTime: avgRender,
      physicsTime: avgUpdate,
      chunkMgmtTime: avgChunkMgmt,
      chunkGenTime: chunkGenStat,
      queuedChunks,
      frameTime: avgFrameTime,
      updateTime: avgUpdate,
    };
  }

  public getStats(): ProfilerStats {
    return this.lastStats;
  }

  public reset() {
    this.samples = [];
    this.rafTimestamps = [];
  }
}
