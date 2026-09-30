/**
 * Engine harness: runs the Fugs plugin pack inside a fake RPG Maker MV or MZ.
 *
 *   const env = await createEnv({ engine: "mz" });          // MZ model
 *   const env = await createEnv({ engine: "mz", real: dir }); // real rmmz_*.js from `dir`
 *   const env = await createEnv({ engine: "mv" });          // MV model
 *
 *   env.addAudio("bgm", "Theme", { duration: 30 });
 *   env.loadPack();                                         // Plugin Manager order
 *   await env.runCommand("play-bgm1 Theme 90");             // through the engine's real dispatch
 *   await env.advance(2000);                                // virtual time (60 fps frames)
 *
 * Everything (plugin files, engine scripts, helpers) runs in ONE vm context so
 * that plugin code sees exactly the globals it would see in a game window.
 * Time is fully virtual (see clock.js); audio is the strict fake in
 * fake-webaudio.js.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createClock, FRAME_MS } = require("./clock");
const { createFakeAudio } = require("./fake-webaudio");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Plugin Manager order (see README): Core first, satellites after, Test last.
const PACK_ORDER = [
  { key: "core", file: "FugsMultiTrackAudioEX.js", name: "FugsMultiTrackAudioEX" },
  { key: "docs", file: "FugsAudio0Docs.js", name: "FugsAudio0Docs" },
  { key: "effects", file: "FugsAudio2Effects.js", name: "FugsAudio2Effects" },
  { key: "spatial", file: "FugsAudio3Spatial.js", name: "FugsAudio3Spatial" },
  { key: "dynamics", file: "FugsAudio4Dynamics.js", name: "FugsAudio4Dynamics" },
  { key: "switch", file: "FugsAudio5Switch.js", name: "FugsAudio5Switch" },
  { key: "aliases", file: "FugsAudio6Aliases.js", name: "FugsAudio6Aliases" },
  { key: "compat", file: "FugsAudio7Compat.js", name: "FugsAudio7Compat" },
  { key: "test", file: "FugsAudio8Test.js", name: "FugsAudio8Test" },
];

const ENGINE_FILES = {
  mv: ["rpg_core.js", "rpg_managers.js", "rpg_objects.js", "rpg_scenes.js", "rpg_sprites.js", "rpg_windows.js"],
  mz: ["rmmz_core.js", "rmmz_managers.js", "rmmz_objects.js", "rmmz_scenes.js", "rmmz_sprites.js", "rmmz_windows.js"],
};

/** A permissive stand-in for PIXI: enough for engine scripts to LOAD (not render). */
function makePixiStub() {
  function stubClass(name) {
    const fn = function () {};
    return new Proxy(fn, {
      get(target, prop) {
        if (prop === "prototype") return target.prototype;
        if (prop === "name") return name;
        if (!(prop in target)) {
          const isClassLike = typeof prop === "string" && /^[A-Z]/.test(prop);
          target[prop] = isClassLike ? stubClass(String(prop)) : function () {};
        }
        return target[prop];
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    });
  }
  const cache = {};
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== "string") return undefined;
        if (!cache[prop]) cache[prop] = stubClass(prop);
        return cache[prop];
      },
    }
  );
}

function fakeAudioBytes(meta) {
  const total = meta.padBytes ? meta.padBytes : 0;
  const header = "FAKEAUDIO" + JSON.stringify({ duration: meta.duration, sampleRate: meta.sampleRate, channels: meta.channels, total: total || undefined });
  const headBuf = Buffer.from(header, "latin1");
  const size = Math.max(headBuf.length, total);
  const u8 = new Uint8Array(size);
  u8.set(headBuf, 0);
  return u8;
}

