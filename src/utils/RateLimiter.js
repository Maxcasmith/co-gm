/**
 * Sequential request queue with a configurable minimum gap between calls.
 * Prevents thundering-herd API calls during combat rounds with many NPC turns.
 *
 * All calls are serialised — concurrent callers wait in line rather than
 * firing simultaneously. The minimum interval guards the tail of each call,
 * so two back-to-back 200ms calls still respect the gap between them.
 */
export class RateLimiter {
  /** @param {number} minIntervalMs  Minimum ms between the END of one call and START of the next */
  constructor(minIntervalMs = 300) {
    this._minInterval = minIntervalMs;
    this._lastCall    = 0;
    this._queue       = [];
    this._running     = false;
  }

  /**
   * Schedule `fn` to run after any in-flight call plus the minimum gap.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  schedule(fn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject });
      if (!this._running) this._drain();
    });
  }

  async _drain() {
    this._running = true;
    while (this._queue.length) {
      const { fn, resolve, reject } = this._queue.shift();
      const wait = Math.max(0, this._lastCall + this._minInterval - Date.now());
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      this._lastCall = Date.now();
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      }
    }
    this._running = false;
  }
}
