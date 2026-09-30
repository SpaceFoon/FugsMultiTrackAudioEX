/**
 * Deterministic virtual clock for the engine harness.
 *
 * One clock drives EVERYTHING time-based so tests never sleep:
 *   - setTimeout / setInterval / requestAnimationFrame
 *   - performance.now()
 *   - AudioContext.currentTime (see fake-webaudio.js)
 *
 * Usage:
 *   const clock = createClock();
 *   await clock.advance(1500);   // run everything due in the next 1.5 s
 *
 * Timers due at the same instant run in creation order. Promise callbacks are
 * drained between timers so engine code that chains `.then()` behaves like it
 * does in a browser (microtasks run before the next macrotask).
 *
 * requestAnimationFrame callbacks are delivered on a 60 Hz grid, but only when
 * at least one callback is registered (like a browser that has nothing to paint).
 */
"use strict";

const FRAME_MS = 1000 / 60;

function createClock() {
  let now = 0; // ms
  let seq = 0;
  let timers = []; // { id, at, seq, fn, args, interval }
  let rafCbs = []; // { id, fn }
  let nextRafId = 1;
  let lastFrame = 0; // index of the last animation frame delivered

  function setTimeoutFn(fn, ms, ...args) {
    const id = ++seq;
    const delay = Math.max(0, Number(ms) || 0);
    timers.push({ id, at: now + delay, seq: id, fn, args, interval: null });
    return id;
  }
  function setIntervalFn(fn, ms, ...args) {
    const id = ++seq;
    const every = Math.max(1, Number(ms) || 1);
    timers.push({ id, at: now + every, seq: id, fn, args, interval: every });
    return id;
  }
  function clearTimer(id) {
    timers = timers.filter((t) => t.id !== id);
  }
  function requestAnimationFrameFn(fn) {
    const id = nextRafId++;
    rafCbs.push({ id, fn });
    return id;
  }
  function cancelAnimationFrameFn(id) {
    rafCbs = rafCbs.filter((c) => c.id !== id);
  }

  /** Index of the next animation frame that lies strictly after `now`. */
  function nextFrameIndex() {
    return Math.max(lastFrame + 1, Math.floor(now / FRAME_MS + 1e-9) + 1);
  }

  async function drainMicrotasks() {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  }

  /** Advance virtual time by `ms`, running every timer/frame that comes due. */
  async function advance(ms) {
    const target = now + ms;
    for (;;) {
      let t = null;
      for (const c of timers) {
        if (!t || c.at < t.at || (c.at === t.at && c.seq < t.seq)) t = c;
      }
      const frameIdx = rafCbs.length ? nextFrameIndex() : Infinity;
      const frameAt = frameIdx === Infinity ? Infinity : frameIdx * FRAME_MS;
      const nextAt = Math.min(t ? t.at : Infinity, frameAt);
      if (nextAt > target + 1e-9) break;

      now = Math.max(now, nextAt);
      if (t && t.at <= frameAt) {
        if (t.interval != null) {
          t.at += t.interval;
          t.seq = ++seq;
        } else {
          timers = timers.filter((c) => c !== t);
        }
        t.fn(...t.args);
      } else {
        lastFrame = frameIdx;
        const batch = rafCbs;
        rafCbs = [];
        for (const cb of batch) cb.fn(now);
      }
      await drainMicrotasks();
    }
    // never let time run backwards (a frame inside the float tolerance may have set now > target)
    if (target > now) now = target;
    await drainMicrotasks();
  }

  return {
    FRAME_MS,
    now: () => now,
    advance,
    drain: drainMicrotasks,
    pendingTimers: () => timers.length,
    pendingTimerList: () => timers.map((t) => ({ id: t.id, at: t.at, interval: t.interval })),
    api: {
      setTimeout: setTimeoutFn,
      clearTimeout: clearTimer,
      setInterval: setIntervalFn,
      clearInterval: clearTimer,
      requestAnimationFrame: requestAnimationFrameFn,
      cancelAnimationFrame: cancelAnimationFrameFn,
      performance: { now: () => now },
    },
  };
}

module.exports = { createClock, FRAME_MS };
