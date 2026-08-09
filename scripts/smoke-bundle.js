/**
 * Smoke-test the concatenated soft-transition bundle (dist/…).
 * Builds first if missing/stale is not checked — always rebuilds.
 *
 * Usage: node scripts/smoke-bundle.js
 */
"use strict";

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const bundle = path.join(root, "dist", "FugsMultiTrackAudioEX.bundle.js");

const build = spawnSync(process.execPath, [path.join(__dirname, "build-bundle.js")], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status || 1);

if (!fs.existsSync(bundle)) {
  console.error("Bundle missing after build: " + bundle);
  process.exit(1);
}

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
const makeNode = () => ({ gain: makeParam(), connect() {}, disconnect() {} });
global.AudioManager = {
  createBuffer: (_t, n) => ({
    _name: n,
    _gainNode: makeNode(),
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
      return true;
    },
    seek() {
      return 0;
    },
    addLoadListener(fn) {
      fn();
    },
    volume: 1,
    pan: 0,
    pitch: 1,
  }),
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
      getFloatTimeDomainData() {},
      connect() {},
      disconnect() {},
    }),
  },
};
global.window = global;
global.$gamePlayer = { x: 1, y: 1, _realX: 1, _realY: 1 };
global.$gameMap = { event: () => null };
global.$dataMap = { events: {} };

require(bundle);
const A = global.FugsAudio;
const R = [];
const ok = (n, c) => R.push({ n, c: !!c });

ok("bundle exports FugsAudio", !!A);
ok("bundle == FugsMultiTrackAudioEX", A === global.FugsMultiTrackAudioEX);
ok("bundle has AudioEffects", !!global.AudioEffects);
ok("bundle has DistanceCurves", !!global.DistanceCurves);
ok("bundle effect handler", A.hasHandler("effect"));
ok("bundle proximity", typeof A.setupProximitySource === "function");
ok("bundle duckVolume", typeof A.duckVolume === "function");
ok("bundle SwitchBuffer", !!A.SwitchBuffer);
ok("bundle registerAlias", typeof A.registerAlias === "function");
ok("bundle play works", A.playAudio({ type: "bgm", trackId: "1", name: "X", volume: 80, fadein: 0 }));
ok("bundle stop works", A.stopAudio("bgm", "1", 0));

console.log(R.map((x) => (x.c ? "OK  " : "FAIL ") + x.n).join("\n"));
const failed = R.filter((x) => !x.c);
console.log(failed.length ? "FAILED " + failed.length : "ALL PASS " + R.length + " (bundle)");
process.exit(failed.length ? 1 : 0);
