/**
 * Durable Node smoke tests for the FugsAudio modular pack.
 *
 * Usage (from repo root):
 *   node scripts/smoke.js
 *
 * Stubs enough of RPG Maker MV (PluginManager, AudioManager, scenes, WebAudio)
 * to load Core + satellites and assert load-order wiring + key bug regressions.
 */
"use strict";

const path = require("path");
const root = path.resolve(__dirname, "..");

global.requestAnimationFrame = (fn) => setTimeout(fn, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.performance = global.performance || { now: () => Date.now() };
global.PluginManager = { parameters: () => ({}) };

const makeParam = () => ({
  value: 1,
  setValueAtTime() {},
  setTargetAtTime() {},
  cancelScheduledValues() {},
  linearRampToValueAtTime() {},
});
const makeNode = () => ({
  gain: makeParam(),
  connect() {},
  disconnect() {},
});

function makeBuffer(name, opts) {
  opts = opts || {};
  return {
    _name: name,
    _gainNode: makeNode(),
    _ready: opts.ready !== false,
    _loadListeners: [],
    _playing: false,
    _seekVal: opts.seekVal != null ? opts.seekVal : 0,
    volume: 1,
    pan: 0,
    pitch: 1,
    play() {
      this._playing = true;
    },
    stop() {
      this._playing = false;
    },
    fadeIn() {},
    fadeOut() {},
    isPlaying() {
      return !!this._playing;
    },
    isReady() {
      return this._ready;
    },
    seek() {
      return this._seekVal;
    },
    addLoadListener(fn) {
      if (this._ready) fn();
      else this._loadListeners.push(fn);
    },
    fireLoad() {
      this._ready = true;
      const list = this._loadListeners.slice();
      this._loadListeners = [];
      list.forEach((f) => f());
    },
  };
}

const pendingBuffers = [];
global.AudioManager = {
  createBuffer: (_t, n) => {
    const spec = pendingBuffers.shift() || {};
    return makeBuffer(n, spec);
  },
};
global.SceneManager = { isNextScene: () => false };
global.DataManager = {
  makeSaveContents: () => ({}),
  extractSaveContents() {},
  loadGame: () => true,
  setupNewGame() {},
};
global.Scene_Title = { prototype: { start() {} } };
global.Scene_Map = { prototype: { update() {}, create() {}, terminate() {} } };
global.Scene_Battle = { prototype: { terminate() {} } };
global.Scene_Menu = { prototype: { start() {}, terminate() {} } };
global.Game_Interpreter = { prototype: { pluginCommand() {} } };
global.WebAudio = {
  _context: {
    currentTime: 0,
    sampleRate: 44100,
    createAnalyser: () => ({
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      getFloatTimeDomainData(a) {
        a.fill(0);
      },
      connect() {},
      disconnect() {},
    }),
  },
};
global.window = global;
global.$gamePlayer = { x: 5, y: 5, _realX: 5, _realY: 5 };
global.$gameMap = { event: () => ({ _realX: 8, _realY: 8 }) };
global.$dataMap = { events: { 3: { id: 3 } } };

const results = [];
function ok(name, cond) {
  results.push({ name, pass: !!cond });
}

function load(rel) {
  require(path.join(root, rel));
}

load("FugsMultiTrackAudioEX.js");
const A = global.FugsAudio;
ok("core exported", !!A && A === global.FugsMultiTrackAudioEX);

load("FugsAudio0Docs.js");
load("FugsAudio2Effects.js");
load("FugsAudio3Spatial.js");
load("FugsAudio4Dynamics.js");
load("FugsAudio5Switch.js");
load("FugsAudio6Aliases.js");
load("FugsAudio7Compat.js");
load("FugsAudio8Test.js");

ok("AudioEffects loaded", !!global.AudioEffects);
ok("DistanceCurves loaded", !!global.DistanceCurves);
ok("effect handler real", A.hasHandler("effect"));
ok("setupProximity real", typeof A.setupProximitySource === "function");
ok("duckVolume real", typeof A.duckVolume === "function");
ok("SwitchBuffer attached", !!A.SwitchBuffer);
ok("registerAlias real", typeof A.registerAlias === "function");
ok("test() available", typeof global.test === "function");
ok("update hooks >=2", A._updateHooks.length >= 2);
ok("teardown hooks >=3", A._teardownHooks.length >= 3);
ok("capture hooks >=2", A._captureStateHooks.length >= 2);
ok("restore hooks >=2", A._restoreStateHooks.length >= 2);
ok("parse loop (B02)", (A.parseCommand("play-bgm1", ["Theme", "(loop:3)"]) || {}).loop === 3);
ok("isKnown pansweep", A.isKnownPluginCommand("pansweep-bgm1"));

// B09 orphan cleanup
{
  const dead = makeBuffer("dead");
  dead._playing = false;
  dead._buffer = { length: 1 };
  A.tracks.set("bgm_99", dead);
  A.cleanupOrphanedTracks();
  ok("B09 orphan removed", !A.tracks.has("bgm_99"));
  ok("B09 PCM released", dead._buffer === null);
}

// B13 paused skip
{
  pendingBuffers.push({});
  A.playAudio({ type: "bgm", trackId: "1", name: "T1", volume: 80, fadein: 0 });
  pendingBuffers.push({});
  A.playAudio({ type: "bgm", trackId: "2", name: "T2", volume: 80, fadein: 0 });
  A.pausedTracks.add("bgm_2");
  const pitched = [];
  const orig = A.fadeAudio;
  A.fadeAudio = function (type, trackId, opts, cb) {
    if (opts && opts.pitch !== undefined) pitched.push(type + "_" + trackId);
    return orig.call(this, type, trackId, opts, cb);
  };
  A.pitchBendAllOfType("bgm", [80, 0]);
  A.fadeAudio = orig;
  ok("B13 skips paused", pitched.indexOf("bgm_2") === -1);
  ok("B13 hits active", pitched.indexOf("bgm_1") !== -1);
  A.pausedTracks.delete("bgm_2");
}

// B07 sidechain replace
{
  A.setupSidechain(["1", "2", "0.5", "4", "0.01", "0.1"]);
  const first = A.sidechainConnections.get("1_to_2");
  A.setupSidechain(["1", "2", "0.5", "4", "0.01", "0.1"]);
  const second = A.sidechainConnections.get("1_to_2");
  ok("B07 replaced connection", first && second && first !== second);
  ok("B07 old deactivated", first && first.active === false);
}

// B06 proximity + panSweep + sidechain round-trip via saveAll/loadAll
{
  A.setupProximitySource("bgm_1", {
    x: 10,
    y: 12,
    maxDistance: 6,
    minVolume: 0.1,
    curve: "smooth",
    pan: true,
  });
  A.startPanSweep("bgm", "1", -80, 80, 4, 0, "smooth");
  ok("B06 pansweep active before save", A.panSweeps.has("bgm_1"));

  // Activate pump so __fugsMeta is captured
  A.pumpConfig = {
    active: true,
    bpm: 128,
    depth: 0.4,
    shape: "sine",
    tracks: "bgm",
    startTime: performance.now(),
  };

  A.saveAllStates("smoke");
  const saveBlob = JSON.parse(JSON.stringify(A.getSaveData()));
  ok("B06 __fugsMeta.pump present", !!(saveBlob.__fugsMeta && saveBlob.__fugsMeta.pump));
  ok("B06 __fugsMeta not a snapshot name", !A.namedSnapshots.has("__fugsMeta"));

  // Tear down
  A.stopAudio("bgm", "1", 0);
  A.stopAudio("bgm", "2", 0);
  A.proximityData.clear();
  A.panSweeps.clear();
  A.pumpConfig.active = false;
  if (A.sidechainConnections) {
    for (const [k, c] of Array.from(A.sidechainConnections.entries())) {
      A._disposeSidechainConnection(k, c, { restoreTarget: false });
    }
  }
  ok("B06 torn down", !A.tracks.has("bgm_1") && !A.proximityData.has("bgm_1"));

  A.applySaveData(saveBlob);
  pendingBuffers.push({}, {});
  const restoredCount = A.loadAllStates("smoke");
  ok("B06 loadAllStates count", restoredCount >= 2);
  ok("B06 proximity restored", A.proximityData.has("bgm_1"));
  ok("B06 pansweep restored", A.panSweeps.has("bgm_1"));
  ok("B06 sidechain restored", A.sidechainConnections && A.sidechainConnections.has("1_to_2"));
  ok("B06 pump restored", A.pumpConfig && A.pumpConfig.active === true && A.pumpConfig.bpm === 128);
}

// B12 cold paused restore
{
  const pausedState = {
    name: "Ambient",
    volume: 0.7,
    pan: 0,
    pitch: 1,
    persistence: "scene",
    pauseMode: "battle",
    effect: null,
    currentTime: 42.5,
    isPlaying: false,
    isPaused: true,
    loopMode: "forever",
    loopRepeatsRemaining: 0,
    ext: {},
  };
  pendingBuffers.push({ ready: false, seekVal: 0 });
  A.loadTrackState("bgm_3", pausedState);
  const cold = A.tracks.get("bgm_3");
  ok("B12 waits for load", cold && !A.pausedTracks.has("bgm_3"));
  cold.fireLoad();
  const snap = A.pausedSnapshots.get("bgm_3");
  ok("B12 paused after load", A.pausedTracks.has("bgm_3"));
  ok("B12 keeps position", snap && Math.abs(snap.pos - 42.5) < 1e-6);
}

// Acceptance: core play/stop/fade/pause/resume dispatch
{
  pendingBuffers.push({});
  ok(
    "accept play",
    A.executeCommand({ type: "bgm", trackId: "10", action: "play", args: ["Theme"] }) === true
  );
  ok("accept track exists", A.tracks.has("bgm_10"));
  ok(
    "accept fade",
    A.executeCommand({
      type: "bgm",
      trackId: "10",
      action: "fade",
      args: ["50", "0"],
    }) === true
  );
  ok(
    "accept pause",
    A.executeCommand({ type: "bgm", trackId: "10", action: "pause", args: ["0"] }) === true
  );
  ok("accept paused set", A.pausedTracks.has("bgm_10"));
  pendingBuffers.push({});
  ok(
    "accept resume",
    A.executeCommand({ type: "bgm", trackId: "10", action: "resume", args: [] }) === true
  );
  ok(
    "accept stop",
    A.executeCommand({ type: "bgm", trackId: "10", action: "stop", args: ["0"] }) === true
  );
}

// Acceptance: aliases
{
  ok(
    "accept registerAlias",
    A.registerAlias("Footstep", { pool: ["Step1", "Step2"], volumeJitter: 5 }) === true
  );
  ok("accept alias stored", A.sfxAliases && A.sfxAliases.has("Footstep"));
  pendingBuffers.push({});
  ok("accept playAlias", A.playAlias("Footstep", "se", "1") === true);
  ok("accept unregisterAlias", A.unregisterAlias("Footstep") === true);
}

// Acceptance: spatial / dynamics handlers present after modular load
ok("accept proximity handler", A.hasHandler("proximity"));
ok("accept duckpump handler", A.hasHandler("duckpump"));
ok("accept sidechain handler", A.hasHandler("sidechain"));
ok("accept pansweep handler", A.hasHandler("pansweep"));
ok("accept global capture hooks", A._captureGlobalStateHooks.length >= 1);
ok("accept global restore hooks", A._restoreGlobalStateHooks.length >= 1);

setTimeout(() => {
  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log((r.pass ? "OK  " : "FAIL ") + r.name);
  }
  console.log(failed.length ? `FAILED ${failed.length}/${results.length}` : `ALL PASS ${results.length}`);
  process.exit(failed.length ? 1 : 0);
}, 80);
