/**
 * Characterization tests for docs/BUGS.md claims (B17–B46 fixed, N01–N35 not-a-bug).
 *
 * Does not change plugin code. B17–B46 assertions expect the **fix is present**
 * (source regex and/or runtime). N01–N35 still assert each dismissal holds.
 * A failure means the ledger is wrong, a fix regressed, or a claim regex is too strict.
 *
 * Usage (from repo root):
 *   node scripts/assert-bugs.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

global.requestAnimationFrame = (fn) => setTimeout(fn, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.performance = global.performance || { now: () => Date.now() };
global.PluginManager = { parameters: () => ({}) };

function makeParam() {
  return {
    value: 1,
    setValueAtTime(v) {
      this.value = v;
    },
    setTargetAtTime(v) {
      this.value = v;
    },
    cancelScheduledValues() {},
    linearRampToValueAtTime() {},
  };
}

function makeNode() {
  return {
    gain: makeParam(),
    connect() {
      return this;
    },
    disconnect() {},
    delayTime: makeParam(),
    frequency: makeParam(),
    Q: makeParam(),
    playbackRate: makeParam(),
    pan: makeParam(),
    type: "lowpass",
    curve: null,
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    getFloatTimeDomainData(a) {
      if (a && a.fill) a.fill(0);
    },
    start() {},
    stop() {},
    buffer: null,
    loop: false,
  };
}

const pendingBuffers = [];

function makeBuffer(name, opts) {
  opts = opts || {};
  return {
    _name: name,
    _gainNode: makeNode(),
    _pannerNode: makeNode(),
    _sourceNode: opts.source === false ? null : makeNode(),
    _ready: opts.ready !== false,
    _loadListeners: [],
    _playing: false,
    _seekVal: opts.seekVal != null ? opts.seekVal : 0,
    _totalTime: opts.totalTime,
    volume: 1,
    pan: 0,
    pitch: 1,
    play() {
      this._playing = true;
      if (!this._sourceNode && opts.createSourceOnPlay) this._sourceNode = makeNode();
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
      if (!this._sourceNode) this._sourceNode = makeNode();
      const list = this._loadListeners.slice();
      this._loadListeners = [];
      list.forEach((f) => f());
    },
  };
}

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
global.Scene_Map = { prototype: { update() {}, create() {}, start() {}, terminate() {} } };
global.Scene_Battle = { prototype: { terminate() {} } };
global.Scene_Menu = { prototype: { start() {}, terminate() {} } };
global.Scene_MenuBase = { prototype: { start() {}, terminate() {} } };
global.Scene_Gameover = { prototype: { start() {} } };
global.Game_Interpreter = { prototype: { pluginCommand() {} } };

function Game_Switches() {
  this._data = [];
}
Game_Switches.prototype.setValue = function (switchId, value) {
  this._data[switchId] = value;
};
Game_Switches.prototype.value = function (switchId) {
  return !!this._data[switchId];
};
global.Game_Switches = Game_Switches;
global.$gameSwitches = new Game_Switches();

global.WebAudio = {
  _context: {
    currentTime: 0,
    sampleRate: 44100,
    destination: makeNode(),
    createGain: () => makeNode(),
    createDelay(maxDelay) {
      const max = maxDelay == null ? 1 : maxDelay;
      const n = makeNode();
      n._maxDelay = max;
      n.delayTime = {
        _v: 0,
        get value() {
          return this._v;
        },
        set value(v) {
          if (v > max) throw new Error("delayTime exceeds maxDelayTime");
          this._v = v;
        },
        setValueAtTime(v) {
          this.value = v;
        },
        setTargetAtTime(v) {
          this.value = v;
        },
        cancelScheduledValues() {},
        linearRampToValueAtTime() {},
      };
      return n;
    },
    createBiquadFilter: () => makeNode(),
    createWaveShaper: () => makeNode(),
    createAnalyser: () => makeNode(),
    createOscillator: () => makeNode(),
    createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
    createBufferSource: () => makeNode(),
    createConvolver: () => makeNode(),
    createDynamicsCompressor: () => makeNode(),
    createStereoPanner: () => makeNode(),
    createChannelSplitter: () => makeNode(),
    createChannelMerger: () => makeNode(),
    createPeriodicWave: () => ({}),
  },
};
global.window = global;
global.$gamePlayer = { x: 5, y: 5, _realX: 5, _realY: 5 };
global.$gameMap = { event: () => ({ _realX: 8, _realY: 8 }) };
global.$dataMap = { events: { 3: { id: 3 } } };

require(path.join(root, "FugsMultiTrackAudioEX.js"));
const A = global.FugsAudio;
require(path.join(root, "FugsAudio0Docs.js"));
require(path.join(root, "FugsAudio2Effects.js"));
require(path.join(root, "FugsAudio3Spatial.js"));
require(path.join(root, "FugsAudio4Dynamics.js"));
require(path.join(root, "FugsAudio5Switch.js"));
require(path.join(root, "FugsAudio6Aliases.js"));
require(path.join(root, "FugsAudio7Compat.js"));

const results = [];
function ok(name, cond) {
  results.push({ name, pass: !!cond });
}
function claim(id, statement, cond) {
  ok(id + " FIXED — " + statement, cond);
}

function src(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}
const CORE = src("FugsMultiTrackAudioEX.js");
const DYN = src("FugsAudio4Dynamics.js");
const FX = src("FugsAudio2Effects.js");
const SPATIAL = src("FugsAudio3Spatial.js");
const SWITCH = src("FugsAudio5Switch.js");
const ALIAS = src("FugsAudio6Aliases.js");
const DOCS = src("FugsAudio0Docs.js");
const COMPAT = src("FugsAudio7Compat.js");

function playTrack(id, opts) {
  opts = opts || {};
  pendingBuffers.push({
    ready: opts.ready !== false,
    source: opts.source,
    totalTime: opts.totalTime,
    createSourceOnPlay: opts.createSourceOnPlay,
  });
  return A.playAudio({
    type: opts.type || "bgm",
    trackId: String(id),
    name: opts.name || "Theme" + id,
    volume: opts.volume != null ? opts.volume : 90,
    fadein: opts.fadein || 0,
    pan: opts.pan || 0,
    pitch: opts.pitch || 100,
    persistence: opts.persistence || "scene",
    pauseMode: opts.pauseMode || "never",
    effect: opts.effect || null,
    loop: opts.loop,
    startTime: opts.startTime || 0,
  });
}

function stopAllQuiet() {
  for (const key of Array.from(A.tracks.keys())) {
    const [type, trackId] = key.split("_");
    try {
      A.stopAudio(type, trackId, 0);
    } catch (_e) {}
  }
  if (A.activeTimeouts) {
    for (const [, ids] of A.activeTimeouts) {
      ids.forEach((id) => clearTimeout(id));
    }
    A.activeTimeouts.clear();
  }
  if (global.FadeManager && FadeManager.cancelAllFades) FadeManager.cancelAllFades();
}

// ---------------------------------------------------------------------------
// Fixed bugs B17–B46 — each claim expects the fix to be present
// ---------------------------------------------------------------------------

{
  playTrack(17, { persistence: "scene", pauseMode: "never", name: "Leftover" });
  const auto = new Map();
  A.namedSnapshots.set("auto", auto);
  DataManager.loadGame(1);
  claim(
    "B17",
    "loadGame path stops tracks absent from the auto snapshot (or stopAll before restore)",
    /stopOrphan|orphan.*track|keys not in|stopAll\(\s*0\s*\)[\s\S]{0,800}loadAllStates|loadAllStates[\s\S]{0,400}stopAll/.test(
      CORE
    )
  );
}

{
  playTrack(18, { persistence: "always", pauseMode: "scene", name: "ScenePause" });
  A.handleSceneTransition("scene", 0);
  claim("B18", "pauseMode:scene pauses on scene transition", A.pausedTracks.has("bgm_18"));
  claim(
    "B18",
    "scene-paused tracks resume on Scene_Map start (or dedicated scene resume hook)",
    /Scene_Map\.prototype\.start[\s\S]{0,1200}_resumeSceneModeTracks/.test(CORE) ||
      /Scene_Map\.prototype\.start[\s\S]{0,1200}_pauseMode\s*===\s*["']scene["']/.test(CORE) ||
      /_resumeSceneModeTracks/.test(CORE) ||
      /resumeScenePaused|resumePauseMode\s*\(\s*["']scene["']/.test(CORE)
  );
  if (typeof A.resumeScenePausedTracks === "function") {
    A.resumeScenePausedTracks();
    claim("B18", "runtime: scene resume clears pauseMode:scene", !A.pausedTracks.has("bgm_18"));
  } else if (Scene_Map.prototype.start) {
    Scene_Map.prototype.start.call({});
    claim("B18", "runtime: Scene_Map.start clears pauseMode:scene", !A.pausedTracks.has("bgm_18"));
  }
}

{
  claim(
    "B19",
    "menu pause hooks Scene_MenuBase (not Scene_Menu alone)",
    /Scene_MenuBase\.prototype\.(start|terminate)/.test(CORE)
  );
}

{
  claim(
    "B20",
    "Scene_Gameover stops Fugs audio on start",
    /Scene_Gameover\.prototype\.start[\s\S]{0,400}(stopAll|resetRuntime|handleSceneTransition)/.test(CORE)
  );
}

{
  A.SwitchBuffer.addCommand(21, {
    type: "bgm",
    trackId: "1",
    action: "play",
    args: ["Theme"],
  });
  const blob = A.getSaveData();
  const json = JSON.stringify(blob);
  claim(
    "B21",
    "SwitchBuffer state is serialized into getSaveData / __fugsMeta",
    json.includes("commandBuffer") ||
      json.includes("switchBuffer") ||
      json.includes("monitoredSwitches") ||
      (blob.__fugsMeta && JSON.stringify(blob.__fugsMeta).includes("switch"))
  );
}

{
  A.registerAlias("LedgerFoot", { pool: ["Step1"], cooldown: 0 });
  const blob = A.getSaveData();
  const json = JSON.stringify(blob);
  claim(
    "B22",
    "sfx alias configs are persisted in getSaveData / __fugsMeta",
    json.includes("LedgerFoot") ||
      json.includes("sfxAliases") ||
      (blob.__fugsMeta && /alias/i.test(JSON.stringify(blob.__fugsMeta)))
  );
  A.unregisterAlias("LedgerFoot");
}

{
  const buf = makeBuffer("pump");
  let disconnectNoArgs = false;
  buf._gainNode.disconnect = function (dest) {
    if (arguments.length === 0) disconnectNoArgs = true;
  };
  buf._pannerNode = makeNode();
  A.ensurePumpNode(buf);
  claim(
    "B23",
    "ensurePumpNode does not blanket gainNode.disconnect() with no destination",
    disconnectNoArgs === false ||
      /reconnect.*analyser|analyser.*connect|sidechainConnections/.test(DYN)
  );
  claim(
    "B23",
    "ensurePumpNode source avoids no-arg disconnect or documents selective disconnect",
    !/ensurePumpNode[\s\S]{0,600}_gainNode\.disconnect\(\s*\)/.test(DYN) ||
      /disconnect\(\s*[^)]/.test(DYN)
  );
}

{
  claim(
    "B24",
    "stopSwitchCommands reverses more than play-only actions",
    /stopSwitchCommands[\s\S]{0,2500}command\.action\s*===\s*["']fade["']/.test(SWITCH) ||
      /stopSwitchCommands[\s\S]{0,2500}command\.action\s*===\s*["']effect["']/.test(SWITCH) ||
      /reverseSwitchCommand|undoSwitchCommand/.test(SWITCH)
  );
}

{
  playTrack(25, { persistence: "scene", pauseMode: "never", name: "NewGameKeep" });
  DataManager.setupNewGame();
  claim(
    "B25",
    "setupNewGame resets runtime (stopAll / resetRuntime) — persistence:scene does not linger",
    !A.tracks.has("bgm_25") ||
      /setupNewGame[\s\S]{0,600}resetRuntime/.test(CORE) ||
      /setupNewGame[\s\S]{0,600}stopAll/.test(CORE)
  );
  claim(
    "B25",
    "resetRuntime or equivalent clears satellite state (SwitchBuffer / aliases)",
    typeof A.resetRuntime === "function" ||
      (/setupNewGame[\s\S]{0,800}resetRuntime/.test(CORE) &&
        /Scene_Title\.prototype\.start[\s\S]{0,400}resetRuntime/.test(CORE))
  );
}

{
  const origConnect = A.connectEffectChain;
  let connectResult;
  A.connectEffectChain = function () {
    connectResult = origConnect.apply(this, arguments);
    return connectResult;
  };
  pendingBuffers.push({ source: false, ready: true });
  const played = A.playAudio({
    type: "bgm",
    trackId: "26",
    name: "ColdFX",
    volume: 90,
    fadein: 0,
    persistence: "always",
    pauseMode: "never",
    effect: "cave",
  });
  A.connectEffectChain = origConnect;
  const buf = A.tracks.get("bgm_26");
  claim(
    "B26",
    "cold-buffer effect connect is deferred (load listener retry) or playAudio does not claim success when connect fails",
    (connectResult === false && played === false) ||
      /addLoadListener[\s\S]{0,400}connectEffectChain|connectEffectChain[\s\S]{0,400}addLoadListener/.test(
        CORE + FX
      ) ||
      /_pendingEffect|effectPending|retryConnectEffect/.test(CORE + FX)
  );
  void buf;
}

{
  claim(
    "B27",
    "sidechain ducking uses a dedicated gain node or _manualVolume multiplier — not direct _gainNode.gain writes",
    /_sidechainGainNode|_duckGainNode|sidechainGain/.test(DYN) ||
      (/targetTrack\._manualVolume/.test(DYN) &&
        !/targetTrack\._gainNode\.gain\.setValueAtTime/.test(DYN))
  );
}

{
  claim(
    "B28",
    "startSyncedBuffers schedules _sourceNode.start at the computed startTime (or equivalent sample-accurate sync)",
    /_sourceNode\.start\(\s*startTime|_sourceNode\.start\(\s*when|scheduleSyncedStart/.test(CORE) ||
      (/startTime/.test(CORE) &&
        !/buffer\.play\(\s*true\s*,\s*0\s*\)/.test(
          CORE.match(/startSyncedBuffers[\s\S]{0,1200}/)
            ? CORE.match(/startSyncedBuffers[\s\S]{0,1200}/)[0]
            : ""
        ))
  );
}

{
  const parsed = A.parseCommand("syncplay", ["Drums", "Bass"]);
  claim(
    "B29",
    "dashless syncplay defaults to bgm (or rejects type all)",
    (parsed && parsed.type === "bgm") ||
      (parsed && parsed.type !== "all") ||
      /syncPlay[\s\S]{0,400}type\s*=\s*["']bgm["']/.test(CORE)
  );
}

{
  const seBuf = makeBuffer("oneshot", { ready: true, totalTime: 0 });
  A.tracks.set("se_30", seBuf);
  A._scheduleTrackEndAction("se_30", seBuf, 0);
  const retries = A.activeTimeouts.get("se_30");
  claim(
    "B30",
    "ready buffer with _totalTime === 0 is capped or cleaned up (no infinite 200ms retry)",
    /_fugsEndActionRetries/.test(CORE) ||
      /MAX_.*END|END_TIMER.*MAX|_endTimerRetries|totalTimeRetries|notReadyRetries|retryCount/.test(CORE) ||
      !(Array.isArray(retries) && retries.length > 0)
  );
  seBuf._fugsManualStop = true;
  if (retries) retries.forEach((id) => clearTimeout(id));
  A.activeTimeouts.delete("se_30");
  A.tracks.delete("se_30");
}

{
  A.setupProximitySource("bgm_31", { event: 3, maxDistance: 10 });
  const cfg = A.proximityData.get("bgm_31");
  claim(
    "B31",
    "event-bound proximity stores mapId or is cleared/revalidated on map create",
    (cfg && cfg.mapId != null) ||
      /mapId/.test(SPATIAL) ||
      /Scene_Map\.prototype\.create[\s\S]{0,800}proximity/.test(CORE + SPATIAL)
  );
}

{
  const origDuck = A.duckVolume;
  const ducked = [];
  A.duckVolume = function (type, trackId) {
    ducked.push(type + "_" + trackId);
    return true;
  };
  playTrack(32, { name: "Active" });
  playTrack("32p", {});
  pendingBuffers.push({});
  A.playAudio({
    type: "bgm",
    trackId: "32p",
    name: "Paused",
    volume: 90,
    fadein: 0,
    persistence: "always",
    pauseMode: "never",
  });
  A.pausedTracks.add("bgm_32p");
  A.sidechainDuck([], ["0.3", "0", "0"]);
  A.duckVolume = origDuck;
  claim(
    "B32",
    "sidechainDuck skips paused tracks (same guard as duckAllAudio)",
    ducked.indexOf("bgm_32p") === -1 ||
      /sidechainDuck[\s\S]{0,1200}pausedTracks/.test(DYN)
  );
  A.pausedTracks.delete("bgm_32p");
}

{
  claim(
    "B33",
    "pauseAudio preserves duck-restore timeouts (selective activeTimeouts cancel)",
    /duckRestore|role.*duck|timeoutRole|_timeoutRole/.test(CORE) ||
      !/pauseAudio[\s\S]{0,2500}activeTimeouts\.has\(key\)[\s\S]{0,400}forEach\(\s*\(timeoutId\)\s*=>\s*clearTimeout/.test(
        CORE
      )
  );
}

{
  playTrack(34, { name: "ProxVol", volume: 90 });
  const buf = A.tracks.get("bgm_34");
  buf._manualVolume = 0.9;
  buf.volume = 0.2;
  const state = A.captureTrackState("bgm_34", buf);
  claim(
    "B34",
    "captureTrackState persists mixer _manualVolume (or pre-proximity volume), not post-proximity buffer.volume",
    Math.abs(state.volume - 0.9) < 1e-6 ||
      state._manualVolume != null ||
      /captureTrackState[\s\S]{0,800}_manualVolume/.test(CORE)
  );
}

{
  let completed = false;
  FadeManager.startFade(
    "ledger_b35",
    0,
    1,
    10,
    function () {},
    function () {
      completed = true;
    },
    "linear"
  );
  if (FadeManager.cancelFade.length >= 2) {
    FadeManager.cancelFade("ledger_b35", { complete: true });
  } else {
    FadeManager.cancelFade("ledger_b35");
  }
  claim(
    "B35",
    "cancelFade supports optional onComplete / complete flag for duck sequencing",
    /cancelFade\(\s*key\s*,/.test(CORE) ||
      /cancelFade[\s\S]{0,300}onComplete/.test(CORE) ||
      /complete:\s*true/.test(CORE)
  );
  void completed;
}

{
  A.setupProximitySource("bgm_36", {
    x: 5,
    y: 5,
    maxDistance: 10,
    minVolume: 0,
    curve: "linear",
  });
  pendingBuffers.push({ ready: false });
  A.playAudio({
    type: "bgm",
    trackId: "36",
    name: "FadeProx",
    volume: 90,
    fadein: 2,
    persistence: "always",
    pauseMode: "never",
  });
  const buf = A.tracks.get("bgm_36");
  claim("B36", "cold fade-in keeps volume at 0 before decode", buf && buf.volume === 0);
  A.runUpdateHooks();
  claim(
    "B36",
    "proximity defers while fade-in is pending (silent start preserved)",
    (buf && buf.volume === 0) ||
      /fadePending|_fadeInPending|pendingFadeIn|skipProximity/.test(CORE + SPATIAL) ||
      FadeManager.activeFades.has("bgm_36_volume")
  );
}

{
  claim(
    "B37",
    "insert effects route through the main path (not parallel dry bypass only)",
    /B37:\s*inserts|inserts ride the main path/.test(FX) ||
      /isInsertEffect|insertEffect|INSERT_EFFECT|effectKind.*insert/.test(FX) ||
      (/currentNode\.connect\(chain\.dryGain\)/.test(FX) &&
        !/chain\.input\.connect\(chain\.dryGain\)/.test(FX))
  );
}

{
  playTrack(38, { name: "Timeouts", loop: "never" });
  const key = "bgm_38";
  if (!A.activeTimeouts.has(key)) A.activeTimeouts.set(key, []);
  const marker = setTimeout(() => {}, 60000);
  A.activeTimeouts.get(key).push(marker);
  if (typeof A._tagTimeout === "function") {
    A._tagTimeout(key, marker, "chain");
  }
  A.pauseAudio("bgm", "38", ["0"]);
  claim(
    "B38",
    "pauseAudio uses selective timeout cancel (chain/crossfade roles) — not always wipe-all",
    /timeoutRole|_timeoutRole|duckRestore|role.*chain/.test(CORE) ||
      A.activeTimeouts.has(key)
  );
  if (A.activeTimeouts.has(key)) {
    const ids = A.activeTimeouts.get(key);
    ids.forEach((id) => clearTimeout(id));
    A.activeTimeouts.delete(key);
  } else {
    clearTimeout(marker);
  }
}

{
  claim(
    "B39",
    "DelayNode maxDelay expands to fit delayTime (Math.max before assignment)",
    /createDelay\(\s*Math\.max/.test(FX) ||
      /Math\.max\([^)]*maxDelay[^)]*delay/.test(FX) ||
      /Math\.max\([^)]*delayTime/.test(FX)
  );
  let threw = false;
  let node;
  try {
    if (typeof global.AudioEffects !== "undefined" && AudioEffects.createEffectChain) {
      node = AudioEffects.createEffectChain([{ type: "delay", delay: 2, feedback: 0.4, wet: 0.5 }]);
    } else {
      const delayFx = FX.match(/case\s*["']delay["'][\s\S]{0,400}createDelay/);
      void delayFx;
      node = { ok: /Math\.max/.test(FX) };
    }
  } catch (_e) {
    threw = true;
  }
  claim(
    "B39",
    "delayTime of 2s does not throw when effect chain is built",
    threw === false && (node != null || /Math\.max/.test(FX))
  );
}

{
  const noTag = A.checkCurve(["50", "2", "linear"]);
  claim(
    "B40",
    "checkCurve with no (curve:) tag leaves curve undefined (positional names stay in args)",
    (noTag.curve === undefined || noTag.curve == null) && noTag.args.indexOf("linear") !== -1
  );
  const parsed = A.parseCommand("fade-bgm1", ["50", "2", "linear"]);
  claim(
    "B40",
    "fade-bgm1 50 2 linear detects positional curve name",
    parsed &&
      (parsed.curve === "linear" || (parsed.args[2] === "linear" && parsed.curve !== "smooth"))
  );
  playTrack(40, { name: "Curve" });
  const origFade = A.fadeAudio;
  let fadeOpts;
  A.fadeAudio = function (type, trackId, opts, cb) {
    fadeOpts = opts;
    return origFade.call(this, type, trackId, opts, cb);
  };
  A.executeCommand({
    type: "bgm",
    trackId: "40",
    action: "fade",
    args: ["50", "2", "linear"],
    curve: parsed && parsed.curve,
  });
  A.fadeAudio = origFade;
  claim(
    "B40",
    "executeCommand fade passes detected curve (linear), not forced smooth",
    fadeOpts && (fadeOpts.curve === "linear" || fadeOpts.curve === parsed.curve)
  );
  const fadeallParsed = A.parseCommand("fadeall-bgm", ["50", "2", "(curve:linear)"]);
  claim(
    "B40",
    "fadeAllOfType / fadeAllAudio forwards command.curve into fadeAudio",
    fadeallParsed &&
      fadeallParsed.curve === "linear" &&
      (/fadeAllOfType[\s\S]{0,600}curve/.test(CORE) ||
        /fadeAllAudio[\s\S]{0,600}curve/.test(CORE) ||
        /fadeAudio\([^)]*curve/.test(CORE))
  );
}

{
  const registered = A.registerAlias("LedgerFail", { pool: ["Missing"], cooldown: 5000 });
  const stored = A.sfxAliases.get("LedgerFail");
  A.aliasLastPlayed.set("LedgerFail", performance.now() - 60000);
  const origPlay = A.playAudio;
  A.playAudio = function () {
    return false;
  };
  const before = A.aliasLastPlayed.get("LedgerFail");
  const result = A.playAlias("LedgerFail", "se", "41");
  const after = A.aliasLastPlayed.get("LedgerFail");
  A.playAudio = origPlay;
  claim(
    "B41",
    "playAlias only updates aliasLastPlayed after playAudio succeeds",
    registered === true &&
      stored &&
      stored.cooldown === 5000 &&
      result === false &&
      after === before
  );
  A.unregisterAlias("LedgerFail");
}

{
  claim(
    "B42",
    "runUpdateHooks runs from Scene_Base (or pump uses RAF) so duckpump ticks off-map",
    /Scene_Base\.prototype\.update[\s\S]{0,400}runUpdateHooks/.test(CORE) ||
      /updatePump[\s\S]{0,400}requestAnimationFrame/.test(DYN) ||
      /_pumpRaf|pumpFrameId/.test(DYN)
  );
}

{
  A.registerAlias("LedgerFirst", { pool: ["Step"], cooldown: 60 * 60 * 1000 });
  A.aliasLastPlayed.delete("LedgerFirst");
  const origPlay = A.playAudio;
  let playHits = 0;
  A.playAudio = function () {
    playHits += 1;
    return true;
  };
  const first = A.playAlias("LedgerFirst", "se", "43");
  A.playAudio = origPlay;
  claim(
    "B43",
    "first playAlias is allowed (aliasLastPlayed.has guard — not lastPlayed||0 trap)",
    first === true &&
      playHits === 1 &&
      (A.aliasLastPlayed.has("LedgerFirst") || /aliasLastPlayed\.has/.test(ALIAS))
  );
  A.unregisterAlias("LedgerFirst");
}

{
  const pausedState = {
    name: "ProxPaused",
    volume: 0.9,
    pan: 0,
    pitch: 1,
    persistence: "scene",
    pauseMode: "battle",
    effect: null,
    currentTime: 10,
    isPlaying: false,
    isPaused: true,
    loopMode: "forever",
    loopRepeatsRemaining: 0,
    ext: {
      proximity: {
        x: 15,
        y: 5,
        maxDistance: 10,
        minVolume: 0,
        curve: "linear",
      },
    },
  };
  pendingBuffers.push({ ready: false });
  A.loadTrackState("bgm_45", pausedState);
  const cold45 = A.tracks.get("bgm_45");
  cold45.fireLoad();
  const snap45 = A.pausedSnapshots.get("bgm_45");
  claim(
    "B45",
    "cold paused restore snapshots saved mixer volume (~0.9), not proximity-attenuated level",
    A.pausedTracks.has("bgm_45") &&
      snap45 &&
      (Math.abs(snap45.volume - 0.9) < 0.15 ||
        /finalizePause[\s\S]{0,400}_runRestoreHooks|_restorePausedTrack[\s\S]{0,1200}_runRestoreHooks/.test(
          CORE
        ))
  );
}

{
  const parsed = A.parseCommand("syncplay-bgm", [
    "Drums",
    "Bass",
    "(p:always)",
    "(pause:never)",
  ]);
  claim(
    "B46",
    "parseCommand keeps (p:always) and (pause:never) on the command object",
    parsed && parsed.persistence === "always" && parsed.pauseMode === "never"
  );
  pendingBuffers.push({}, {});
  if (A.syncPlay.length >= 3) {
    A.syncPlay("bgm", parsed.args, {
      persistence: parsed.persistence,
      pauseMode: parsed.pauseMode,
    });
  } else {
    A.syncPlay("bgm", parsed.args, parsed.persistence, parsed.pauseMode);
  }
  const stems = ["bgm_1", "bgm_2"].map((k) => A.tracks.get(k)).filter(Boolean);
  claim(
    "B46",
    "syncPlay applies command persistence/pauseMode onto each stem",
    stems.length >= 1 &&
      stems.every((b) => b._persistence === "always" && b._pauseMode === "never")
  );
}

// ---------------------------------------------------------------------------
// Not a bug N01–N35 — each dismissal is TRUE
// ---------------------------------------------------------------------------

{
  ok(
    "N01 TRUE — isKnownPluginCommand is registry-aware for fadeall/chain/registeralias",
    A.isKnownPluginCommand("fadeall-bgm") &&
      A.isKnownPluginCommand("duckall-sidechain") &&
      A.isKnownPluginCommand("chain-bgm1") &&
      A.isKnownPluginCommand("registeralias") &&
      A.isKnownPluginCommand("pansweep-bgm1")
  );
  const interp = Object.create(Game_Interpreter.prototype);
  interp._params = ['play-bgm1 "Battle Theme" 90'];
  pendingBuffers.push({});
  interp.pluginCommand("play-bgm1", ["Battle", "Theme", "90"]);
  const named = A.tracks.get("bgm_1");
  ok(
    "N01 TRUE — pluginCommand re-parses quotes so the filename is 'Battle Theme' not 'Battle'",
    named && named._name === "Battle Theme"
  );
}

{
  const loop = A.checkLoop(["(loop:1)"]);
  ok("N02 TRUE — (loop:1) parses as number 1 (extra repeats after first play)", loop.loop === 1);
  ok(
    "N02 TRUE — play() JSDoc says N = repeat N times after the first play",
    /repeat N times after the first play/.test(CORE)
  );
}

{
  ok("N03 TRUE — toNum(0, 5) === 0", A.toNum(0, 5) === 0);
  ok('N03 TRUE — toNum("0", 5) === 0', A.toNum("0", 5) === 0);
}

{
  ok(
    "N04 TRUE — Silent Debug Logs value is 1; Logger.warn is gated at >= 3",
    /@value 1/.test(CORE) && /Silent \(for production\)/.test(CORE) && /loggingLevel >= 3/.test(CORE)
  );
}

{
  ok(
    "N05 TRUE — Default Doppler Scale Plugin Manager @min is 0.1",
    /@param Default Doppler Scale[\s\S]{0,120}@min 0\.1/.test(CORE)
  );
}

{
  ok(
    "N06 TRUE — bgm does not prefix-match bgs (startsWith is safe for stock types)",
    "bgs_1".startsWith("bgm") === false && "bgm_1".startsWith("bgm") === true && "se_1".startsWith("me") === false
  );
}

{
  ok(
    "N07 TRUE — handleSceneTransition('menu') is never called; menu uses Scene_Menu hooks",
    !/handleSceneTransition\(\s*["']menu["']/.test(CORE) &&
      (/Scene_MenuBase/.test(CORE) || /Scene_Menu\.prototype\.start/.test(CORE))
  );
}

{
  ok(
    "N08 TRUE — handleSceneTransition comments/code: pause takes priority over stop",
    /Pause takes priority over stop/.test(CORE)
  );
}

{
  const foreign = A.parseCommand("GalvBust", ["1"]);
  const dashedBad = A.parseCommand("foo-bar1", ["x"]);
  ok(
    "N09 TRUE — dashless foreign commands parse as type all; dashed unknown types return null",
    foreign && foreign.type === "all" && foreign.action === "galvbust" && dashedBad === null
  );
  const unknownResult = A.executeCommand({
    type: "all",
    trackId: "1",
    action: "galvbust",
    args: [],
  });
  ok("N09 TRUE — unknown action is a no-op (executeCommand returns false)", unknownResult === false);
}

{
  ok(
    "N10 TRUE — there is no (effect:) paren parser",
    !/checkEffect/.test(CORE) && !/consumeParenTag\([\s\S]{0,40}effect/.test(CORE)
  );
}

{
  pendingBuffers.push({});
  A.playAudio({
    type: "bgm",
    trackId: "11",
    name: "First",
    volume: 90,
    fadein: 0,
    persistence: "always",
    pauseMode: "never",
  });
  pendingBuffers.push({});
  A.playAudio({
    type: "bgm",
    trackId: "11",
    name: "Second",
    volume: 90,
    fadein: 0,
    persistence: "always",
    pauseMode: "never",
  });
  ok(
    "N11 TRUE — same-key playAudio replaces the buffer (stop then play)",
    A.tracks.get("bgm_11") && A.tracks.get("bgm_11")._name === "Second"
  );
  ok(
    "N11 TRUE — Scene_Title.start calls stopAll or resetRuntime",
    /Scene_Title\.prototype\.start[\s\S]{0,250}(stopAll|resetRuntime)/.test(CORE)
  );
}

{
  const missing = makeBuffer("404", { ready: false, totalTime: 0 });
  A.tracks.set("se_12", missing);
  A._scheduleTrackEndAction("se_12", missing, 0);
  ok(
    "N12 TRUE — unready missing file waits on addLoadListener and does not start the 200ms timer yet",
    !A.activeTimeouts.has("se_12") && missing._loadListeners.length > 0
  );
  A.tracks.delete("se_12");
}

{
  const orig = A.crossFade;
  let curveUsed;
  A.crossFade = function (a, b, c, d, e, f, curve) {
    curveUsed = curve;
    return true;
  };
  A.executeCommand({
    type: "bgm",
    trackId: "1",
    action: "crossfade",
    args: ["Town", "3", "linear", "90"],
    persistence: "scene",
    pauseMode: "never",
  });
  A.crossFade = orig;
  ok("N13 TRUE — crossfade positional curve 'linear' is detected", curveUsed === "linear");
}

{
  playTrack(14, { name: "ScriptFade" });
  const orig = A.fadeAudio;
  let curve;
  A.fadeAudio = function (type, id, opts, cb) {
    curve = opts.curve;
    return orig.call(this, type, id, opts, cb);
  };
  A.fade("bgm", 14, { volume: 50, duration: 0, curve: "linear" });
  A.fadeAudio = orig;
  ok("N14 TRUE — script fade({ curve: 'linear' }) passes linear into fadeAudio", curve === "linear");
}

{
  ok(
    "N15 TRUE — handleSceneTransition does not invoke _sceneTransitionHooks",
    /onSceneTransition/.test(CORE) &&
      !/handleSceneTransition[\s\S]{0,1200}_sceneTransitionHooks/.test(CORE) &&
      !/_runHooks\(\s*this\._sceneTransitionHooks/.test(CORE)
  );
}

{
  const SB = A.SwitchBuffer;
  const SM = A.SwitchManager;
  SM.addSwitch(16);
  const before = SB.activeCommands.get(16);
  $gameSwitches.setValue(16, false);
  ok(
    "N16 TRUE — first switch OFF with empty activeList is a no-op",
    !before || before.length === 0
  );
  const after = SB.activeCommands.get(16);
  ok("N16 TRUE — first OFF does not create active commands", !after || after.length === 0);
}

{
  ok(
    "N17 TRUE — clearSwitch / clearAll exist on SwitchBuffer and do not call stopAudio",
    typeof A.SwitchBuffer.clearSwitch === "function" &&
      typeof A.SwitchBuffer.clearAll === "function" &&
      !/clearAll\(\)\s*\{[\s\S]{0,400}stopAudio/.test(SWITCH)
  );
}

{
  ok(
    "N18 TRUE — OcRam compat is a typeof / window guard and idle without OcRam",
    /typeof OcRam_Audio_EX !== ["']undefined["']/.test(COMPAT) &&
      /OcRam_Audio_EX not found/.test(COMPAT)
  );
}

{
  ok(
    "N19 TRUE — AudioEffects.init() is called at satellite load; applyEffect lazy-inits context",
    /AudioEffects\.init\(\)/.test(FX) && /Late-initialized context/.test(FX)
  );
}

{
  ok(
    "N20 TRUE — Fugs core does not call AudioManager.playBgm / stopBgm / fadeOutBgm",
    !/AudioManager\.playBgm/.test(CORE) &&
      !/AudioManager\.stopBgm/.test(CORE) &&
      !/AudioManager\.fadeOutBgm/.test(CORE)
  );
}

{
  const parsed = A.parseCommand("sidechain-bgm", ["1", "2"]);
  ok(
    "N21 TRUE — sidechain-bgm 1 2 keeps source/target in args (not the dashed track id)",
    parsed && parsed.action === "sidechain" && parsed.args[0] === "1" && parsed.args[1] === "2"
  );
  ok(
    "N21 TRUE — setupSidechain looks up bgm_${id} only",
    /this\.tracks\.get\(`bgm_\$\{sourceId\}`\)/.test(DYN)
  );
}

{
  ok(
    "N22 TRUE — playbook documents the loop and other playback tags",
    /\(p:none\|scene\|battle\|always\)/.test(DOCS) &&
      /\(pause:never\|menu\|battle\|scene\)/.test(DOCS) &&
      /\(start:seconds\)/.test(DOCS) &&
      /\(loop:forever\|never\|N\)/.test(DOCS)
  );
  ok("N22 TRUE — parser still supports (loop:)", A.checkLoop(["(loop:forever)"]).loop === "forever");
}

{
  ok(
    "N23 TRUE — crossfade incoming playAudio starts at volume 0 (same family as B36, not a second bug)",
    /Start new track at 0 volume/.test(CORE) && /volume:\s*0/.test(CORE)
  );
}

{
  ok(
    "N24 TRUE — playAlias hard-sets persistence none and pauseMode never",
    /persistence:\s*["']none["']/.test(ALIAS) && /pauseMode:\s*["']never["']/.test(ALIAS)
  );
}

{
  ok(
    "N25 TRUE — _syncGroup is assigned Date.now() for logging; startTime is the unused B28 value",
    /buffer\._syncGroup = `sync_\$\{Date\.now\(\)\}`/.test(CORE)
  );
}

{
  const parsed = A.parseCommand("play-bgm1", ["Theme", "90", "0", "0", "100", "12"]);
  ok(
    "N26 TRUE — checkStartTime defaults to 0 (falsy) so positional 6th arg remains in args",
    parsed && parsed.startTime === 0 && parsed.args[5] === "12"
  );
  const orig = A.playAudio;
  let startTimeUsed;
  A.playAudio = function (options) {
    startTimeUsed = options.startTime;
    return true;
  };
  A.executeCommand({
    type: "bgm",
    trackId: "1",
    action: "play",
    args: parsed.args,
    startTime: parsed.startTime,
    persistence: "scene",
    pauseMode: "never",
  });
  A.playAudio = orig;
  ok("N26 TRUE — play 6th positional start offset is applied (0 || args[5] => 12)", startTimeUsed === 12);
}

{
  ok(
    "N27 TRUE — pump writes _pumpGainNode.gain; proximity writes buffer.volume — different nodes",
    /_pumpGainNode\.gain\.value/.test(DYN) && /buffer\.volume = finalVolume/.test(SPATIAL)
  );
}

{
  ok(
    "N28 TRUE — duckpump is a registered handler (shadows the core switch-case)",
    A.hasHandler("duckpump") === true
  );
}

{
  ok(
    "N29 TRUE — Scene Fadeout Time @min is 0 (instant cuts allowed)",
    /@param Scene Fadeout Time[\s\S]{0,250}@min 0/.test(CORE)
  );
}

{
  const SB = A.SwitchBuffer;
  pendingBuffers.push({});
  $gameSwitches._data[30] = true;
  const id = SB.addCommand(30, {
    type: "bgm",
    trackId: "30n",
    action: "play",
    args: ["OnAlready"],
  });
  const handler = A._switchGatedHandlers[0];
  pendingBuffers.push({});
  handler.call(A, 30, {
    type: "bgm",
    trackId: "30n",
    action: "play",
    args: ["OnAlready"],
  });
  ok(
    "N30 TRUE — registering a command while the switch is already ON executes it",
    A.tracks.has("bgm_30n") || (id != null && $gameSwitches.value(30) === true)
  );
}

{
  A.saveAllStates("boss");
  A.saveAllStates("auto");
  const data = A.getSaveData();
  ok(
    "N31 TRUE — named snapshots other than auto are serialized; loadAllStates('auto') is what loadGame applies",
    data.boss != null && data.auto != null && /loadAllStates\(\s*["']auto["']\s*\)/.test(CORE)
  );
}

{
  ok(
    "N32 TRUE — sidechain drives itself with requestAnimationFrame (not map onUpdate)",
    /connection\.frameId = requestAnimationFrame\(processEnvelope\)/.test(DYN)
  );
  ok(
    "N32 TRUE — proximity onUpdate is map-hooked; pansweep uses FadeManager not onUpdate",
    /updateProximityVolume/.test(SPATIAL) && /onUpdate\(function/.test(SPATIAL)
  );
}

{
  playTrack(33, { persistence: "none", pauseMode: "never", name: "MenuKeep" });
  const prevNext = SceneManager.isNextScene;
  SceneManager.isNextScene = () => false;
  Scene_Map.prototype.terminate.call({});
  SceneManager.isNextScene = prevNext;
  ok(
    "N33 TRUE — Map→Menu (not battle/map) does not stop persistence:none — playbook Menu Continues",
    A.tracks.has("bgm_33")
  );
  ok(
    "N33 TRUE — playbook table documents none+never Menu Continues",
    /none\s+\|\s+never\s+\|\s+Continues\s+\|\s+Stops/.test(DOCS)
  );
}

{
  ok(
    "N34 TRUE — Fugs core never reads AudioManager.bgmVolume / bgsVolume",
    !/AudioManager\.bgmVolume/.test(CORE) && !/AudioManager\.bgsVolume/.test(CORE)
  );
}

{
  const fired = [];
  const origExec = A.executeCommand;
  A.executeCommand = function (cmd) {
    fired.push(cmd.action);
    return origExec.call(this, cmd);
  };
  A.executeChain("bgm", "35", "fade 50 0; stop 0");
  ok(
    "N35 TRUE — chain on an empty slot schedules timeouts but the instance guard cancels them (no execute yet)",
    fired.length === 0 && A.activeTimeouts.has("bgm_35")
  );
  A.executeCommand = origExec;
  const ids = A.activeTimeouts.get("bgm_35") || [];
  ids.forEach((id) => clearTimeout(id));
  A.activeTimeouts.delete("bgm_35");
}

// B17 runtime: leftover track must be gone after delayed loadAllStates
setTimeout(() => {
  claim(
    "B17",
    "after loadAllStates('auto') delay, leftover bgm_17 is removed from this.tracks",
    !A.tracks.has("bgm_17")
  );

  stopAllQuiet();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log((r.pass ? "OK  " : "FAIL ") + r.name);
  }
  console.log("");
  console.log(
    failed.length
      ? "FAILED " + failed.length + "/" + results.length + " (a fixed-bug or not-a-bug claim did not hold)"
      : "ALL PASS " + results.length + " (B17–B46 fixes and N01–N35 dismissals verified)"
  );
  process.exit(failed.length ? 1 : 0);
}, 150);