async function createEnv(opts) {
  opts = opts || {};
  const engineKind = opts.engine === "mv" ? "mv" : "mz";
  const clock = createClock();
  const fa = createFakeAudio(clock, { decodeDelayMs: opts.decodeDelayMs });

  // ------------------------------------------------------------- console spy
  const logs = { log: [], info: [], warn: [], error: [], debug: [], all: [] };
  const fmt = (args) =>
    args
      .map((a) => {
        if (typeof a === "string") return a;
        if (a instanceof Error) return a.stack || a.message;
        try {
          return JSON.stringify(a);
        } catch (_e) {
          return String(a);
        }
      })
      .join(" ");
  const verbose = !!process.env.HARNESS_VERBOSE;
  const mkLog = (level) =>
    function (...args) {
      const line = fmt(args);
      logs[level].push(line);
      logs.all.push(level + ": " + line);
      if (verbose) process.stderr.write(`[${level}] ${line}\n`);
    };
  const consoleSpy = {
    log: mkLog("log"),
    info: mkLog("info"),
    warn: mkLog("warn"),
    error: mkLog("error"),
    debug: mkLog("debug"),
    trace() {},
    table() {},
    group() {},
    groupCollapsed() {},
    groupEnd() {},
    time() {},
    timeEnd() {},
  };

  // --------------------------------------------------- fake network / files
  const files = new Map(); // "audio/bgm/Theme.ogg" -> meta
  const requests = []; // every URL requested (raw, as the engine built it)
  const netState = { missingFileBehavior: "error", defaultLatencyMs: 30 };

  function lookupFile(url) {
    let p = String(url);
    try {
      p = decodeURIComponent(p);
    } catch (_e) {
      /* keep raw */
    }
    return files.get(p);
  }

  class FakeXHR {
    constructor() {
      this.status = 0;
      this.response = null;
      this.responseType = "";
      this.onload = null;
      this.onerror = null;
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    send() {
      const url = this.url;
      requests.push(url);
      const meta = lookupFile(url);
      const latency = meta && meta.latencyMs != null ? meta.latencyMs : netState.defaultLatencyMs;
      clock.api.setTimeout(() => {
        if (!meta) {
          if (netState.missingFileBehavior === "404") {
            this.status = 404;
            if (this.onload) this.onload();
          } else {
            this.status = 0;
            if (this.onerror) this.onerror();
          }
          return;
        }
        this.status = 200;
        this.response = fakeAudioBytes(meta).buffer;
        if (this.onload) this.onload();
      }, latency);
    }
  }

  // fetch() with optional chunked streaming (MZ web deployment path)
  function fakeFetch(url) {
    requests.push(url);
    const meta = lookupFile(url);
    return new Promise((resolve) => {
      clock.api.setTimeout(() => {
        if (!meta) {
          resolve({ ok: false, status: 404 });
          return;
        }
        const bytes = fakeAudioBytes(meta);
        const chunks = Math.max(1, meta.chunks || 1);
        const chunkDelay = meta.chunkDelayMs != null ? meta.chunkDelayMs : 0;
        const per = Math.ceil(bytes.length / chunks);
        let i = 0;
        const reader = {
          read() {
            return new Promise((res) => {
              const deliver = () => {
                if (i >= chunks) return res({ done: true, value: undefined });
                const part = bytes.slice(i * per, Math.min(bytes.length, (i + 1) * per));
                i++;
                res({ done: false, value: part });
              };
              if (chunkDelay > 0 && i > 0) clock.api.setTimeout(deliver, chunkDelay);
              else deliver();
            });
          },
        };
        resolve({ ok: true, status: 200, body: { getReader: () => reader } });
      }, meta ? (meta.latencyMs != null ? meta.latencyMs : netState.defaultLatencyMs) : 10);
    });
  }

  // ------------------------------------------------------------- vm sandbox
  const documentStub = {
    currentScript: null,
    visibilityState: "visible",
    body: { appendChild() {} },
    createElement(tag) {
      if (tag === "audio") return { canPlayType: () => "probably" };
      if (tag === "canvas") return { getContext: () => ({}), style: {}, addEventListener() {} };
      return { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} };
    },
    addEventListener() {},
    removeEventListener() {},
  };

  const userAgent = opts.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Safari/537.36";
  const sandbox = {
    console: consoleSpy,
    setTimeout: clock.api.setTimeout,
    clearTimeout: clock.api.clearTimeout,
    setInterval: clock.api.setInterval,
    clearInterval: clock.api.clearInterval,
    requestAnimationFrame: clock.api.requestAnimationFrame,
    cancelAnimationFrame: clock.api.cancelAnimationFrame,
    performance: clock.api.performance,
    AudioContext: fa.AudioContext,
    XMLHttpRequest: FakeXHR,
    fetch: fakeFetch,
    document: documentStub,
    navigator: { userAgent, standalone: false },
    PIXI: makePixiStub(),
    Buffer,
    location: { href: opts.web ? "http://localhost/index.html" : "file:///game/index.html" },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  // `window.location` must be the same object the engine reads
  vm.runInContext("window.location = location;", ctx);

  function run(code, filename) {
    return vm.runInContext(code, ctx, { filename: filename || "harness-eval" });
  }
  function runFile(file, asName) {
    const code = fs.readFileSync(file, "utf8");
    if (asName) documentStub.currentScript = { src: "js/plugins/" + asName + ".js" };
    try {
      return vm.runInContext(code, ctx, { filename: file });
    } finally {
      documentStub.currentScript = null;
    }
  }

  // ------------------------------------------------------------ engine boot
  const real = opts.real || null;
  if (real) {
    for (const f of ENGINE_FILES[engineKind]) {
      const fp = path.join(real, f);
      if (!fs.existsSync(fp)) throw new Error("Real engine file missing: " + fp);
      runFile(fp);
    }
  } else {
    runFile(path.join(__dirname, engineKind === "mv" ? "engine-mv-model.js" : "engine-mz-model.js"));
  }

  // Game-state globals the plugins read (identical for every backend).
  run(`
    var $dataSystem = { switches: (function(){ var a=[null]; for (var i=1;i<=200;i++) a.push('Switch '+i); return a; })(), variables: [null], versionId: 1 };
    var $dataMap = { events: [] };
    var $gameMap = { _events: {}, mapId: function(){ return 1; }, requestRefresh: function(){}, event: function(id){ return this._events[id] || null; } };
    var $gamePlayer = { x: 5, y: 5, _realX: 5, _realY: 5 };
    var $gameSwitches = new Game_Switches();
    var $gameSystem = null, $gameScreen = null, $gameTimer = null, $gameVariables = null,
        $gameSelfSwitches = null, $gameActors = null, $gameParty = null;
    Graphics.frameCount = 0;
    // Scene stand-ins: real MZ scene constructors build windows/sprites (needs a renderer),
    // so we only create objects with the right prototype (constructor identity is preserved,
    // which is all SceneManager.isNextScene() looks at).
    function __mkScene(C) { return Object.create(C.prototype); }
  `);

  if (real) {
    // Keep the engine's own DataManager save/load code, but avoid zip/localforage/fs:
    // replace only the storage layer with in-memory JSON strings + simulated latency.
    run(`
      StorageManager._files = {};
      StorageManager.ioLatencyMs = 20;
      StorageManager._later = function (fn) {
        return new Promise(function (resolve, reject) {
          setTimeout(function () { try { resolve(fn()); } catch (e) { reject(e); } }, StorageManager.ioLatencyMs);
        });
      };
      StorageManager.saveObject = function (saveName, object) {
        var json = JsonEx.stringify(object);
        return this._later(function () { StorageManager._files[saveName] = json; });
      };
      StorageManager.loadObject = function (saveName) {
        return this._later(function () {
          if (!Object.prototype.hasOwnProperty.call(StorageManager._files, saveName)) throw new Error('no such save');
          return JsonEx.parse(StorageManager._files[saveName]);
        });
      };
      // Real createGameObjects() builds the whole game object graph; we only need the switches.
      DataManager.createGameObjects = function () { $gameSwitches = new Game_Switches(); };
      // Real extractSaveContents() replaces $gameMap/$gamePlayer with the (JSON-stripped) saved
      // copies; keep the harness's stand-ins (they carry methods) while still running the real code.
      (function () {
        var realExtract = DataManager.extractSaveContents;
        DataManager.extractSaveContents = function (contents) {
          var m = $gameMap, p = $gamePlayer;
          realExtract.call(this, contents);
          $gameMap = m;
          $gamePlayer = p;
        };
      })();
      DataManager._globalInfo = [];   // real MZ loads this at boot; null until then
      DataManager.saveGlobalInfo = function () {};
      DataManager.makeSavefileInfo = function () { return {}; };
      DataManager.correctDataErrors = function () {};
    `);
    // Heavy scene methods (rendering, windows) are replaced by no-ops BEFORE the plugins
    // wrap them. We first assert the methods exist in the real engine, because the
    // plugins depend on exactly these prototype methods.
    const mustExist = [
      "Scene_Title.prototype.start",
      "Scene_Map.prototype.create",
      "Scene_Map.prototype.update",
      "Scene_Map.prototype.terminate",
      "Scene_Battle.prototype.terminate",
      "Scene_Menu.prototype.start",
      "Scene_Menu.prototype.terminate",
      "Game_Interpreter.prototype.pluginCommand",
      "Game_Switches.prototype.setValue",
      "DataManager.setupNewGame",
      "DataManager.loadGame",
      "DataManager.makeSaveContents",
      "DataManager.extractSaveContents",
      "SceneManager.isNextScene",
      "AudioManager.createBuffer",
    ];
    for (const ref of mustExist) {
      const t = run("typeof " + ref);
      if (t !== "function") throw new Error("Real engine is missing " + ref + " (typeof=" + t + ")");
    }
    run(`
      Scene_Title.prototype.start = function () {};
      Scene_Map.prototype.create = function () {};
      Scene_Map.prototype.update = function () {};
      Scene_Map.prototype.terminate = function () {};
      Scene_Battle.prototype.terminate = function () {};
      Scene_Menu.prototype.start = function () {};
      Scene_Menu.prototype.terminate = function () {};
    `);
  }

  // Boot audio the way SceneManager.initAudio() does (after plugins are LOADED in a real game
  // -> see env.bootAudio(); loadPack() does NOT boot audio so plugin-load-time behaviour is real).
  let audioBooted = false;
  function bootAudio() {
    if (audioBooted) return;
    audioBooted = true;
    run("WebAudio.initialize();");
  }

  // ------------------------------------------------------------ environment
  const env = {
    engine: engineKind,
    isMZ: engineKind === "mz",
    isReal: !!real,
    label: (engineKind === "mv" ? "MV(model)" : real ? "MZ(real scripts)" : "MZ(model)"),
    clock,
    logs,
    files,
    requests,
    net: netState,
    fa,
    ctx,
    run,
    sandbox,
    get audio() {
      return run("WebAudio._context");
    },
    get A() {
      return run("window.FugsAudio");
    },
    pluginDir: opts.pluginDir || process.env.HARNESS_PLUGIN_DIR || REPO_ROOT,
    params: opts.params || {},
    mapScene: null,
    autoMapUpdate: true,
    frames: 0,
  };

  /** Register a virtual audio file. `name` is the plain (un-encoded) name. */
  env.addAudio = function (type, name, meta) {
    const m = Object.assign({ duration: 30 }, meta || {});
    files.set(`audio/${type}/${name}.ogg`, m);
    files.set(`audio/${type}/${name}.m4a`, m);
    return m;
  };
  env.addDefaultAudio = function () {
    const bgm = ["Theme", "ThemeA", "ThemeSong", "BattleTheme", "Battle1", "Battle2", "Battle Theme", "Scene2", "NewSong",
      "Drums", "Bass", "Pads", "Lead", "Exploration", "DangerTheme", "Ambient", "S1", "S2", "S3", "Kick", "Song"];
    const bgs = ["Rain", "Waterfall", "Forest_Ambience", "Wind"];
    const me = ["Fanfare", "Victory"];
    const se = ["Step1", "Step2", "Step3", "Hit", "Coin", "Footstep", "stone1", "stone2", "step1", "step2", "step3"];
    bgm.forEach((n) => env.addAudio("bgm", n, { duration: 30 }));
    bgs.forEach((n) => env.addAudio("bgs", n, { duration: 20 }));
    me.forEach((n) => env.addAudio("me", n, { duration: 6 }));
    se.forEach((n) => env.addAudio("se", n, { duration: 1 }));
  };

  /** Load the plugin pack in Plugin Manager order. `which` = keys to load (default: full runtime pack). */
  env.loadPack = function (which) {
    const wanted = which || ["core", "docs", "effects", "spatial", "dynamics", "switch", "aliases", "compat"];
    const useBundle = opts.bundle || !!process.env.HARNESS_BUNDLE;
    for (const p of PACK_ORDER) {
      if (!wanted.includes(p.key)) continue;
      if (useBundle && p.key === "core") {
        // The generated all-in-one plugin replaces Core + satellites 2..7 (README: do not enable both).
        env.loadPlugin(path.join(REPO_ROOT, "dist", "FugsMultiTrackAudioEX.bundle.js"), p.name);
        continue;
      }
      if (useBundle && ["effects", "spatial", "dynamics", "switch", "aliases", "compat"].includes(p.key)) continue;
      env.loadPlugin(p.file, p.name);
    }
    return env;
  };
  env.loadPlugin = function (file, name, params) {
    const p = params || env.params[name];
    if (p) run(`PluginManager.setParameters(${JSON.stringify(name)}, ${JSON.stringify(p)});`);
    const full = path.isAbsolute(file) ? file : path.join(env.pluginDir, file);
    runFile(full, name);
  };
  /** SceneManager.initAudio(): creates the WebAudio context (happens AFTER plugin scripts load). */
  env.bootAudio = bootAudio;

  // ------------------------------------------------------ time / frame stepping
  /** Advance virtual time in 60 fps frames, updating the map scene each frame. */
  const frameScript = new vm.Script("Graphics.frameCount++;", { filename: "harness-frame" });
  const mapUpdateScript = new vm.Script("Scene_Map.prototype.update.call(window.__harness_mapScene)", { filename: "harness-map-update" });
  env.advance = async function (ms, o) {
    o = o || {};
    let left = ms;
    while (left > 1e-9) {
      const step = Math.min(FRAME_MS, left);
      await clock.advance(step);
      left -= step;
      if (step >= FRAME_MS - 1e-9) {
        env.frames++;
        frameScript.runInContext(ctx);
        if (env.autoMapUpdate && env.mapScene && o.map !== false) {
          mapUpdateScript.runInContext(ctx);
        }
      }
    }
  };
  Object.defineProperty(env, "mapScene", {
    get() {
      return sandbox.__harness_mapScene || null;
    },
    set(v) {
      sandbox.__harness_mapScene = v;
    },
  });

  // --------------------------------------------------------- plugin commands
  /**
   * Run a plugin command through the engine's REAL event-command dispatch.
   *   via "legacy": event command 356 (MV plugin command) -> Game_Interpreter.pluginCommand
   *   via "native": event command 357 (MZ plugin command) -> PluginManager.callCommand
   *   via "auto"  : MV -> legacy, MZ -> native
   */
  env.runCommand = async function (text, o) {
    o = o || {};
    let via = o.via || "auto";
    if (via === "auto") via = env.isMZ ? "native" : "legacy";
    const pluginName = o.pluginName || "FugsMultiTrackAudioEX";
    sandbox.__cmd = { text, via, pluginName };
    run(`
      (function () {
        var c = window.__cmd;
        var list = c.via === "native"
          ? [{ code: 357, indent: 0, parameters: [c.pluginName, "run", "Run Command", { command: c.text }] }, { code: 0, indent: 0, parameters: [] }]
          : [{ code: 356, indent: 0, parameters: [c.text] }, { code: 0, indent: 0, parameters: [] }];
        var it = new Game_Interpreter();
        it.setup(list, 1);
        it.update();
        window.__lastInterpreter = it;
      })();
    `);
    await clock.drain();
  };

  // ------------------------------------------------------------ scenes
  env.enterMap = function () {
    run(`
      SceneManager._nextScene = null;
      window.__harness_mapScene = __mkScene(Scene_Map);
      Scene_Map.prototype.create.call(window.__harness_mapScene);
    `);
  };
  env.scene = {
    mapToBattle() {
      run(`
        SceneManager._nextScene = __mkScene(Scene_Battle);
        Scene_Map.prototype.terminate.call(window.__harness_mapScene);
        SceneManager._nextScene = null;
        window.__harness_battleScene = __mkScene(Scene_Battle);
      `);
    },
    battleToMap() {
      run(`
        SceneManager._nextScene = __mkScene(Scene_Map);
        Scene_Battle.prototype.terminate.call(window.__harness_battleScene);
        SceneManager._nextScene = null;
        window.__harness_mapScene = __mkScene(Scene_Map);
        Scene_Map.prototype.create.call(window.__harness_mapScene);
      `);
    },
    mapToMenu() {
      run(`
        SceneManager._nextScene = __mkScene(Scene_Menu);
        Scene_Map.prototype.terminate.call(window.__harness_mapScene);
        SceneManager._nextScene = null;
        window.__harness_menuScene = __mkScene(Scene_Menu);
        Scene_Menu.prototype.start.call(window.__harness_menuScene);
      `);
    },
    menuToMap() {
      run(`
        SceneManager._nextScene = __mkScene(Scene_Map);
        Scene_Menu.prototype.terminate.call(window.__harness_menuScene);
        SceneManager._nextScene = null;
        window.__harness_mapScene = __mkScene(Scene_Map);
        Scene_Map.prototype.create.call(window.__harness_mapScene);
      `);
    },
    mapToMap() {
      run(`
        SceneManager._nextScene = __mkScene(Scene_Map);
        Scene_Map.prototype.terminate.call(window.__harness_mapScene);
        SceneManager._nextScene = null;
        window.__harness_mapScene = __mkScene(Scene_Map);
        Scene_Map.prototype.create.call(window.__harness_mapScene);
      `);
    },
    toTitle() {
      run(`Scene_Title.prototype.start.call(__mkScene(Scene_Title));`);
    },
    newGame() {
      run(`DataManager.setupNewGame();`);
    },
  };

  // -------------------------------------------------------------- save / load
  /** Save through DataManager (MZ returns a Promise, MV returns true). */
  env.saveGame = async function (id) {
    id = id || 1;
    const r = run(`DataManager.saveGame(${id})`);
    if (r && typeof r.then === "function") {
      const p = r.then(() => ({ done: true }));
      let out = null;
      p.then((v) => (out = v));
      await env.advance(200, { map: false });
      if (!out) throw new Error("saveGame promise did not settle");
      return true;
    }
    return r;
  };
  /**
   * Load through the same call the load screen makes. MV: sync boolean. MZ: Promise
   * (Scene_Load.executeLoad waits on it, then goes to the map).
   * Returns { ok, ms } after letting `settleMs` of virtual time pass so plugin timers run.
   */
  env.loadGame = async function (id, settleMs) {
    id = id || 1;
    settleMs = settleMs == null ? 500 : settleMs;
    const r = run(`DataManager.loadGame(${id})`);
    let ok = true;
    if (r && typeof r.then === "function") {
      let settled = false;
      r.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
          ok = false;
        }
      );
      for (let i = 0; i < 40 && !settled; i++) await env.advance(25, { map: false });
      if (!settled) throw new Error("loadGame promise did not settle");
    } else {
      ok = !!r;
    }
    await env.advance(settleMs);
    return { ok };
  };

  // -------------------------------------------------------------- audio graph
  /** The live WebAudio wrapper object the plugin created for a track key like "bgm_1". */
  env.track = function (key) {
    sandbox.__k = key;
    return run("window.FugsAudio.tracks.get(window.__k)");
  };
  /** Wait until every requested file has loaded + decoded and load listeners ran. */
  env.settle = async function (ms) {
    await env.advance(ms == null ? 300 : ms);
  };

  return env;
}

module.exports = { createEnv, PACK_ORDER, REPO_ROOT, ENGINE_FILES };
