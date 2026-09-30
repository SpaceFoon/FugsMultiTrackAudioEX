/**
 * Shared helpers for the engine-compatibility scenario tests.
 *
 * Every test file runs its scenarios against each available BACKEND:
 *   - "MV (model)"          always
 *   - "MZ (model)"          always
 *   - "MZ (real scripts)"   when RMMZ_JS_DIR points at an MZ project's js/ folder
 *   - "MV (real scripts)"   when RMMV_JS_DIR points at an MV project's js/ folder (experimental)
 *
 * Assertions are made against the fake Web Audio GRAPH (what a listener would
 * hear), not against the plugin's own bookkeeping, wherever possible.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { describe } = require("node:test");
const { createEnv } = require("../harness/env");

function backends() {
  const list = [
    { id: "mv", label: "MV (model)", cfg: { engine: "mv" } },
    { id: "mz", label: "MZ (model)", cfg: { engine: "mz" } },
  ];
  const mz = process.env.RMMZ_JS_DIR;
  if (mz && fs.existsSync(path.join(mz, "rmmz_core.js"))) {
    list.push({ id: "mz-real", label: "MZ (real scripts)", cfg: { engine: "mz", real: mz } });
  }
  const mv = process.env.RMMV_JS_DIR;
  if (mv && fs.existsSync(path.join(mv, "rpg_core.js"))) {
    list.push({ id: "mv-real", label: "MV (real scripts)", cfg: { engine: "mv", real: mv } });
  }
  const only = process.env.HARNESS_ONLY; // e.g. HARNESS_ONLY=mz
  return only ? list.filter((b) => only.split(",").includes(b.id)) : list;
}

/** describe() once per backend. `fn(backend)` registers the `it()`s. */
function forEachBackend(title, fn) {
  for (const b of backends()) {
    describe(`${title} :: ${b.label}`, () => fn(b));
  }
}

/**
 * Create an environment with the plugin pack loaded the way a game does:
 * plugins load first, THEN the engine creates its audio context (initAudio).
 */
async function boot(backend, o) {
  o = o || {};
  const env = await createEnv(Object.assign({}, backend.cfg, o.envOpts || {}, { params: o.params }));
  env.addDefaultAudio();
  if (o.files) o.files(env);
  env.loadPack(o.pack);
  env.bootAudio();
  if (o.map !== false) env.enterMap();
  // performance.now() is already in the thousands of ms when a real game reaches its first event
  await env.advance(5000);
  // Errors during plugin LOAD are asserted by the dedicated boot tests; functional tests only
  // look at errors raised afterwards.
  env._errorBase = env.logs.error.length;
  return env;
}

// ------------------------------------------------------------------- helpers
/** Sources (BufferSource nodes) currently feeding the track's gain node. */
function sourcesOf(env, key) {
  const buf = env.track(key);
  if (!buf || !buf._gainNode) return [];
  return env.audio.upstreamOf(buf._gainNode).filter((n) => n._kind === "BufferSource");
}
function audibleSourcesOf(env, key) {
  return sourcesOf(env, key).filter((s) => s.isAudible());
}
/** Effective linear gain on the track's engine gain node (what the listener gets from volume). */
function gainOf(env, key) {
  const buf = env.track(key);
  if (!buf || !buf._gainNode) return null;
  return buf._gainNode.gain.valueAt(env.audio.currentTime);
}
function panOf(env, key) {
  const buf = env.track(key);
  if (!buf || !buf._pannerNode) return null;
  return buf._pannerNode.position.x;
}
function rateOf(env, key) {
  const s = audibleSourcesOf(env, key)[0];
  return s ? s.playbackRate.valueAt(env.audio.currentTime) : null;
}
/** True audio position (seconds) of the first audible source of a track. */
function truePos(env, key) {
  const s = audibleSourcesOf(env, key)[0];
  return s ? s.position() : null;
}
/** Total number of BufferSource start() calls in the whole context (restart detector). */
function startedCount(env) {
  return env.audio.nodesOfKind("BufferSource").filter((s) => s._started).length;
}
/** Nodes that still lead to the destination besides the master gain. */
function danglingAudio(env) {
  const ctx = env.audio;
  const master = env.run("WebAudio._masterGainNode");
  return ctx.upstreamOf(ctx.destination).filter((n) => n !== master);
}
function pluginErrors(env) {
  return env.logs.error.slice(env._errorBase || 0).filter((l) => /Fugs/i.test(l));
}
function keys(env) {
  return Array.from(env.A.tracks.keys()).sort();
}
async function cmd(env, text, o) {
  await env.runCommand(text, o);
}
/** run a command and let files load/decode + listeners run */
async function play(env, text, settleMs) {
  await env.runCommand(text);
  await env.settle(settleMs == null ? 300 : settleMs);
}

/**
 * Run the shipped dev-only in-game suite (FugsAudio8Test, i.e. `test("<group>")` in the F8
 * console) inside the harness and return its { passed, failed, skipped } counters.
 *
 * Stubbed, because a Node vm has no NW.js: the game's audio-folder listing (fs) and $dataSystem.
 * `o.exclude` removes individual tests first (those that need a REAL audio signal from an
 * AnalyserNode, which the fake Web Audio graph does not produce).
 */
async function runInGameTests(env, pattern, o) {
  o = o || {};
  env.sandbox.__audioList = (type) => {
    const out = [];
    for (const k of env.files.keys()) {
      const m = /^audio\/([^/]+)\/(.+)\.(ogg|m4a)$/.exec(k);
      if (m && m[1] === type) out.push(decodeURIComponent(m[2]));
    }
    return out;
  };
  env.run(`
    window.$dataSystem = window.$dataSystem || {};
    TestRunner.scanFolder = function (type) { return window.__audioList(type); };
    TestRunner.reset();
  `);
  for (const name of o.exclude || []) env.run(`TestRunner.tests.delete(${JSON.stringify(name)})`);

  let settled = false;
  let failure = null;
  Promise.resolve(env.run(`window.test(${JSON.stringify(pattern)})`)).then(
    () => {
      settled = true;
    },
    (e) => {
      settled = true;
      failure = e;
    }
  );
  for (let i = 0; i < (o.maxSteps || 60000) && !settled; i++) await env.advance(50, { map: false });
  if (failure) throw failure;
  if (!settled) throw new Error(`in-game test "${pattern}" did not finish`);
  return {
    passed: env.run("TestRunner.results.passed"),
    failed: env.run("TestRunner.results.failed"),
    skipped: env.run("TestRunner.results.skipped"),
    failedTests: Array.from(env.run("TestRunner.failedTests")).map(String),
  };
}

module.exports = {
  backends,
  forEachBackend,
  boot,
  runInGameTests,
  sourcesOf,
  audibleSourcesOf,
  gainOf,
  panOf,
  rateOf,
  truePos,
  startedCount,
  danglingAudio,
  pluginErrors,
  keys,
  cmd,
  play,
};
