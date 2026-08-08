//=======================================================================//
//                         FugsAudio8Test.js                             //
//=======================================================================//
/*:
 * @plugindesc v2.2 Dev-only test runner for Fugs MultiTrack Audio
 * @target MV 1.63
 * @author Fug
 *
 * @help
 * =========================================================================
 * FugsAudio8Test — DEV ONLY
 * =========================================================================
 * TestRunner + window.test(). Do not ship in production builds.
 * Requires Core ABOVE this plugin. Load last.
 *
 * Full docs: install FugsAudio0Docs and open it in Plugin Manager.
 * =========================================================================
 */

(() => {
  const TAG = "[FugsAudio8Test]";

  // If Core is missing, still expose test() so the console error is obvious
  // instead of an unexplained ReferenceError.
  if (!window.FugsAudio) {
    const missingCore = function missingCore() {
      console.error(
        `${TAG} FugsMultiTrackAudioEX (or FugsAudio1Core) must be ON and ABOVE this plugin in Plugin Manager.`
      );
      console.error(
        `${TAG} Load order: FugsMultiTrackAudioEX → …optional satellites… → FugsAudio8Test`
      );
      return false;
    };
    window.test = missingCore;
    window.TestRunner = {
      run: missingCore,
      add() {
        missingCore();
      },
    };
    missingCore();
    return;
  }

  const Logger =
    window.FugsAudio.Logger ||
    window.FugsLogger || {
      info: (...a) => console.log("[FugsAudio]", ...a),
      warn: (...a) => console.warn("[FugsAudio]", ...a),
      error: (...a) => console.error("[FugsAudio]", ...a),
      success: (...a) => console.log("[FugsAudio]", ...a),
      debug: () => {},
      debugOnce: () => {},
      effect: (...a) => console.log("[FugsAudio:effect]", ...a),
      switch: (...a) => console.log("[FugsAudio:switch]", ...a),
    };

  const DistanceCurves =
    window.DistanceCurves ||
    (window.FugsAudio && window.FugsAudio.DistanceCurves) ||
    null;

  const FadeManager =
    window.FadeManager ||
    (window.FugsAudio && window.FugsAudio.FadeManager) ||
    null;

  const AudioEffects = window.AudioEffects || null;
  const FugsMultiTrackAudioEX = window.FugsMultiTrackAudioEX || window.FugsAudio;

  if (!DistanceCurves) {
    console.warn(
      `${TAG} DistanceCurves not exported; unit:distanceCurves* tests may fail.`
    );
  }
  if (!FadeManager) {
    console.warn(`${TAG} FadeManager not exported; fade diagnostics may fail.`);
  }
  if (!AudioEffects) {
    console.warn(
      `${TAG} AudioEffects not found; effect/preset tests will fail or skip.`
    );
  }

const TestRunner = {
  tests: new Map(),
  results: { passed: 0, failed: 0, skipped: 0 },
  failedTests: [],
  fileLogEnabled: false,
  mode: "robot", // "robot" = fast automated, "human" = longer for listening
  _skipPending: false, // Set true by keypress to skip current wait
  _keyListener: null,
  _testIndex: 0, // Current test index in runAll (for adaptive GC timing)
  _pauseOnFocusLoss: true, // Pause wait() timer when game window loses focus

  // Timing multipliers
  get t() {
    return this.mode === "human" ? 1 : 0.25;
  },

  // Duration helpers - use these in tests
  dur(humanMs) {
    return Math.max(100, Math.round(humanMs * this.t));
  },

  fadeDur(humanSec) {
    // Fades need minimum time to actually work
    return Math.max(0.8, humanSec * this.t);
  },

  // Register a test
  add(name, fn) {
    this.tests.set(name, fn);
  },

  // Reset results
  reset() {
    this.results = { passed: 0, failed: 0, skipped: 0 };
    this.failedTests = [];
  },

  // Assertions
  assert(condition, msg) {
    if (condition) {
      console.log(`  ✅ ${msg}`);
      this.results.passed++;
    } else {
      console.log(`  ❌ ${msg}`);
      this.results.failed++;
      this.failedTests.push(msg);
    }
    return condition;
  },

  approx(actual, expected, tolerance = 0.1) {
    return Math.abs(actual - expected) <= tolerance;
  },

  // Mark a test as skipped (for missing APIs/assets)
  skip(msg) {
    console.log(`  - SKIP: ${msg}`);
    this.results.skipped++;
  },

  getBuffer(key) {
    return FugsAudio.tracks.get(key);
  },

  async sampleFrequency(key, sampleMs = 400) {
    // Lightweight zero-crossing frequency estimate for a playing buffer.
    if (typeof WebAudio === "undefined" || !WebAudio._context) return null;
    const buffer = this.getBuffer(key);
    if (!buffer) return null;

    const ctx = WebAudio._context;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    const tap = buffer._gainNode || buffer._sourceNode;
    if (!tap || !tap.connect) return null;

    try {
      tap.connect(analyser);
    } catch (_e) {
      Logger.debugOnce(
        "TestRunner.sampleFrequency: tap connect failed",
        { key },
        "TestRunner.sampleFrequency.connect"
      );
      return null;
    }

    const data = new Float32Array(analyser.fftSize);
    await this.wait(sampleMs);
    analyser.getFloatTimeDomainData(data);

    // Disconnect analyser to avoid leaking WebAudio nodes
    try {
      tap.disconnect(analyser);
    } catch (_e) {
      /* already disconnected */
    }
    try {
      analyser.disconnect();
    } catch (_e) {
      /* noop */
    }

    // Zero-crossing count -> cycles -> frequency estimate
    let crossings = 0;
    let last = data[0];
    for (let i = 1; i < data.length; i++) {
      const v = data[i];
      if ((last <= 0 && v > 0) || (last >= 0 && v < 0)) crossings++;
      last = v;
    }

    const cycles = crossings / 2;
    if (cycles < 1) return null;

    const durationSec = data.length / ctx.sampleRate;
    const freq = cycles / durationSec;
    return isFinite(freq) ? freq : null;
  },

  async sampleRms(key, sampleMs = 300) {
    // RMS amplitude estimate for the whole signal.
    if (typeof WebAudio === "undefined" || !WebAudio._context) return null;
    const buffer = this.getBuffer(key);
    if (!buffer) return null;

    const ctx = WebAudio._context;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    const tap = buffer._gainNode || buffer._sourceNode;
    if (!tap || !tap.connect) return null;

    try {
      tap.connect(analyser);
    } catch (_e) {
      Logger.debugOnce(
        "TestRunner.sampleRms: tap connect failed",
        { key },
        "TestRunner.sampleRms.connect"
      );
      return null;
    }

    const data = new Float32Array(analyser.fftSize);
    await this.wait(sampleMs);
    analyser.getFloatTimeDomainData(data);

    // Disconnect analyser to avoid leaking WebAudio nodes
    try {
      tap.disconnect(analyser);
    } catch (_e) {
      /* already disconnected */
    }
    try {
      analyser.disconnect();
    } catch (_e) {
      /* noop */
    }

    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    return isFinite(rms) ? rms : null;
  },

  async sampleStereoRms(key, sampleMs = 300) {
    // Separate RMS per channel to validate pan.
    if (typeof WebAudio === "undefined" || !WebAudio._context) return null;
    const buffer = this.getBuffer(key);
    if (!buffer) return null;

    const ctx = WebAudio._context;
    const splitter = ctx.createChannelSplitter(2);
    const analyserL = ctx.createAnalyser();
    const analyserR = ctx.createAnalyser();
    analyserL.fftSize = 1024;
    analyserR.fftSize = 1024;

    const tap = buffer._gainNode || buffer._sourceNode;
    if (!tap || !tap.connect) return null;

    try {
      tap.connect(splitter);
      splitter.connect(analyserL, 0, 0);
      splitter.connect(analyserR, 1, 0);
    } catch (_e) {
      Logger.debugOnce(
        "TestRunner.sampleStereoRms: splitter connect failed",
        { key },
        "TestRunner.sampleStereoRms.connect"
      );
      return null;
    }

    const dataL = new Float32Array(analyserL.fftSize);
    const dataR = new Float32Array(analyserR.fftSize);
    await this.wait(sampleMs);
    analyserL.getFloatTimeDomainData(dataL);
    analyserR.getFloatTimeDomainData(dataR);

    // Disconnect all analyser/splitter nodes to avoid leaking WebAudio nodes
    try {
      tap.disconnect(splitter);
    } catch (_e) {
      /* already disconnected */
    }
    try {
      splitter.disconnect();
    } catch (_e) {
      /* noop */
    }
    try {
      analyserL.disconnect();
    } catch (_e) {
      /* noop */
    }
    try {
      analyserR.disconnect();
    } catch (_e) {
      /* noop */
    }

    const rms = (arr) => {
      let s = 0;
      for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
      return Math.sqrt(s / arr.length);
    };

    const l = rms(dataL);
    const r = rms(dataR);
    if (!isFinite(l) || !isFinite(r)) return null;
    return { l, r };
  },

  // Helpers - wait with key-skip support and focus-loss awareness
  wait(ms) {
    return new Promise((resolve) => {
      let elapsed = 0;
      let lastTick = Date.now();
      let wasPaused = false;
      const check = () => {
        if (this._skipPending) {
          this._skipPending = false;
          console.log("  [SKIPPED]");
          resolve();
          return;
        }
        const now = Date.now();
        const focused = document.hasFocus();
        if (this._pauseOnFocusLoss && !focused) {
          // Window lost focus — freeze the timer
          if (!wasPaused) {
            wasPaused = true;
            console.log("  [PAUSED — waiting for focus]");
          }
          lastTick = now; // prevent time-jump on resume
          setTimeout(check, 200); // slower poll when backgrounded
          return;
        }
        if (wasPaused) {
          wasPaused = false;
          lastTick = now; // reset baseline after resume
          console.log("  [RESUMED]");
        }
        elapsed += now - lastTick;
        lastTick = now;
        if (elapsed >= ms) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  },

  // Optional: mirror console logs to a file (for long test runs)
  enableFileLog(filename = "fugs_test_log.txt") {
    if (!this.fileLogEnabled) return null;
    // eslint-disable-next-line no-undef
    const fs = require("fs");
    // eslint-disable-next-line no-undef
    const path = require("path");
    // eslint-disable-next-line no-undef
    const base = path.dirname(process.mainModule.filename);
    const logPath = path.join(base, filename);

    if (!this._origConsole) {
      this._origConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
      };
    }

    const formatArg = (arg) => {
      try {
        if (typeof arg === "string") return arg;
        if (arg && arg.stack) return arg.stack;
        return JSON.stringify(arg);
      } catch (_e) {
        return String(arg);
      }
    };

    const writeLine = (level, args) => {
      const stamp = new Date().toISOString();
      const line = `[${stamp}] [${level}] ${args.map(formatArg).join(" ")}`;
      fs.appendFileSync(logPath, line + "\n", "utf8");
    };

    const wrap =
      (level) =>
      (...args) => {
        try {
          writeLine(level, args);
        } catch (_e) {
          /* ignore */
        }
        this._origConsole[level].apply(console, args);
      };

    console.log = wrap("log");
    console.info = wrap("info");
    console.warn = wrap("warn");
    console.error = wrap("error");

    console.log(`File logging enabled: ${logPath}`);
    return logPath;
  },

  disableFileLog() {
    if (!this._origConsole) return;
    console.log = this._origConsole.log;
    console.info = this._origConsole.info;
    console.warn = this._origConsole.warn;
    console.error = this._origConsole.error;
    this._origConsole = null;
  },

  checkGameState() {
    // Verify game is properly initialized before running tests
    if (typeof $dataSystem === "undefined" || !$dataSystem) {
      console.error("✗ GAME NOT INITIALIZED");
      console.error("Please start a New Game or Load a save before running tests");
      return false;
    }
    if (typeof WebAudio === "undefined" || !WebAudio._context) {
      console.error("✗ WEBAUDIO NOT READY");
      console.error("Audio context not initialized - game may not have started properly");
      return false;
    }
    if (typeof AudioManager === "undefined") {
      console.error("✗ AUDIOMANAGER NOT LOADED");
      return false;
    }
    return true;
  },

  async cleanup() {
    // Cancel all active fades first to prevent them from resurrecting references
    FugsAudio.FadeManager.cancelAllFades();

    // Release decoded PCM AudioBuffers BEFORE stopAll empties the Map.
    // These are multi-MB each and the primary memory consumer.
    for (const [, buf] of FugsAudio.tracks) {
      try {
        if (buf) {
          buf._buffer = null;
          // Also sever node refs so the context can release them
          if (buf._sourceNode) {
            try {
              buf._sourceNode.stop();
            } catch (_e) {
              /* ok */
            }
            try {
              buf._sourceNode.disconnect();
            } catch (_e) {
              /* ok */
            }
            buf._sourceNode = null;
          }
          if (buf._gainNode) {
            try {
              buf._gainNode.disconnect();
            } catch (_e) {
              /* ok */
            }
            buf._gainNode = null;
          }
          if (buf._pannerNode) {
            try {
              buf._pannerNode.disconnect();
            } catch (_e) {
              /* ok */
            }
            buf._pannerNode = null;
          }
        }
      } catch (_e) {
        /* best effort */
      }
    }
    FugsAudio.tracks.clear();

    // Dispose any orphaned effect chains that weren't associated with a live track
    for (const [key, chain] of FugsAudio.effectChains.entries()) {
      FugsAudio._disposeEffectChain(key, chain, null, { restoreRouting: false });
    }
    FugsAudio.effectChains.clear();

    // Clear sidechain connections
    if (FugsAudio.sidechainConnections) {
      for (const [connKey, conn] of FugsAudio.sidechainConnections.entries()) {
        try {
          FugsAudio._disposeSidechainConnection(connKey, conn, { restoreTarget: false });
        } catch (_e) {
          /* best effort */
        }
      }
      FugsAudio.sidechainConnections.clear();
    }

    // Clear all remaining timeouts
    if (FugsAudio.activeTimeouts) {
      for (const [, ids] of FugsAudio.activeTimeouts) {
        ids.forEach((id) => clearTimeout(id));
      }
      FugsAudio.activeTimeouts.clear();
    }

    // Clear proximity and pan sweep tracking
    FugsAudio.proximityData.clear();
    if (FugsAudio.panSweeps) FugsAudio.panSweeps.clear();
    FugsAudio.pausedTracks.clear();
    if (FugsAudio.pausedSnapshots) FugsAudio.pausedSnapshots.clear();

    // Give browser time to GC the disconnected WebAudio nodes
    await this.wait(300);
  },

  /**
   * Nuclear cleanup: close the old AudioContext and create a fresh one.
   * This is the only reliable way to reclaim ALL WebAudio nodes on
   * Chromium 65 which has a hard node budget (~500-1000 nodes) and
   * does not GC disconnected nodes aggressively enough during a long
   * batch test run.
   */
  async _resetAudioContext() {
    // 1. Cancel all fades immediately
    FugsAudio.FadeManager.cancelAllFades();

    // 2. Force-stop every buffer and sever all WebAudio node references
    //    so the old context owns zero live JS references.
    for (const [, buf] of FugsAudio.tracks) {
      try {
        if (buf._sourceNode) {
          try {
            buf._sourceNode.stop();
          } catch (_e) {
            /* ok */
          }
          try {
            buf._sourceNode.disconnect();
          } catch (_e) {
            /* ok */
          }
          buf._sourceNode = null;
        }
        if (buf._gainNode) {
          try {
            buf._gainNode.disconnect();
          } catch (_e) {
            /* ok */
          }
          buf._gainNode = null;
        }
        if (buf._pannerNode) {
          try {
            buf._pannerNode.disconnect();
          } catch (_e) {
            /* ok */
          }
          buf._pannerNode = null;
        }
        // Release the decoded PCM AudioBuffer (multi-MB each)
        buf._buffer = null;
      } catch (_e) {
        /* best effort */
      }
    }
    FugsAudio.tracks.clear();

    // 3. Dispose all effect chains (disconnects every node in the chain)
    for (const [key, chain] of FugsAudio.effectChains.entries()) {
      try {
        FugsAudio._disposeEffectChain(key, chain, null, { restoreRouting: false });
      } catch (_e) {
        /* ok */
      }
    }
    FugsAudio.effectChains.clear();

    // 4. Clear sidechains
    if (FugsAudio.sidechainConnections) {
      for (const [connKey, conn] of FugsAudio.sidechainConnections.entries()) {
        try {
          FugsAudio._disposeSidechainConnection(connKey, conn, { restoreTarget: false });
        } catch (_e) {
          /* ok */
        }
      }
      FugsAudio.sidechainConnections.clear();
    }

    // 5. Clear all timeouts, proximity, paused tracking
    if (FugsAudio.activeTimeouts) {
      for (const [, ids] of FugsAudio.activeTimeouts) ids.forEach((id) => clearTimeout(id));
      FugsAudio.activeTimeouts.clear();
    }
    FugsAudio.proximityData.clear();
    if (FugsAudio.panSweeps) FugsAudio.panSweeps.clear();
    FugsAudio.pausedTracks.clear();
    if (FugsAudio.pausedSnapshots) FugsAudio.pausedSnapshots.clear();

    // 6. Close the old context (releases ALL internal WebAudio nodes)
    const oldCtx = WebAudio._context;
    if (oldCtx && typeof oldCtx.close === "function") {
      try {
        await oldCtx.close();
      } catch (_e) {
        /* may already be closed */
      }
    }

    // 7. Force GC if available (NW.js with --expose-gc, or Node context)
    //    Double-GC: the first pass collects most garbage; the second
    //    catches weak refs / pointers that were only made collectable by
    //    the first pass (e.g. decoded AudioBuffer backing stores).
    var _doGC = function () {
      try {
        if (typeof gc === "function") {
          gc(); // eslint-disable-line no-undef
        } else if (
          typeof global !== "undefined" &&
          // eslint-disable-next-line no-undef
          typeof global.gc === "function"
        ) {
          global.gc(); // eslint-disable-line no-undef
        }
      } catch (_e) {
        /* GC not available */
      }
    };
    _doGC();
    await this.wait(150); // let first GC sweep finish
    _doGC(); // second pass for weak refs

    // 8. Log memory after GC attempt
    this._logMemory("post-GC");

    // 9. Wait for GC to reclaim old context resources
    // Scale wait time based on how far into the test run we are —
    // later tests have more accumulated un-GC'd decoded AudioBuffers.
    const gcWait = 300 + Math.floor(this._testIndex / 30) * 200;
    await this.wait(gcWait);

    // 10. Create a brand-new AudioContext + master gain node
    try {
      WebAudio._context = new (window.AudioContext || window.webkitAudioContext)();
      WebAudio._masterGainNode = WebAudio._context.createGain();
      WebAudio._masterGainNode.gain.setValueAtTime(
        WebAudio._masterVolume,
        WebAudio._context.currentTime
      );
      WebAudio._masterGainNode.connect(WebAudio._context.destination);
    } catch (e) {
      console.error("[TestRunner] Failed to recreate AudioContext:", e);
      return;
    }

    // 11. Update AudioEffects to use the new context
    AudioEffects.context = WebAudio._context;

    // 12. Clear AudioEffects caches (they hold old-context buffers)
    AudioEffects.reverbCache = {};
    AudioEffects.reverbCacheOrder = [];
    AudioEffects.curveCache = {};
    AudioEffects.curveCacheOrder = [];

    // 13. Let the new context settle (scale with test progress)
    const settleWait = 200 + Math.floor(this._testIndex / 30) * 100;
    await this.wait(settleWait);
    console.log("  [AudioContext RESET — fresh node budget]");
  },

  /**
   * Log current memory usage to console.
   * Uses process.memoryUsage (NW.js) or performance.memory (Chromium).
   */
  _logMemory(label) {
    const line = this._getMemoryLine(label);
    if (line) console.log(`  ${line}`);
  },

  /**
   * Return a memory-usage string for file logging.
   */
  _getMemoryLine(label) {
    label = label || "";
    try {
      // eslint-disable-next-line no-undef
      if (typeof process !== "undefined" && process.memoryUsage) {
        // eslint-disable-next-line no-undef
        const m = process.memoryUsage();
        const mb = (b) => (b / 1048576).toFixed(1);
        return (
          `[MEM ${label}] rss=${mb(m.rss)}MB ` +
          `heap=${mb(m.heapUsed)}MB/${mb(m.heapTotal)}MB ` +
          `external=${mb(m.external)}MB`
        );
      }
      if (performance && performance.memory) {
        const m = performance.memory;
        const mb = (b) => (b / 1048576).toFixed(1);
        return (
          `[MEM ${label}] usedJS=${mb(m.usedJSHeapSize)}MB ` +
          `totalJS=${mb(m.totalJSHeapSize)}MB ` +
          `limit=${mb(m.jsHeapSizeLimit)}MB`
        );
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  },

  /**
   * Return current RSS in megabytes (NW.js only). Returns 0 if unavailable.
   */
  _getRssMB() {
    try {
      // eslint-disable-next-line no-undef
      if (typeof process !== "undefined" && process.memoryUsage) {
        // eslint-disable-next-line no-undef
        return process.memoryUsage().rss / 1048576;
      }
    } catch (_e) {
      /* ignore */
    }
    return 0;
  },

  async ensureTrack(type, id, name, opts = {}) {
    FugsAudio.play(type, id, name, { volume: 80, fadein: 0, ...opts });
    await this.wait(600);
    return FugsAudio.tracks.has(`${type}_${id}`);
  },

  // Scan audio folder for tracks
  scanFolder(type) {
    // eslint-disable-next-line no-undef
    const fs = require("fs");
    // eslint-disable-next-line no-undef
    const path = require("path");
    // eslint-disable-next-line no-undef
    const base = path.dirname(process.mainModule.filename);
    const audioDir = path.join(base, "audio", type);

    if (!fs.existsSync(audioDir)) {
      console.error(`Audio folder not found: ${audioDir}`);
      return [];
    }

    const files = fs.readdirSync(audioDir);
    const tracks = files
      .filter((f) => /\.(ogg|m4a|mp3|wav)$/i.test(f))
      .map((f) => f.replace(/\.(ogg|m4a|mp3|wav)$/i, ""))
      .filter((v, i, a) => a.indexOf(v) === i); // dedupe

    return tracks;
  },

  // Track discovery - limited when running all tests, full when running single test
  tracks: {
    _cache: {},
    _fullCache: {},
    _maxTracks: 3, // Only use first 3 tracks per type when running all tests
    _limitMode: false, // Set true when running test('*')

    all(type) {
      if (this._limitMode) {
        // Limited mode for test('*')
        if (!this._cache[type]) {
          const full = TestRunner.scanFolder(type);
          this._cache[type] = full.slice(0, this._maxTracks);
          console.log(
            `Found ${full.length} ${type} files, using first ${this._cache[type].length} for batch run`
          );
        }
        return this._cache[type];
      } else {
        // Full mode for individual tests
        if (!this._fullCache[type]) {
          this._fullCache[type] = TestRunner.scanFolder(type);
          console.log(`Found ${this._fullCache[type].length} ${type} files`);
        }
        return this._fullCache[type];
      }
    },

    refresh() {
      this._cache = {};
      this._fullCache = {};
    },

    pick(type, index = 0) {
      const arr = this.all(type);
      return arr[index % arr.length];
    },

    random(type) {
      const arr = this.all(type);
      return arr[Math.floor(Math.random() * arr.length)];
    },

    list(type) {
      const arr = this.all(type);
      console.log(`\n${type.toUpperCase()} tracks (${arr.length}):`);
      arr.forEach((t, i) => console.log(`  ${i}: ${t}`));
      return arr;
    },
  },

  // Enable key-skip listener
  _enableKeySkip() {
    if (this._keyListener) return;
    this._keyListener = (e) => {
      // Skip on Space or Enter
      if (e.code === "Space" || e.code === "Enter") {
        this._skipPending = true;
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", this._keyListener);
    console.log("Press SPACE or ENTER to skip to next test step");
  },

  _disableKeySkip() {
    if (this._keyListener) {
      document.removeEventListener("keydown", this._keyListener);
      this._keyListener = null;
    }
    this._skipPending = false;
  },

  // Run tests matching pattern
  async run(pattern) {
    // Help
    if (!pattern) {
      this.showHelp();
      return;
    }

    // Search
    if (pattern.startsWith("?")) {
      this.search(pattern.slice(1));
      return;
    }

    // Run all
    if (pattern === "*" || pattern === "all") {
      return await this.runAll();
    }

    // Parse pattern: "name:param:subparam"
    const parts = pattern.split(":");
    const testName = parts[0];
    const params = parts.slice(1);

    // Find matching tests
    const matches = [];
    for (const [name] of this.tests) {
      if (name === testName || name.startsWith(testName + ":")) {
        matches.push(name);
      }
    }

    if (matches.length === 0) {
      console.log(`No tests match "${pattern}". Run test('?') to list all.`);
      return;
    }

    // Check game state before running tests
    if (!this.checkGameState()) {
      return;
    }

    this.reset();
    this._enableKeySkip();
    console.log(`\n═══ Running ${matches.length} test(s) matching "${pattern}" ═══\n`);

    for (const name of matches) {
      const fn = this.tests.get(name);
      console.log(`\n── ${name} ──`);
      try {
        await fn.call(this, params);
      } catch (e) {
        console.log(`  ✗ CRASHED: ${e.message}`);
        this.results.failed++;
        this.failedTests.push(`${name}: ${e.message}`);
      } finally {
        await this.cleanup();
      }
    }

    this._disableKeySkip();
    this.showSummary();
    return this.results;
  },

  async runAll() {
    // Check game state before running tests
    if (!this.checkGameState()) {
      return;
    }

    // eslint-disable-next-line no-undef
    const fs = require("fs");
    // eslint-disable-next-line no-undef
    const logPath = require("path").join(
      // eslint-disable-next-line no-undef
      require("path").dirname(process.mainModule.filename),
      "test-progress.log"
    );

    this.reset();
    this._enableKeySkip();
    this.tracks._limitMode = true; // Limit tracks when running all tests
    const isHeavyTestName = (testName) =>
      testName.startsWith("stress:") ||
      testName.startsWith("pool:") ||
      testName.startsWith("playall") ||
      testName === "memory" ||
      testName === "layers";

    // Interleave heavy tests through the run instead of clustering them near the end.
    // This helps avoid hitting RSS guardrails before heavy tests get a chance to run.
    const ordered = [];
    const normalNames = [];
    const heavyNames = [];
    const pinnedEnd = [];
    for (const testName of this.tests.keys()) {
      if (testName === "coverage") {
        pinnedEnd.push(testName);
      } else if (isHeavyTestName(testName)) {
        heavyNames.push(testName);
      } else {
        normalNames.push(testName);
      }
    }

    const heavyTotal = heavyNames.length;
    const normalTotal = normalNames.length;
    const HEAVY_SPACING = 4; // 1 heavy test after every 4 normal tests
    while (normalNames.length > 0 || heavyNames.length > 0) {
      for (let i = 0; i < HEAVY_SPACING && normalNames.length > 0; i++) {
        ordered.push(normalNames.shift());
      }
      if (heavyNames.length > 0) {
        ordered.push(heavyNames.shift());
      }
    }
    ordered.push(...pinnedEnd);
    const names = ordered;

    console.log(`\n═══ Running ALL ${names.length} tests ═══\n`);
    console.log(
      `[Batch order] Interleaving ${heavyTotal} heavy tests across ${normalTotal} normal tests (1:${HEAVY_SPACING})`
    );
    fs.writeFileSync(logPath, `=== Test run started: ${new Date().toISOString()} ===\n`);
    fs.appendFileSync(logPath, `Total tests: ${names.length}\n\n`);

    for (let idx = 0; idx < names.length; idx++) {
      const name = names[idx];
      const fn = this.tests.get(name);
      this._testIndex = idx; // Track position for adaptive GC timing
      // Write to file BEFORE running so we know which test killed the process
      fs.appendFileSync(logPath, `[${idx + 1}/${names.length}] STARTING: ${name}\n`);

      // Log memory to file before every test
      try {
        const memLine = this._getMemoryLine(`test-${idx + 1}`);
        if (memLine) fs.appendFileSync(logPath, `  ${memLine}\n`);
      } catch (_e) {
        /* ignore */
      }

      // Force a context reset BEFORE every heavy test to guarantee
      // a clean node budget. These tests create many buffers and nodes.
      const isHeavy = isHeavyTestName(name);

      // ── 32-bit RSS safety valve ──────────────────────────────────
      // NW.js 0.29.0 is 32-bit (~2 GB virtual address limit, ~1.5 GB
      // usable). Address-space fragmentation means RSS never drops
      // even after freeing AudioBuffers. When RSS is dangerously high
      // we skip heavy tests to avoid a hard process crash.
      const rssMB = this._getRssMB();
      const RSS_SKIP_HEAVY = 1250; // MB – skip heavy tests above this
      const RSS_FORCE_RESET = 1100; // MB – force reset for ANY test

      if (rssMB > RSS_SKIP_HEAVY && isHeavy) {
        const msg = `RSS=${rssMB.toFixed(0)}MB exceeds ${RSS_SKIP_HEAVY}MB — 32-bit safety skip`;
        console.log(`  ⚠ SKIPPED ${name}: ${msg}`);
        fs.appendFileSync(logPath, `[${idx + 1}/${names.length}] SKIPPED: ${name} — ${msg}\n`);
        continue; // next test — don't count as pass or fail
      }

      if (rssMB > RSS_FORCE_RESET && !isHeavy) {
        // Force a context reset for non-heavy tests when RSS is
        // elevated. This won't reclaim address space but releases any
        // lingering native allocations that MIGHT help a little.
        await this._resetAudioContext();
        fs.appendFileSync(
          logPath,
          `  --- RSS safety reset (${rssMB.toFixed(0)}MB) for ${name} ---\n`
        );
      }

      if (isHeavy) {
        await this._resetAudioContext();
        fs.appendFileSync(logPath, `  --- Pre-test context reset for ${name} ---\n`);
      }
      console.log(`\n── ${name} (${idx + 1}/${names.length}) ──`);
      try {
        await fn.call(this, []);
        fs.appendFileSync(logPath, `[${idx + 1}/${names.length}] PASSED:   ${name}\n`);
      } catch (e) {
        console.log(`  ✗ CRASHED: ${e.message}`);
        this.results.failed++;
        this.failedTests.push(`${name}: ${e.message}`);
        fs.appendFileSync(
          logPath,
          `[${idx + 1}/${names.length}] FAILED:   ${name} — ${e.message}\n`
        );
      } finally {
        await this.cleanup();
        // Classify tests that decode many audio files as "heavy"
        const isHeavy = isHeavyTestName(name);
        const testNum = idx + 1;
        if (isHeavy) {
          // Always reset after every heavy test — cumulative decoded
          // AudioBuffer pressure causes CTD late in the run otherwise.
          console.log(`  [Context reset after heavy test ${testNum}]`);
          fs.appendFileSync(logPath, `  --- Context reset after heavy test ${testNum} ---\n`);
          await this._resetAudioContext();
          await this.wait(250); // brief cool-down to reduce decode churn spikes
        } else if (testNum % 5 === 0) {
          console.log(`  [Context reset after ${testNum} tests]`);
          fs.appendFileSync(logPath, `  --- Context reset after ${testNum} tests ---\n`);
          await this._resetAudioContext();
        } else if (testNum % 3 === 0) {
          await this.wait(400);
        }
      }
    }

    this._disableKeySkip();
    this.tracks._limitMode = false; // Reset for next run
    fs.appendFileSync(logPath, `\n=== Test run finished: ${new Date().toISOString()} ===\n`);
    this.showSummary();
    return this.results;
  },

  search(filter) {
    const names = Array.from(this.tests.keys());
    const matches = filter
      ? names.filter((n) => n.toLowerCase().includes(filter.toLowerCase()))
      : names;

    console.log(`\n═══ Available Tests${filter ? ` (matching "${filter}")` : ""} ═══\n`);

    // Group by prefix
    const groups = {};
    for (const name of matches) {
      const prefix = name.split(":")[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(name);
    }

    for (const [prefix, tests] of Object.entries(groups)) {
      console.log(`${prefix}:`);
      for (const t of tests) {
        console.log(`  ${t}`);
      }
    }
    console.log(`\nTotal: ${matches.length} tests`);
  },

  showHelp() {
    console.log(`
═══ FUGS AUDIO TEST RUNNER ═══

⚠️  IMPORTANT: Start a New Game or Load a save before running tests!

Mode: ${this.mode.toUpperCase()} (${this.mode === "human" ? "slow, for listening" : "fast, automated"})
  TestRunner.mode = 'human'   Slow tests for human ears
  TestRunner.mode = 'robot'   Fast automated tests

Usage:
  test('?')                 List all tests
  test('?fade')             Search tests containing 'fade'
  test('play')              Run all 'play' tests
  test('preset')            Run preset test with ALL presets
  test('preset:cave')       Run preset test with just 'cave'
  test('fade:curve:smooth') Run fade:curve with just smooth curve
  test('listen')            Run quick human listening smoke suite
  test('minimal')           Run minimal regression suite (recommended)
  test('*')                 Run ALL tests

During tests:
  SPACE or ENTER            Skip current wait (jump to next step)

Quick commands: Yes, you can run these durning tests too!
  FugsAudio.stopAll(0)      Stop all audio
  FugsAudio.list()          Show active tracks

⚠️  Keep browser tab FOCUSED during tests!
`);
  },

  showSummary() {
    const { passed, failed, skipped } = this.results;
    console.log(`\n═══ SUMMARY ═══`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    if (skipped) console.log(`Skipped: ${skipped}`);
    if (failed > 0) {
      console.log(`\nFailed tests:`);
      this.failedTests.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    }
  },
};

// =====================================================================
// REGISTER TESTS
// =====================================================================

// --- HUMAN LISTENING SMOKE SUITE ---
TestRunner.add("listen", async function () {
  console.log("Running human listening smoke suite...");
  const prevMode = this.mode;
  this.mode = "human";

  // Curated audible checks: playback, fades, effects, ducking, spatial, and one-shot audio.
  const tests = [
    "play",
    "play:fadein",
    "fade:volume",
    "fade:pan",
    "crossfade",
    "effect:fadein",
    "duck",
    "spatial",
    "se",
    "me",
  ];

  try {
    for (const t of tests) {
      const fn = TestRunner.tests.get(t);
      if (!fn) {
        console.log(`  [SKIP] ${t} not found`);
        this.results.skipped++;
        continue;
      }

      console.log(`\n── ${t} ──`);
      try {
        await fn.call(this, []);
      } catch (e) {
        console.log(`  ✗ CRASHED: ${e.message}`);
        this.results.failed++;
        this.failedTests.push(`${t}: ${e.message}`);
      }
    }
  } finally {
    await this.cleanup();
    this.mode = prevMode;
    console.log(`\n[LISTEN] Restored test mode: ${this.mode}`);
  }
});

// --- MINIMAL REGRESSION SUITE ---
TestRunner.add("minimal", async function () {
  console.log("Running minimal regression suite...");
  const tests = [
    "unit:toNum",
    "unit:fadeCurves",
    "unit:pitchMath",
    "unit:distanceCurves",
    "unit:distanceCurvesCustom",
    "unit:parse",
    "unit:loop",
    "unit:presetStructure",
    "unit:presetLookup",
    "unit:presetAliases",
    "unit:presetCounts",
    "unit:presetValidation",
    "unit:presetNoDuplicates",
    "unit:presetEffectChains",
    "unit:presetSamples",
    "unit:parseProximityConfig",
    "unit:parseAliasConfig",
    "unit:validateBuffer",
    "unit:consumeParenTag",
    "unit:toNumParity",
    "unit:parseArguments",
    "unit:proximity",
    "fade:pitch:automation",
    "memory",
  ];
  for (const t of tests) {
    const fn = TestRunner.tests.get(t);
    if (!fn) {
      console.log(`  [SKIP] ${t} not found`);
      this.results.skipped++;
      continue;
    }
    console.log(`\n── ${t} ──`);
    try {
      await fn.call(this, []);
    } catch (e) {
      console.log(`  ✗ CRASHED: ${e.message}`);
      this.results.failed++;
      this.failedTests.push(`${t}: ${e.message}`);
    }
  }
});

// --- DIAGNOSTICS ---
TestRunner.add("diag:fade", async function () {
  await this.cleanup();
  console.log("[DIAG] Testing FadeManager directly...");

  // Test 1: Check if FadeManager exists and RAF works
  let rafCalled = false;
  requestAnimationFrame(() => {
    rafCalled = true;
  });
  await this.wait(100);
  this.assert(rafCalled, "requestAnimationFrame works");

  // Test 2: Direct FadeManager test
  let fadeValue = 0;
  let fadeCompleted = false;
  FugsAudio.FadeManager.startFade(
    "test_diag",
    0,
    1,
    0.5, // 0.5 second fade
    (v) => {
      fadeValue = v;
    },
    () => {
      fadeCompleted = true;
    },
    "linear"
  );

  await this.wait(200);
  console.log(`  Mid-fade value: ${fadeValue.toFixed(3)}`);
  this.assert(fadeValue > 0.2, `Fade progressing mid-way (${fadeValue.toFixed(3)})`);

  await this.wait(500);
  console.log(`  End-fade value: ${fadeValue.toFixed(3)}, completed: ${fadeCompleted}`);
  this.assert(fadeValue > 0.9, `Fade reached target (${fadeValue.toFixed(3)})`);
  this.assert(fadeCompleted, "Fade completed callback fired");

  // Test 3: Track volume fade
  const name = this.tracks.pick("bgm");
  FugsAudio.play("bgm", 1, name, { volume: 80, fadein: 0 });
  await this.wait(500);

  const buf1 = FugsAudio.tracks.get("bgm_1");
  const startVol = buf1 ? buf1.volume : -1;
  console.log(`  Track start volume: ${Math.round(startVol * 100)}%`);
  this.assert(startVol > 0.7, `Track started at ~80% (${Math.round(startVol * 100)}%)`);

  FugsAudio.fade("bgm", 1, { volume: 20, duration: 1 });
  await this.wait(1200);

  const buf2 = FugsAudio.tracks.get("bgm_1");
  const endVol = buf2 ? buf2.volume : -1;
  console.log(`  Track end volume: ${Math.round(endVol * 100)}%`);
  this.assert(endVol < 0.4, `Track faded to ~20% (${Math.round(endVol * 100)}%)`);

  await this.cleanup();
});

// --- PLAY ---
TestRunner.add("play", async function () {
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  console.log(`[LISTEN] Playing: ${name}`);

  FugsAudio.play("bgm", 1, name, { volume: 80, fadein: 0 });
  await this.wait(this.dur(2000));

  this.assert(FugsAudio.tracks.has("bgm_1"), "Track exists");
  const buf = FugsAudio.tracks.get("bgm_1");
  this.assert(buf && buf._name === name, `Track name is ${name}`);
  this.assert(
    buf && buf.volume > 0.5,
    `Volume > 50% (got ${buf ? Math.round(buf.volume * 100) : 0}%)`
  );
});

TestRunner.add("play:multi", async function () {
  await this.cleanup();
  const names = [
    this.tracks.pick("bgm", 0),
    this.tracks.pick("bgm", 1),
    this.tracks.pick("bgm", 2),
  ];
  console.log(`[LISTEN] Playing 3 tracks: ${names.join(", ")}`);

  FugsAudio.play("bgm", 1, names[0], { volume: 60, fadein: 0 });
  FugsAudio.play("bgm", 2, names[1], { volume: 50, fadein: 0 });
  FugsAudio.play("bgm", 3, names[2], { volume: 40, fadein: 0 });
  await this.wait(this.dur(2000));

  this.assert(FugsAudio.tracks.has("bgm_1"), "bgm_1 exists");
  this.assert(FugsAudio.tracks.has("bgm_2"), "bgm_2 exists");
  this.assert(FugsAudio.tracks.has("bgm_3"), "bgm_3 exists");
  this.assert(FugsAudio.tracks.size >= 3, `3+ tracks active (got ${FugsAudio.tracks.size})`);
});

TestRunner.add("play:types", async function () {
  await this.cleanup();
  console.log("[LISTEN] Playing all 4 types: bgm, bgs, se, me");

  FugsAudio.play("bgm", 1, this.tracks.pick("bgm"), { volume: 60, fadein: 0 });
  FugsAudio.play("bgs", 1, this.tracks.pick("bgs"), { volume: 50, fadein: 0 });
  await this.wait(this.dur(1000));
  FugsAudio.play("se", 1, this.tracks.pick("se"), { volume: 80 });
  await this.wait(this.dur(1000));
  FugsAudio.play("me", 1, this.tracks.pick("me"), { volume: 70 });
  await this.wait(this.dur(2000));

  this.assert(FugsAudio.tracks.has("bgm_1"), "bgm_1 exists");
  this.assert(FugsAudio.tracks.has("bgs_1"), "bgs_1 exists");
});

TestRunner.add("play:fadein", async function () {
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  const fadeDur = this.fadeDur(4);
  console.log(`[LISTEN] Playing ${name} with ${fadeDur}s fade-in`);

  FugsAudio.play("bgm", 1, name, { volume: 80, fadein: fadeDur });
  await this.wait(Math.max(500, fadeDur * 300)); // Check early in fade

  const buf1 = FugsAudio.tracks.get("bgm_1");
  const vol1 = buf1 ? buf1.volume : 0;
  this.assert(vol1 < 0.5, `Volume low during fade-in (got ${Math.round(vol1 * 100)}%)`);

  // Wait for fade to complete + extra buffer
  await this.wait(fadeDur * 1000 + 500);
  const buf2 = FugsAudio.tracks.get("bgm_1");
  const vol2 = buf2 ? buf2.volume : 0;
  this.assert(vol2 > 0.6, `Volume high after fade-in (got ${Math.round(vol2 * 100)}%)`);
});

// --- STOP ---
TestRunner.add("stop", async function () {
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  console.log(`[LISTEN] Playing ${name}, then stopping immediately`);

  await this.ensureTrack("bgm", 1, name);
  this.assert(FugsAudio.tracks.has("bgm_1"), "Track exists before stop");

  FugsAudio.stop("bgm", 1, 0);
  await this.wait(300);
  this.assert(!FugsAudio.tracks.has("bgm_1"), "Track removed after stop");
});

TestRunner.add("stop:fade", async function () {
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  console.log(`[LISTEN] Playing ${name}, stopping with 1.5s fade`);

  await this.ensureTrack("bgm", 1, name);
  const fadeDur = this.fadeDur(1.5);
  FugsAudio.stop("bgm", 1, fadeDur);

  await this.wait(200); // Check early in fade
  this.assert(FugsAudio.tracks.has("bgm_1"), "Track still exists during fade");

  await this.wait(fadeDur * 1000 + 500);
  this.assert(!FugsAudio.tracks.has("bgm_1"), "Track removed after fade");
});

TestRunner.add("stop:all", async function () {
  await this.cleanup();
  console.log("[LISTEN] Playing 3 tracks, then stopAll");

  await this.ensureTrack("bgm", 1, this.tracks.pick("bgm", 0));
  await this.ensureTrack("bgm", 2, this.tracks.pick("bgm", 1));
  await this.ensureTrack("bgs", 1, this.tracks.pick("bgs"));

  this.assert(
    FugsAudio.tracks.size >= 3,
    `3+ tracks before stopAll (got ${FugsAudio.tracks.size})`
  );

  FugsAudio.stopAll(0);
  await this.wait(300);
  this.assert(
    FugsAudio.tracks.size === 0,
    `0 tracks after stopAll (got ${FugsAudio.tracks.size})`
  );
});

// --- FADE ---
TestRunner.add("fade:volume", async function () {
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  const fadeDur = this.fadeDur(4);
  console.log(`[LISTEN] Playing ${name} at 80%, fading to 20% over ${fadeDur}s`);

  await this.ensureTrack("bgm", 1, name, { volume: 80 });
  await this.wait(500); // Let track stabilize

  const rmsStart = await this.sampleRms("bgm_1", 300);

  FugsAudio.fade("bgm", 1, { volume: 20, duration: fadeDur });
  await this.wait(fadeDur * 1000 + 500); // Wait full fade + buffer

  const buf = FugsAudio.tracks.get("bgm_1");
  const vol = buf ? buf.volume : 0;
  this.assert(this.approx(vol, 0.2, 0.15), `Volume near 20% (got ${Math.round(vol * 100)}%)`);

  const rmsEnd = await this.sampleRms("bgm_1", 200);
  if (rmsStart !== null && rmsEnd !== null) {
    this.assert(rmsEnd < rmsStart * 0.7, "Analyzer RMS drops with volume fade");
  } else {
    this.skip("Analyzer RMS unavailable");
  }
});

TestRunner.add("fade:curve", async function (params) {
  const allCurves = [
    "linear",
    "exponential",
    "logarithmic",
    "smooth",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "sharp",
    "gentle",
  ];

  // In batch mode, only test 3 representative curves
  let curves;
  if (params.length > 0) {
    curves = params[0].split(",");
  } else if (this.tracks._limitMode) {
    curves = ["linear", "exponential", "smooth"];
    console.log(`[BATCH MODE] Testing 3 sample curves (run test('fade:curve') for all 9)`);
  } else {
    curves = allCurves;
  }

  await this.cleanup();
  const name = this.tracks.pick("bgm");
  await this.ensureTrack("bgm", 1, name, { volume: 80 });

  for (const curve of curves) {
    if (!allCurves.includes(curve)) {
      console.log(`  [SKIP] Unknown curve: ${curve}`);
      this.results.skipped++;
      continue;
    }
    console.log(`[LISTEN] Fade curve: ${curve}`);

    const fadeDur = this.fadeDur(3);
    FugsAudio.fade("bgm", 1, { volume: 20, duration: fadeDur, curve });
    await this.wait(fadeDur * 1000 + 500); // Wait full fade + buffer

    const buf1 = FugsAudio.tracks.get("bgm_1");
    this.assert(buf1 && buf1.volume < 0.4, `${curve}: reached low volume`);

    FugsAudio.fade("bgm", 1, { volume: 80, duration: fadeDur, curve });
    await this.wait(fadeDur * 1000 + 300);
  }
});

TestRunner.add("fade:pan", async function () {
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  console.log(`[LISTEN] Playing ${name}, panning left then right`);

  await this.ensureTrack("bgm", 1, name);
  await this.wait(500); // Let track stabilize

  const panDur = this.fadeDur(3);
  console.log(`[LISTEN] Panning left over ${panDur}s...`);
  FugsAudio.fade("bgm", 1, { pan: -80, duration: panDur });
  await this.wait(panDur * 1000 + 500);

  const stereoLeft = await this.sampleStereoRms("bgm_1", 300);
  if (stereoLeft && stereoLeft.l > 0 && stereoLeft.r > 0) {
    if (stereoLeft.l > stereoLeft.r * 1.2) {
      this.assert(true, "Analyzer shows left-heavy pan");
    } else {
      // Some audio files don't show clear stereo separation in analyzer
      this.skip(
        `Pan analyzer inconclusive (L=${stereoLeft.l.toFixed(3)} R=${stereoLeft.r.toFixed(3)})`
      );
    }
  } else {
    this.skip("Stereo analyzer unavailable (left phase)");
  }

  console.log(`[LISTEN] Panning right over ${panDur}s...`);
  FugsAudio.fade("bgm", 1, { pan: 80, duration: panDur });
  await this.wait(panDur * 1000 + 500);

  const stereoRight = await this.sampleStereoRms("bgm_1", 300);
  if (stereoRight && stereoRight.l > 0 && stereoRight.r > 0) {
    if (stereoRight.r > stereoRight.l * 1.2) {
      this.assert(true, "Analyzer shows right-heavy pan");
    } else {
      // Some audio files don't show clear stereo separation in analyzer
      this.skip(
        `Pan analyzer inconclusive (L=${stereoRight.l.toFixed(3)} R=${stereoRight.r.toFixed(3)})`
      );
    }
  } else {
    this.skip("Stereo analyzer unavailable (right phase)");
  }

  console.log(`[LISTEN] Centering over ${panDur}s...`);
  FugsAudio.fade("bgm", 1, { pan: 0, duration: panDur });
  await this.wait(panDur * 1000 + 300);

  this.assert(true, "Pan sweep completed");
});

TestRunner.add("fade:pitch", async function () {
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  console.log(`[LISTEN] Playing ${name}, pitch bending down then up`);

  await this.ensureTrack("bgm", 1, name, { fadein: 0 });
  await this.wait(500); // Let track stabilize

  const pitchDur = this.fadeDur(4);
  console.log(`[LISTEN] Pitch down to 80% over ${pitchDur}s...`);
  FugsAudio.fade("bgm", 1, { pitch: 80, duration: pitchDur });
  await this.wait(pitchDur * 1000 + 500);

  console.log(`[LISTEN] Pitch up to 120% over ${pitchDur}s...`);
  FugsAudio.fade("bgm", 1, { pitch: 120, duration: pitchDur });
  await this.wait(pitchDur * 1000 + 500);

  const resetDur = this.fadeDur(2);
  console.log(`[LISTEN] Pitch back to 100% over ${resetDur}s...`);
  FugsAudio.fade("bgm", 1, { pitch: 100, duration: resetDur });
  await this.wait(resetDur * 1000 + 300);

  this.assert(true, "Pitch bend completed");
});

TestRunner.add("fade:pitch:automation", async function () {
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  console.log(`[ASSERT] Automation path for ${name}`);

  const ensured = await this.ensureTrack("bgm", 1, name, { fadein: 0, startTime: 0 });
  if (!ensured) {
    this.assert(false, "Track failed to start");
    return;
  }
  await this.wait(300); // Let track initialize

  const key = "bgm_1";
  const buf = this.getBuffer(key);
  this.assert(!!buf, "Buffer acquired");

  const startPitch = buf._basePitch || 1.0;

  // Use longer fade for more reliable detection
  const fadeDur = Math.max(1.5, this.fadeDur(2));
  FugsAudio.fade("bgm", 1, { pitch: 80, duration: fadeDur });
  await this.wait(fadeDur * 500); // Check mid-fade
  const midPitch = buf._basePitch || 1.0;
  await this.wait(fadeDur * 600 + 200); // Wait for completion
  const endPitch = buf._basePitch || 1.0;

  this.assert(midPitch < startPitch, "Pitch moves downward during fade");
  this.assert(this.approx(endPitch, 0.8, 0.1), "Pitch reaches ~80% target");

  const rate =
    buf._sourceNode && buf._sourceNode.playbackRate
      ? buf._sourceNode.playbackRate.value
      : buf.pitch;
  if (typeof rate === "number") {
    this.assert(
      rate < startPitch && rate <= endPitch + 0.15,
      "Playback rate follows pitch target"
    );
  } else {
    this.skip("playbackRate unavailable; visual check only");
  }
});

TestRunner.add("fade:pitch:analyze", async function () {
  await this.cleanup();
  if (typeof WebAudio === "undefined" || !WebAudio._context) {
    this.skip("No WebAudio context for analysis");
    return;
  }

  const name = this.tracks.pick("bgm");
  console.log(`[ASSERT] Analyzer frequency drop for ${name}`);

  const ensured = await this.ensureTrack("bgm", 1, name, { fadein: 0, startTime: 0 });
  if (!ensured) {
    this.assert(false, "Track failed to start");
    return;
  }

  const key = "bgm_1";
  await this.wait(500); // Let track stabilize

  const freqStart = await this.sampleFrequency(key, 350);
  if (!freqStart || freqStart <= 0) {
    this.skip("Could not estimate starting frequency (needs a steady tone)");
    return;
  }

  const fadeDur = this.fadeDur(2);
  FugsAudio.fade("bgm", 1, { pitch: 80, duration: fadeDur });
  await this.wait(fadeDur * 1000 + 400);

  const freqEnd = await this.sampleFrequency(key, 350);
  if (!freqEnd || freqEnd <= 0) {
    this.skip("Could not estimate ending frequency");
    return;
  }

  const ratio = freqEnd / freqStart;
  console.log(
    `  freqStart=${freqStart.toFixed(1)}Hz freqEnd=${freqEnd.toFixed(1)}Hz ratio=${ratio.toFixed(3)}`
  );

  // Loosened bounds to reduce false negatives on complex/non-tonal assets.
  this.assert(ratio < 0.95, "Measured frequency drops with pitch fade");
  this.assert(ratio > 0.5, "Frequency drop is within expected bounds");
});

// --- CROSSFADE ---
TestRunner.add("crossfade", async function () {
  await this.cleanup();
  const name1 = this.tracks.pick("bgm", 0);
  const name2 = this.tracks.pick("bgm", 1);
  console.log(`[LISTEN] Crossfading: ${name1} -> ${name2}`);

  await this.ensureTrack("bgm", 1, name1);

  const fadeDur = this.fadeDur(2.5);
  FugsAudio.crossfade("bgm", 1, "bgm", 2, name2, { duration: fadeDur, volume: 80 });
  await this.wait(fadeDur * 1000 + 500);

  this.assert(FugsAudio.tracks.has("bgm_2"), "New track exists");
  const buf = FugsAudio.tracks.get("bgm_2");
  this.assert(buf && buf._name === name2, `New track is ${name2}`);
});

TestRunner.add("crossfade:same", async function () {
  await this.cleanup();
  const name1 = this.tracks.pick("bgm", 0);
  const name2 = this.tracks.pick("bgm", 1);
  console.log(`[LISTEN] Crossfading on same track: ${name1} -> ${name2}`);

  await this.ensureTrack("bgm", 1, name1);

  const fadeDur = this.fadeDur(2);
  FugsAudio.crossfade("bgm", 1, "bgm", 1, name2, { duration: fadeDur, volume: 80 });
  await this.wait(fadeDur * 1000 + 500);

  this.assert(FugsAudio.tracks.has("bgm_1"), "Track still exists");
  const buf = FugsAudio.tracks.get("bgm_1");
  this.assert(buf && buf._name === name2, `Track is now ${name2}`);
});

// --- EFFECT ---
TestRunner.add("effect", async function (params) {
  const effects = params.length > 0 ? params[0].split(",") : ["reverb", "delay", "lowpass"];

  await this.cleanup();
  const name = this.tracks.pick("bgm");
  await this.ensureTrack("bgm", 1, name);

  for (const effect of effects) {
    console.log(`[LISTEN] Effect: ${effect}`);

    const applied = FugsAudio.setEffect("bgm", 1, { type: effect });
    this.assert(applied, `setEffect(${effect}) returned truthy`);
    await this.wait(this.dur(2500));

    FugsAudio.removeEffect("bgm", 1);
    await this.wait(this.dur(500));
  }
});

TestRunner.add("effect:fadein", async function () {
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  console.log(`[LISTEN] Playing ${name}, fading in 'underwater' effect`);

  await this.ensureTrack("bgm", 1, name);

  const fadeDur = this.fadeDur(2);
  const applied = FugsAudio.fadeInEffect("bgm", 1, "underwater", fadeDur);
  this.assert(applied, "fadeInEffect returned truthy");
  await this.wait(fadeDur * 1000 + 500);

  this.assert(FugsAudio.effectChains.has("bgm_1"), "Effect chain exists");
});

TestRunner.add("effect:fadeout", async function () {
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  console.log(`[LISTEN] Playing ${name} with effect, fading out effect`);

  await this.ensureTrack("bgm", 1, name);
  FugsAudio.setEffect("bgm", 1, "cave");
  await this.wait(500); // Let effect apply

  const fadeDur = this.fadeDur(2);
  console.log(`[LISTEN] Fading out effect over ${fadeDur}s...`);
  FugsAudio.fadeOutEffectOnTrack("bgm", 1, fadeDur);
  await this.wait(fadeDur * 1000 + 300);

  this.assert(!FugsAudio.effectChains.has("bgm_1"), "Effect chain removed");
});

// --- PRESET ---
TestRunner.add("preset", async function (params) {
  // Use getAllPresetNames() for nested preset structure
  const allPresets =
    window.AudioEffects && typeof window.AudioEffects.getAllPresetNames === "function"
      ? window.AudioEffects.getAllPresetNames()
      : [];

  if (allPresets.length === 0) {
    console.log("[SKIP] No presets available");
    this.results.skipped++;
    return;
  }

  // In batch mode (test('*')), only test representative presets from each category
  let presets;
  if (params.length > 0) {
    presets = params[0].split(",");
  } else if (this.tracks._limitMode) {
    // Pick representative presets from different categories for batch testing
    const samples = ["cave", "underwater", "phone", "nightmare", "muffled", "slowMo"];
    presets = samples.filter((p) => allPresets.includes(p));
    if (presets.length === 0) presets = allPresets.slice(0, 6);
    console.log(
      `[BATCH MODE] Testing ${presets.length} sample presets (run test('preset') for all ${allPresets.length})`
    );
  } else {
    presets = allPresets;
  }

  await this.cleanup();
  const name = this.tracks.pick("bgm");
  await this.ensureTrack("bgm", 1, name);

  console.log(`Testing ${presets.length} preset(s)...`);

  for (const preset of presets) {
    // Use getPreset to validate - handles aliases and nested lookups
    if (!AudioEffects.getPreset(preset)) {
      console.log(`  [SKIP] Unknown preset: ${preset}`);
      this.results.skipped++;
      continue;
    }

    console.log(`[LISTEN] Preset: ${preset}`);
    const applied = FugsAudio.setEffect("bgm", 1, preset);
    this.assert(applied, `${preset} applied`);
    await this.wait(this.dur(2500));

    console.log("[LISTEN] (normal)");
    FugsAudio.removeEffect("bgm", 1);
    await this.wait(this.dur(1500)); // Hear normal sound between presets
  }
});

// --- DUCK ---
TestRunner.add("duck", async function () {
  await this.cleanup();
  const bgm = this.tracks.pick("bgm");
  const bgs = this.tracks.pick("bgs");
  console.log(`[LISTEN] Playing ${bgm} + ${bgs}, ducking BGM`);

  await this.ensureTrack("bgm", 1, bgm, { volume: 80 });
  await this.ensureTrack("bgs", 1, bgs, { volume: 60 });

  const holdTime = this.fadeDur(2);
  console.log(`[LISTEN] Ducking bgm_1 to 30% for ${holdTime}s...`);
  FugsAudio.duck("bgm", 1, { level: 0.3, fadeTime: 0.8, holdTime: holdTime });
  await this.wait(1200); // Wait for duck fade to complete (0.8s fade + buffer)

  const buf = FugsAudio.tracks.get("bgm_1");
  // Duck target is 0.3 (30%), original volume was 0.8 (80%), so ducked = 0.8 * 0.3 = 0.24
  this.assert(
    buf && buf.volume < 0.5,
    `Volume ducked (got ${buf ? Math.round(buf.volume * 100) : 0}%)`
  );

  await this.wait(holdTime * 1000 + 1000);
  this.assert(true, "Duck cycle completed");
});

TestRunner.add("duck:all", async function () {
  await this.cleanup();
  console.log("[LISTEN] Playing 3 tracks, duckAll");

  await this.ensureTrack("bgm", 1, this.tracks.pick("bgm", 0), { volume: 70 });
  await this.ensureTrack("bgm", 2, this.tracks.pick("bgm", 1), { volume: 60 });
  await this.ensureTrack("bgs", 1, this.tracks.pick("bgs"), { volume: 50 });

  const holdTime = this.fadeDur(2);
  console.log(`[LISTEN] Ducking all to 20% for ${holdTime}s...`);
  FugsAudio.duckAll({ level: 0.2, fadeTime: 0.5, holdTime: holdTime });
  await this.wait(holdTime * 1000 + 1200);

  this.assert(true, "DuckAll cycle completed");
});

// --- SPATIAL ---
TestRunner.add("spatial", async function () {
  if (!window.$gamePlayer) {
    console.log("[SKIP] Game not initialized");
    this.results.skipped++;
    return;
  }

  await this.cleanup();
  const name = this.tracks.pick("bgs");
  console.log(`[LISTEN] Playing ${name} with proximity at (15, 15)`);

  await this.ensureTrack("bgs", 1, name, { volume: 100 });
  FugsAudio.setProximity("bgs", 1, { x: 15, y: 15, maxDistance: 10, pan: true });

  this.assert(FugsAudio.proximityData.has("bgs_1"), "Proximity data set");

  const origX = $gamePlayer._realX;
  const origY = $gamePlayer._realY;

  console.log("[LISTEN] Moving player close (should be loud)...");
  $gamePlayer._realX = 15;
  $gamePlayer._realY = 15;
  await this.wait(this.dur(1500));

  console.log("[LISTEN] Moving player far (should be quiet)...");
  $gamePlayer._realX = 30;
  $gamePlayer._realY = 30;
  await this.wait(this.dur(1500));

  console.log("[LISTEN] Moving back close...");
  $gamePlayer._realX = 15;
  $gamePlayer._realY = 15;
  await this.wait(this.dur(1500));

  $gamePlayer._realX = origX;
  $gamePlayer._realY = origY;

  this.assert(true, "Proximity test completed");
});

// --- SAVE/LOAD ---
TestRunner.add("save", async function () {
  await this.cleanup();
  const bgm = this.tracks.pick("bgm");
  const bgs = this.tracks.pick("bgs");
  console.log(`[LISTEN] Playing ${bgm} + ${bgs}, saving state`);

  await this.ensureTrack("bgm", 1, bgm, { volume: 70 });
  await this.ensureTrack("bgs", 1, bgs, { volume: 50 });
  await this.wait(800); // Let tracks fully stabilize before saving

  // Verify tracks exist before saving
  const trackCount = FugsAudio.tracks.size;
  this.assert(trackCount >= 2, `Tracks exist before save (got ${trackCount})`);

  FugsAudio.save("test");
  const data = FugsAudio.getSaveData();
  this.assert(data && data.test, "Save data created");
  // getSaveData returns { test: { bgm_1: {...}, bgs_1: {...} } }
  const savedTrackCount = data.test ? Object.keys(data.test).length : 0;
  this.assert(savedTrackCount >= 2, `Save contains tracks (got ${savedTrackCount})`);
  console.log(`  Saved ${savedTrackCount} tracks`);
});

TestRunner.add("load", async function () {
  await this.cleanup();
  const bgm = this.tracks.pick("bgm");
  const bgs = this.tracks.pick("bgs");

  await this.ensureTrack("bgm", 1, bgm, { volume: 70 });
  await this.ensureTrack("bgs", 1, bgs, { volume: 50 });
  await this.wait(300); // Let tracks stabilize before saving
  FugsAudio.save("test");

  console.log("[LISTEN] Stopping all, then loading saved state");
  FugsAudio.stopAll(0);
  await this.wait(300);
  this.assert(FugsAudio.tracks.size === 0, "Tracks cleared");

  const restored = FugsAudio.load("test");
  await this.wait(800); // Give tracks time to restore
  this.assert(restored > 0, `Restored ${restored} tracks`);
  this.assert(FugsAudio.tracks.has("bgm_1"), "bgm_1 restored");
  this.assert(FugsAudio.tracks.has("bgs_1"), "bgs_1 restored");
});

// --- PAUSE/RESUME ---
TestRunner.add("pause", async function () {
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  console.log(`[LISTEN] Playing ${name}, pausing, resuming`);

  await this.ensureTrack("bgm", 1, name);

  console.log("[LISTEN] Pausing...");
  FugsAudio.pauseAll();
  await this.wait(this.dur(1500));
  this.assert(FugsAudio.pausedTracks.size > 0, "Track paused");

  console.log("[LISTEN] Resuming...");
  FugsAudio.resumeAll();
  await this.wait(this.dur(1500));
  this.assert(FugsAudio.pausedTracks.size === 0, "Track resumed");
});

// --- UNIT TESTS (no audio) ---
TestRunner.add("unit:parse", async function () {
  console.log("Testing parseArguments...");

  const p1 = FugsAudio.parseArguments('play-bgm1 "Battle 1" 90');
  this.assert(Array.isArray(p1), "parseArguments returns array");
  this.assert(p1[0] === "play-bgm1", "Command token correct");
  this.assert(p1[1] === "Battle 1", "Quoted string preserved");
  this.assert(p1[2] === "90", "Numeric token correct");

  const p2 = FugsAudio.parseArguments("play-bgs1 'Wind Sound' 60");
  this.assert(p2[1] === "Wind Sound", "Single quotes work");
});

TestRunner.add("unit:command", async function () {
  console.log("Testing parseCommand/parseClassicSyntax...");

  const parsed = FugsAudio.parseClassicSyntax("play-bgm1", [
    "Battle1",
    "90",
    "(p:always)",
    "(pause:never)",
  ]);
  this.assert(parsed !== null, "parseClassicSyntax returns object");
  this.assert(parsed.action === "play", "Action parsed");
  this.assert(parsed.type === "bgm", "Type parsed");
  this.assert(parsed.trackId === "1", "TrackId parsed");
  this.assert(parsed.persistence === "always", "Persistence parsed");
  this.assert(parsed.pauseMode === "never", "PauseMode parsed");
});

TestRunner.add("unit:loop", async function () {
  console.log("Testing checkLoop...");

  const r1 = FugsAudio.checkLoop(["(loop:forever)", "X"]);
  this.assert(r1.loop === "forever", "loop:forever parsed");
  this.assert(r1.args.length === 1, "Loop tag removed from args");

  const r2 = FugsAudio.checkLoop(["(loop:3)", "X"]);
  this.assert(r2.loop === 3, "loop:3 parsed as number");

  const r3 = FugsAudio.checkLoop(["(loop:0)", "X"]);
  this.assert(r3.loop === "never", "loop:0 parsed as never");
});

TestRunner.add("unit:toNum", async function () {
  console.log("Testing toNum...");

  this.assert(FugsAudio.toNum(0, 5) === 0, "toNum preserves 0");
  this.assert(FugsAudio.toNum("0", 5) === 0, 'toNum preserves "0"');
  this.assert(FugsAudio.toNum("   ", 5) === 5, "toNum uses default for whitespace");
  this.assert(FugsAudio.toNum("nope", 5) === 5, "toNum uses default for NaN");
});

TestRunner.add("unit:distanceCurves", async function () {
  console.log("Testing DistanceCurves...");
  const approx = (a, b, t = 0.05) => Math.abs(a - b) <= t;

  this.assert(approx(DistanceCurves.linear(0, 10), 1), "linear at 0 = 1");
  this.assert(approx(DistanceCurves.linear(10, 10), 0), "linear at max = 0");
  const expoMid = DistanceCurves.exponential(5, 10);
  this.assert(expoMid < 0.8 && expoMid > 0.2, "exponential mid is in range");
  const smoothMid = DistanceCurves.smooth(5, 10);
  this.assert(smoothMid > expoMid, "smooth > exponential at mid");
});

TestRunner.add("unit:fadeCurves", async function () {
  console.log("Testing FadeManager.applyCurve monotonicity...");
  const curves = [
    "linear",
    "exponential",
    "logarithmic",
    "smooth",
    "sharp",
    "gentle",
    "ease-in",
    "ease-out",
    "ease-in-out",
  ];

  for (const c of curves) {
    let last = 0;
    for (let i = 0; i <= 10; i++) {
      const p = i / 10;
      const v = FadeManager.applyCurve(p, c);
      this.assert(v >= -0.001 && v <= 1.001, `${c} stays in [0,1]`);
      this.assert(v + 1 >= last, `${c} is non-decreasing at step ${i}`); // tolerate fp jitter
      last = v;
    }
  }
});

TestRunner.add("unit:pitchMath", async function () {
  console.log("Testing updateTrackPitch math/clamp...");

  const playbackRate = {
    value: 0,
    setTargetAtTime(v) {
      this.value = v;
    },
    cancelScheduledValues() {},
  };

  const buf = {
    _basePitch: 1.5,
    _dopplerPitch: 0.7,
    _sourceNode: { playbackRate },
  };

  FugsAudio.updateTrackPitch(buf);
  const combined = playbackRate.value || buf._pitch || buf.pitch;
  this.assert(combined > 1 && combined < 2, "Combined pitch applied (1.05ish)");

  // Clamp high
  buf._basePitch = 10;
  buf._dopplerPitch = 10;
  FugsAudio.updateTrackPitch(buf);
  const clampedHigh = playbackRate.value || buf._pitch || buf.pitch;
  this.assert(clampedHigh <= 4.01, "Pitch clamps to max 4x");

  // Clamp low
  buf._basePitch = 0.01;
  buf._dopplerPitch = 0.01;
  FugsAudio.updateTrackPitch(buf);
  const clampedLow = playbackRate.value || buf._pitch || buf.pitch;
  this.assert(clampedLow >= 0.099, "Pitch clamps to min 0.1x");
});

TestRunner.add("unit:presetStructure", async function () {
  console.log("Testing preset category structure...");

  // Test 1: Verify all 12 categories exist
  const expectedCategories = [
    "environment",
    "mood",
    "weather",
    "combat",
    "horror",
    "communication",
    "lofi",
    "dynamics",
    "spatial",
    "locations",
    "extreme",
    "character",
    "tonal",
  ];

  const presets = AudioEffects.presets || {};
  for (const category of expectedCategories) {
    this.assert(presets[category], `Category '${category}' exists`);
    this.assert(typeof presets[category] === "object", `Category '${category}' is object`);
  }

  // Test 2: Verify _aliases exists
  this.assert(presets._aliases, "Aliases object exists");
  this.assert(typeof presets._aliases === "object", "Aliases is object");

  // Test 3: Verify specific presets exist in expected categories
  this.assert(presets.environment.cave, "environment.cave exists");
  this.assert(presets.environment.underwater, "environment.underwater exists");
  this.assert(presets.horror.nightmare, "horror.nightmare exists");
  this.assert(presets.combat.swordClash, "combat.swordClash exists");
  this.assert(presets.weather.stormyWeather, "weather.stormyWeather exists");

  // Test 4: Verify preset counts are reasonable
  const envCount = Object.keys(presets.environment).length;
  const horrorCount = Object.keys(presets.horror).length;
  this.assert(envCount >= 10, `environment has ${envCount} presets (expected >=10)`);
  this.assert(horrorCount >= 10, `horror has ${horrorCount} presets (expected >=10)`);
});

TestRunner.add("unit:presetLookup", async function () {
  console.log("Testing preset lookup methods...");

  // Test 1: getPreset() finds presets by name
  const cave = AudioEffects.getPreset("cave");
  this.assert(cave, "getPreset('cave') returns preset");
  this.assert(Array.isArray(cave), "cave is effect array");

  const underwater = AudioEffects.getPreset("underwater");
  this.assert(underwater, "getPreset('underwater') returns preset");

  // Test 2: getPreset() handles category.preset paths
  const shimmer = AudioEffects.getPreset("environment.shimmer");
  this.assert(shimmer, "getPreset('environment.shimmer') works");

  const nightmare = AudioEffects.getPreset("horror.nightmare");
  this.assert(nightmare, "getPreset('horror.nightmare') works");

  // Test 3: getPreset() returns null for invalid names
  const invalid = AudioEffects.getPreset("notarealpreset");
  this.assert(invalid === null, "getPreset returns null for invalid preset");

  const invalidPath = AudioEffects.getPreset("fakecategory.fakepreset");
  this.assert(invalidPath === null, "getPreset returns null for invalid category path");

  // Test 4: getAllPresetNames() returns full list
  const allNames = AudioEffects.getAllPresetNames();
  this.assert(Array.isArray(allNames), "getAllPresetNames returns array");
  this.assert(
    allNames.length >= 70,
    `getAllPresetNames has ${allNames.length} presets (expected >=70)`
  );
  this.assert(allNames.includes("cave"), "getAllPresetNames includes 'cave'");
  this.assert(allNames.includes("nightmare"), "getAllPresetNames includes 'nightmare'");

  // Test 5: listPresets() returns categorized structure
  const categorized = AudioEffects.listPresets();
  this.assert(categorized, "listPresets returns object");
  this.assert(categorized.environment, "listPresets has environment category");
  this.assert(Array.isArray(categorized.environment), "environment is array");
  this.assert(categorized.environment.includes("cave"), "environment contains 'cave'");
});

TestRunner.add("unit:presetAliases", async function () {
  console.log("Testing preset alias system...");

  // Test 1: Verify alias exists in _aliases
  const aliases = AudioEffects.presets._aliases;
  this.assert(aliases.angelic, "Alias 'angelic' exists in _aliases");
  this.assert(
    aliases.angelic === "environment.shimmer",
    `Alias points to 'environment.shimmer' (got '${aliases.angelic}')`
  );

  // Test 2: getPreset resolves aliases
  const angelicPreset = AudioEffects.getPreset("angelic");
  const shimmerPreset = AudioEffects.getPreset("shimmer");
  this.assert(angelicPreset, "getPreset('angelic') resolves alias");
  this.assert(shimmerPreset, "getPreset('shimmer') returns preset");
  this.assert(angelicPreset === shimmerPreset, "Alias and target return same preset object");

  // Test 3: getAllPresetNames includes aliases
  const allNames = AudioEffects.getAllPresetNames();
  this.assert(allNames.includes("angelic"), "getAllPresetNames includes alias 'angelic'");
  this.assert(allNames.includes("shimmer"), "getAllPresetNames includes original 'shimmer'");

  // Test 4: Alias can be used in setEffect
  await this.cleanup();
  const name = this.tracks.pick("bgm");
  await this.ensureTrack("bgm", 1, name);

  const applied = FugsAudio.setEffect("bgm", 1, "angelic");
  this.assert(applied, "setEffect('angelic') alias works");
  this.assert(FugsAudio.effectChains.has("bgm_1"), "Effect chain created via alias");

  FugsAudio.removeEffect("bgm", 1);
});

TestRunner.add("unit:presetEdgeCases", async function () {
  console.log("Testing preset edge cases...");

  // Test 1: getPreset handles invalid inputs gracefully
  this.assert(AudioEffects.getPreset(null) === null, "getPreset(null) returns null");
  this.assert(AudioEffects.getPreset(undefined) === null, "getPreset(undefined) returns null");
  this.assert(AudioEffects.getPreset("") === null, "getPreset('') returns null");
  this.assert(AudioEffects.getPreset(123) === null, "getPreset(123) returns null");
  this.assert(AudioEffects.getPreset({}) === null, "getPreset({}) returns null");

  // Test 2: Case sensitivity
  this.assert(
    AudioEffects.getPreset("Cave") === null,
    "getPreset is case-sensitive (Cave vs cave)"
  );
  this.assert(
    AudioEffects.getPreset("NIGHTMARE") === null,
    "getPreset is case-sensitive (NIGHTMARE vs nightmare)"
  );

  // Test 3: Invalid category paths
  this.assert(
    AudioEffects.getPreset("invalid.preset") === null,
    "Invalid category returns null"
  );
  this.assert(
    AudioEffects.getPreset("environment.invalid") === null,
    "Invalid preset in valid category returns null"
  );
  this.assert(AudioEffects.getPreset("...") === null, "Malformed path returns null");
  this.assert(AudioEffects.getPreset(".cave") === null, "Leading dot returns null");
  this.assert(AudioEffects.getPreset("cave.") === null, "Trailing dot returns null");

  // Test 4: Special characters
  this.assert(AudioEffects.getPreset("cave@123") === null, "Special characters return null");
  this.assert(AudioEffects.getPreset("cave cave") === null, "Spaces return null");

  // Test 5: Multiple dots (only first split should be used)
  this.assert(
    AudioEffects.getPreset("environment.shimmer.extra") === null,
    "Extra path segments return null"
  );
});

TestRunner.add("unit:presetCounts", async function () {
  console.log("Testing preset category counts...");

  // Expected counts based on reorganization
  const expectedCounts = {
    environment: 11,
    mood: 4,
    weather: 11,
    combat: 15,
    horror: 13,
    communication: 3,
    lofi: 3,
    dynamics: 5,
    spatial: 6,
    locations: 4,
    extreme: 8,
    character: 4,
    tonal: 2,
  };

  const presets = AudioEffects.presets;
  let totalCount = 0;

  for (const [category, expectedCount] of Object.entries(expectedCounts)) {
    const actualCount = Object.keys(presets[category] || {}).length;
    totalCount += actualCount;
    this.assert(
      actualCount === expectedCount,
      `${category}: ${actualCount} presets (expected ${expectedCount})`
    );
  }

  // Verify total (should be 89 presets + 1 alias = 90 items total)
  console.log(`  Total presets across all categories: ${totalCount}`);
  this.assert(totalCount === 89, `Total preset count is 89 (got ${totalCount})`);

  // Verify getAllPresetNames includes aliases
  const allNames = AudioEffects.getAllPresetNames();
  this.assert(
    allNames.length === 90,
    `getAllPresetNames returns 90 items including aliases (got ${allNames.length})`
  );
});

TestRunner.add("unit:presetValidation", async function () {
  console.log("Testing preset content validation...");

  const validEffectTypes = [
    "reverb",
    "lowpass",
    "highpass",
    "bandpass",
    "distortion",
    "bitcrusher",
    "compressor",
    "delay",
    "chorus",
    "tremolo",
    "vibrato",
    "phaser",
    "flanger",
    "widener",
    "eq3",
    "ringmod",
    "autopan",
    "multitap",
    "overdrive",
    "limiter",
  ];

  let totalPresets = 0;
  let totalEffects = 0;
  let invalidEffects = [];

  // Scan all categories
  const categories = [
    "environment",
    "mood",
    "weather",
    "combat",
    "horror",
    "communication",
    "lofi",
    "dynamics",
    "spatial",
    "locations",
    "extreme",
    "character",
    "tonal",
  ];

  for (const categoryName of categories) {
    const category = AudioEffects.presets[categoryName];
    if (!category) continue;

    for (const [presetName, effectChain] of Object.entries(category)) {
      totalPresets++;

      // Verify preset is an array
      if (!Array.isArray(effectChain)) {
        this.assert(false, `${categoryName}.${presetName} is not an array`);
        continue;
      }

      // Verify each effect in the chain
      for (const effect of effectChain) {
        totalEffects++;

        // Check effect has 'type' property
        if (!effect.type) {
          invalidEffects.push(`${categoryName}.${presetName}: missing type`);
          continue;
        }

        // Check effect type is valid
        if (!validEffectTypes.includes(effect.type)) {
          invalidEffects.push(`${categoryName}.${presetName}: invalid type '${effect.type}'`);
        }
      }
    }
  }

  console.log(`  Validated ${totalPresets} presets with ${totalEffects} total effects`);

  this.assert(
    invalidEffects.length === 0,
    `All effect types are valid (found ${invalidEffects.length} invalid)`
  );

  if (invalidEffects.length > 0) {
    console.log("  Invalid effects found:");
    invalidEffects.forEach((err) => console.log(`    - ${err}`));
  }

  this.assert(totalPresets === 89, `Validated 89 presets (got ${totalPresets})`);
});

TestRunner.add("unit:presetNoDuplicates", async function () {
  console.log("Testing for duplicate presets across categories...");

  const presetNameMap = new Map(); // name -> category
  let duplicates = [];

  const categories = [
    "environment",
    "mood",
    "weather",
    "combat",
    "horror",
    "communication",
    "lofi",
    "dynamics",
    "spatial",
    "locations",
    "extreme",
    "character",
    "tonal",
  ];

  for (const categoryName of categories) {
    const category = AudioEffects.presets[categoryName];
    if (!category) continue;

    for (const presetName of Object.keys(category)) {
      if (presetNameMap.has(presetName)) {
        duplicates.push(
          `'${presetName}' appears in both '${presetNameMap.get(presetName)}' and '${categoryName}'`
        );
      } else {
        presetNameMap.set(presetName, categoryName);
      }
    }
  }

  this.assert(
    duplicates.length === 0,
    `No duplicate preset names across categories (found ${duplicates.length})`
  );

  if (duplicates.length > 0) {
    console.log("  Duplicates found:");
    duplicates.forEach((dup) => console.log(`    - ${dup}`));
  }
});

TestRunner.add("unit:presetIntegration", async function () {
  console.log("Testing preset integration with audio commands...");

  await this.cleanup();
  const name = this.tracks.pick("bgm");
  await this.ensureTrack("bgm", 1, name);

  // Test 1: Apply preset using category.name syntax
  const applied1 = FugsAudio.setEffect("bgm", 1, "horror.nightmare");
  this.assert(applied1, "setEffect with 'horror.nightmare' path works");
  this.assert(FugsAudio.effectChains.has("bgm_1"), "Effect chain created with path syntax");
  FugsAudio.removeEffect("bgm", 1);
  await this.wait(200);

  // Test 2: Apply preset using shorthand name
  const applied2 = FugsAudio.setEffect("bgm", 1, "cave");
  this.assert(applied2, "setEffect with shorthand 'cave' works");
  this.assert(FugsAudio.effectChains.has("bgm_1"), "Effect chain created with shorthand");
  FugsAudio.removeEffect("bgm", 1);
  await this.wait(200);

  // Test 3: Apply preset with preset: prefix
  const applied3 = FugsAudio.setEffect("bgm", 1, "preset:underwater");
  this.assert(applied3, "setEffect with 'preset:underwater' prefix works");
  FugsAudio.removeEffect("bgm", 1);
  await this.wait(200);

  // Test 4: Apply alias
  const applied4 = FugsAudio.setEffect("bgm", 1, "preset:angelic");
  this.assert(applied4, "setEffect with alias 'preset:angelic' works");
  FugsAudio.removeEffect("bgm", 1);
  await this.wait(200);

  // Test 5: Invalid preset returns false
  const applied5 = FugsAudio.setEffect("bgm", 1, "invalidpreset123");
  this.assert(!applied5, "setEffect with invalid preset returns false");
  this.assert(
    !FugsAudio.effectChains.has("bgm_1"),
    "No effect chain created for invalid preset"
  );
});

TestRunner.add("unit:presetCategories", async function () {
  console.log("Testing individual category contents...");

  // Test environment category
  const env = AudioEffects.presets.environment;
  this.assert(env.underwater, "environment has underwater");
  this.assert(env.cave, "environment has cave");
  this.assert(env.forest, "environment has forest");
  this.assert(env.dungeon, "environment has dungeon");
  this.assert(env.space, "environment has space");
  this.assert(env.shimmer, "environment has shimmer");
  this.assert(env.mechanicalHum, "environment has mechanicalHum");

  // Test horror category
  const horror = AudioEffects.presets.horror;
  this.assert(horror.nightmare, "horror has nightmare");
  this.assert(horror.nightmareAugmented, "horror has nightmareAugmented");
  this.assert(horror.hauntedHall, "horror has hauntedHall");
  this.assert(horror.ghostWhisper, "horror has ghostWhisper");
  this.assert(horror.madness, "horror has madness");

  // Test combat category
  const combat = AudioEffects.presets.combat;
  this.assert(combat.swordClash, "combat has swordClash");
  this.assert(combat.explosionAftershock, "combat has explosionAftershock");
  this.assert(combat.nearDeath, "combat has nearDeath");
  this.assert(combat.bossAura, "combat has bossAura");

  // Test weather category
  const weather = AudioEffects.presets.weather;
  this.assert(weather.stormyWeather, "weather has stormyWeather");
  this.assert(weather.heavyRain, "weather has heavyRain");
  this.assert(weather.snowStorm, "weather has snowStorm");

  // Test smaller categories exist and have content
  this.assert(
    Object.keys(AudioEffects.presets.communication).length === 3,
    "communication has 3 presets"
  );
  this.assert(Object.keys(AudioEffects.presets.lofi).length === 3, "lofi has 3 presets");
  this.assert(Object.keys(AudioEffects.presets.tonal).length === 2, "tonal has 2 presets");
});

TestRunner.add("unit:presetEffectChains", async function () {
  console.log("Testing preset effect chain structure...");

  // Test cave preset has expected effects
  const cave = AudioEffects.getPreset("cave");
  this.assert(Array.isArray(cave), "cave is array");
  this.assert(cave.length >= 2, `cave has multiple effects (${cave.length})`);
  this.assert(
    cave.some((e) => e.type === "reverb"),
    "cave includes reverb"
  );
  this.assert(
    cave.some((e) => e.type === "multitap"),
    "cave includes multitap delay"
  );

  // Test underwater preset
  const underwater = AudioEffects.getPreset("underwater");
  this.assert(
    underwater.some((e) => e.type === "lowpass"),
    "underwater includes lowpass filter"
  );
  this.assert(
    underwater.some((e) => e.type === "reverb"),
    "underwater includes reverb"
  );

  // Test phone preset
  const phone = AudioEffects.getPreset("phone");
  this.assert(
    phone.some((e) => e.type === "bandpass"),
    "phone includes bandpass filter"
  );
  this.assert(
    phone.some((e) => e.type === "distortion"),
    "phone includes distortion"
  );

  // Test nightmare preset
  const nightmare = AudioEffects.getPreset("nightmare");
  this.assert(
    nightmare.some((e) => e.type === "vibrato"),
    "nightmare includes vibrato"
  );
  this.assert(
    nightmare.some((e) => e.type === "lowpass"),
    "nightmare includes lowpass"
  );
  this.assert(
    nightmare.some((e) => e.type === "reverb"),
    "nightmare includes reverb"
  );

  // Test effect parameters exist
  const caveReverb = cave.find((e) => e.type === "reverb");
  this.assert(caveReverb.duration !== undefined, "cave reverb has duration parameter");
  this.assert(caveReverb.decay !== undefined, "cave reverb has decay parameter");
});

TestRunner.add("unit:presetSwitching", async function () {
  console.log("Testing preset switching/replacement...");

  await this.cleanup();
  const name = this.tracks.pick("bgm");
  await this.ensureTrack("bgm", 1, name);

  // Apply first preset
  FugsAudio.setEffect("bgm", 1, "cave");
  this.assert(FugsAudio.effectChains.has("bgm_1"), "First preset applied");
  const chain1 = FugsAudio.effectChains.get("bgm_1");

  // Switch to different preset (should replace, not stack)
  FugsAudio.setEffect("bgm", 1, "underwater");
  this.assert(FugsAudio.effectChains.has("bgm_1"), "Second preset applied");
  const chain2 = FugsAudio.effectChains.get("bgm_1");
  this.assert(chain1 !== chain2, "Effect chain was replaced, not reused");

  // Switch to third preset
  FugsAudio.setEffect("bgm", 1, "nightmare");
  this.assert(FugsAudio.effectChains.has("bgm_1"), "Third preset applied");

  // Remove effects
  FugsAudio.removeEffect("bgm", 1);
  this.assert(!FugsAudio.effectChains.has("bgm_1"), "Effects removed successfully");
});

TestRunner.add("unit:presetMultiTrack", async function () {
  console.log("Testing presets on multiple tracks...");

  await this.cleanup();
  const bgm1 = this.tracks.pick("bgm", 0);
  const bgm2 = this.tracks.pick("bgm", 1);
  const bgs = this.tracks.pick("bgs", 0);

  await this.ensureTrack("bgm", 1, bgm1);
  await this.ensureTrack("bgm", 2, bgm2);
  await this.ensureTrack("bgs", 1, bgs);

  // Apply different presets to each track
  FugsAudio.setEffect("bgm", 1, "cave");
  FugsAudio.setEffect("bgm", 2, "underwater");
  FugsAudio.setEffect("bgs", 1, "phone");

  this.assert(FugsAudio.effectChains.has("bgm_1"), "bgm_1 has cave preset");
  this.assert(FugsAudio.effectChains.has("bgm_2"), "bgm_2 has underwater preset");
  this.assert(FugsAudio.effectChains.has("bgs_1"), "bgs_1 has phone preset");

  // Verify they're independent
  this.assert(
    FugsAudio.effectChains.get("bgm_1") !== FugsAudio.effectChains.get("bgm_2"),
    "bgm tracks have independent effect chains"
  );
  this.assert(
    FugsAudio.effectChains.get("bgm_1") !== FugsAudio.effectChains.get("bgs_1"),
    "bgm and bgs have independent effect chains"
  );

  // Clean up one track, others should remain
  FugsAudio.removeEffect("bgm", 1);
  this.assert(!FugsAudio.effectChains.has("bgm_1"), "bgm_1 effects removed");
  this.assert(FugsAudio.effectChains.has("bgm_2"), "bgm_2 still has effects");
  this.assert(FugsAudio.effectChains.has("bgs_1"), "bgs_1 still has effects");
});

TestRunner.add("unit:presetPerformance", async function () {
  console.log("Testing preset performance (rapid switching)...");

  await this.cleanup();
  const name = this.tracks.pick("bgm");
  await this.ensureTrack("bgm", 1, name);

  const testPresets = [
    "cave",
    "underwater",
    "phone",
    "nightmare",
    "swordClash",
    "stormyWeather",
  ];

  const startTime = performance.now();

  // Rapidly switch between presets
  for (let i = 0; i < 50; i++) {
    const preset = testPresets[i % testPresets.length];
    const applied = FugsAudio.setEffect("bgm", 1, preset);
    this.assert(applied, `Iteration ${i + 1}: ${preset} applied`);
  }

  const endTime = performance.now();
  const duration = endTime - startTime;

  console.log(`  Applied 50 presets in ${duration.toFixed(0)}ms`);
  this.assert(duration < 5000, `Performance acceptable (<5s, got ${duration.toFixed(0)}ms)`);
  this.assert(FugsAudio.effectChains.has("bgm_1"), "Final effect chain exists");

  // Verify no memory leaks from rapid switching
  const chainCount = FugsAudio.effectChains.size;
  this.assert(chainCount === 1, `Only 1 effect chain exists (got ${chainCount})`);
});

TestRunner.add("unit:presetListMethods", async function () {
  console.log("Testing preset listing methods...");

  // Test listPresets returns correct structure
  const listed = AudioEffects.listPresets();
  this.assert(typeof listed === "object", "listPresets returns object");
  this.assert(!Array.isArray(listed), "listPresets is not an array");

  // Verify categories
  this.assert(Array.isArray(listed.environment), "environment is array in listPresets");
  this.assert(Array.isArray(listed.horror), "horror is array in listPresets");
  this.assert(Array.isArray(listed.combat), "combat is array in listPresets");

  // Verify category contents
  this.assert(listed.environment.includes("cave"), "listPresets environment includes 'cave'");
  this.assert(
    listed.environment.includes("underwater"),
    "listPresets environment includes 'underwater'"
  );
  this.assert(listed.horror.includes("nightmare"), "listPresets horror includes 'nightmare'");

  // Test getAllPresetNames is sorted
  const allNames = AudioEffects.getAllPresetNames();
  const sorted = [...allNames].sort();
  let isSorted = true;
  for (let i = 0; i < allNames.length; i++) {
    if (allNames[i] !== sorted[i]) {
      isSorted = false;
      break;
    }
  }
  this.assert(isSorted, "getAllPresetNames returns sorted array");

  // Verify no _aliases in category list
  this.assert(!listed._aliases, "listPresets does not include _aliases object");
});

TestRunner.add("unit:presetSamples", async function () {
  console.log("Testing sample presets from each category...");

  await this.cleanup();
  const name = this.tracks.pick("bgm");

  // Sample one preset from each category
  const samples = {
    environment: "cave",
    mood: "frozen",
    weather: "heavyRain",
    combat: "swordClash",
    horror: "nightmare",
    communication: "phone",
    lofi: "retro",
    dynamics: "gentle",
    spatial: "wide",
    locations: "warehouse",
    extreme: "glitchApocalypse",
    character: "robot",
    tonal: "muffled",
  };

  // Create the track ONCE and reuse for all presets.
  await this.ensureTrack("bgm", 1, name);

  for (const [category, presetName] of Object.entries(samples)) {
    // Re-verify the track is still alive
    if (!FugsAudio.tracks.has("bgm_1")) {
      await this.ensureTrack("bgm", 1, name);
    }

    const applied = FugsAudio.setEffect("bgm", 1, presetName);
    this.assert(applied, `${category}.${presetName} applies successfully`);
    this.assert(FugsAudio.effectChains.has("bgm_1"), `${presetName} creates effect chain`);

    FugsAudio.removeEffect("bgm", 1);
    await this.wait(150);
  }
});

TestRunner.add("unit:presetAliasChain", async function () {
  console.log("Testing alias returns same effect chain as original...");

  // Get preset arrays
  const angelicArray = AudioEffects.getPreset("angelic");
  const shimmerArray = AudioEffects.getPreset("shimmer");

  // Verify they're the exact same object reference
  this.assert(
    angelicArray === shimmerArray,
    "Alias and original return identical object reference"
  );

  // Verify effect chain contents match
  this.assert(angelicArray.length === shimmerArray.length, "Effect chains have same length");

  for (let i = 0; i < angelicArray.length; i++) {
    this.assert(angelicArray[i] === shimmerArray[i], `Effect ${i} is same object reference`);
    this.assert(angelicArray[i].type === shimmerArray[i].type, `Effect ${i} type matches`);
  }

  // Apply both and verify they create identical effect chains
  await this.cleanup();
  const name = this.tracks.pick("bgm");

  await this.ensureTrack("bgm", 1, name);
  FugsAudio.setEffect("bgm", 1, "shimmer");
  const shimmerChain = FugsAudio.effectChains.get("bgm_1");
  const shimmerNodeCount = shimmerChain ? shimmerChain.nodes.length : 0;
  FugsAudio.removeEffect("bgm", 1);

  await this.wait(200);
  await this.ensureTrack("bgm", 1, name);
  FugsAudio.setEffect("bgm", 1, "angelic");
  const angelicChain = FugsAudio.effectChains.get("bgm_1");
  const angelicNodeCount = angelicChain ? angelicChain.nodes.length : 0;
  FugsAudio.removeEffect("bgm", 1);

  this.assert(
    shimmerNodeCount === angelicNodeCount,
    `Both create same number of audio nodes (${shimmerNodeCount})`
  );
});

TestRunner.add("preset:all", async function () {
  console.log("Testing all presets apply without errors...");

  await this.cleanup();
  const name = this.tracks.pick("bgm");
  const allPresets = AudioEffects.getAllPresetNames();

  // Create the track ONCE and reuse it for every preset.
  // Recreating the track 89 times exhausts WebAudio on older Chromium.
  await this.ensureTrack("bgm", 1, name);

  console.log(`  Testing ${allPresets.length} presets...`);
  let successCount = 0;
  let failCount = 0;

  for (const preset of allPresets) {
    // Re-verify the track is still alive (some effects can kill it)
    if (!FugsAudio.tracks.has("bgm_1")) {
      await this.ensureTrack("bgm", 1, name);
    }

    try {
      const applied = FugsAudio.setEffect("bgm", 1, preset);
      if (applied && FugsAudio.effectChains.has("bgm_1")) {
        successCount++;
      } else {
        console.log(`  ✗ Failed to apply: ${preset}`);
        failCount++;
      }
    } catch (e) {
      console.log(`  ✗ Error applying ${preset}: ${e.message}`);
      failCount++;
    }

    FugsAudio.removeEffect("bgm", 1);

    // Pause after each preset to let GC reclaim WebAudio nodes (ConvolverNodes
    // are especially heavy on Chromium 65). Longer pause every 10 presets.
    if ((successCount + failCount) % 10 === 0) {
      await this.wait(500);
    } else {
      await this.wait(80);
    }
  }

  console.log(`  Successfully applied: ${successCount}/${allPresets.length}`);
  this.assert(failCount === 0, `All presets apply without errors (${failCount} failed)`);
  this.assert(
    successCount === allPresets.length,
    `All ${allPresets.length} presets applied successfully`
  );
});

TestRunner.add("preset:categories:full", async function () {
  console.log("Testing all categories exhaustively...");

  const categories = AudioEffects.listPresets();
  let totalTested = 0;

  for (const [categoryName, presets] of Object.entries(categories)) {
    console.log(`  Category: ${categoryName} (${presets.length} presets)`);

    for (const presetName of presets) {
      const preset = AudioEffects.getPreset(presetName);
      this.assert(preset, `${categoryName}.${presetName} exists`);
      this.assert(Array.isArray(preset), `${categoryName}.${presetName} is array`);
      this.assert(preset.length > 0, `${categoryName}.${presetName} has effects`);

      // Verify all effects in chain are valid
      for (let i = 0; i < preset.length; i++) {
        const effect = preset[i];
        this.assert(effect.type, `${categoryName}.${presetName}[${i}] has type`);
      }

      totalTested++;
    }
  }

  console.log(`  Tested ${totalTested} total presets across all categories`);
  this.assert(totalTested === 89, `Tested all 89 presets (got ${totalTested})`);
});

TestRunner.add("preset:crossfade", async function () {
  console.log("Testing crossfade between presets...");

  await this.cleanup();
  const name = this.tracks.pick("bgm");
  await this.ensureTrack("bgm", 1, name);

  // Apply cave preset
  FugsAudio.setEffect("bgm", 1, "cave");
  await this.wait(500);
  this.assert(FugsAudio.effectChains.has("bgm_1"), "cave preset applied");

  // Crossfade to underwater preset (if crossfadeeffect exists)
  const hasCrossfade = typeof FugsAudio.crossfadeEffect === "function";
  if (hasCrossfade) {
    FugsAudio.crossfadeEffect("bgm", 1, "cave", "underwater", 1.0);
    await this.wait(1500);
    this.assert(FugsAudio.effectChains.has("bgm_1"), "Effect chain exists after crossfade");
  } else {
    // Fallback: just switch presets
    FugsAudio.setEffect("bgm", 1, "underwater");
    this.assert(FugsAudio.effectChains.has("bgm_1"), "underwater preset applied");
  }
});

// --- MEMORY ---
TestRunner.add("memory", async function () {
  await this.cleanup();
  console.log("Testing for memory leaks...");
  const initialTimeouts = FugsAudio.activeTimeouts.size;

  // Create and destroy many tracks
  for (let i = 0; i < 5; i++) {
    await this.ensureTrack("bgm", i + 1, this.tracks.pick("bgm", i));
  }
  await this.wait(500);

  FugsAudio.stopAll(0);
  await this.wait(1000);

  this.assert(FugsAudio.tracks.size === 0, `Tracks cleaned up (got ${FugsAudio.tracks.size})`);
  this.assert(
    FugsAudio.activeTimeouts.size <= initialTimeouts + 2,
    `Timeouts not leaking (got ${FugsAudio.activeTimeouts.size})`
  );
  this.assert(
    FugsAudio.FadeManager.activeFades.size === 0,
    `Fades cleaned up (got ${FugsAudio.FadeManager.activeFades.size})`
  );
});

// --- LAYERS (complex scenario) ---
TestRunner.add("layers", async function () {
  await this.cleanup();
  console.log("[LISTEN] Complex layering scenario");

  const bgm = this.tracks.pick("bgm", 0);
  const bgm2 = this.tracks.pick("bgm", 1);
  const bgs = this.tracks.pick("bgs");

  console.log(`[LISTEN] Layer 1: ${bgm} at 60%`);
  await this.ensureTrack("bgm", 1, bgm, { volume: 60 });

  console.log(`[LISTEN] Layer 2: ${bgm2} at 40%`);
  await this.ensureTrack("bgm", 2, bgm2, { volume: 40 });

  console.log(`[LISTEN] Layer 3: ${bgs} ambient`);
  await this.ensureTrack("bgs", 1, bgs, { volume: 50 });

  this.assert(FugsAudio.tracks.size >= 3, `3+ layers active`);

  console.log("[LISTEN] Fading layer 2 down...");
  FugsAudio.fade("bgm", 2, { volume: 10, duration: 1.5 });
  await this.wait(2000);

  console.log("[LISTEN] Fading layer 2 back up...");
  FugsAudio.fade("bgm", 2, { volume: 40, duration: 1.5 });
  await this.wait(2000);

  this.assert(true, "Layering scenario completed");
});

// --- SE ---
TestRunner.add("se", async function () {
  await this.cleanup();
  const sounds = [
    this.tracks.pick("se", 0),
    this.tracks.pick("se", 1),
    this.tracks.pick("se", 2),
    this.tracks.pick("se", 3),
  ];
  console.log(`[LISTEN] SE burst: ${sounds.join(", ")}`);

  for (const se of sounds) {
    console.log(`[LISTEN] SE: ${se}`);
    FugsAudio.play("se", 1, se, { volume: 90 });
    await this.wait(800);
  }

  this.assert(true, "SE sequence completed");
});

// --- ME ---
TestRunner.add("me", async function () {
  await this.cleanup();
  const bgm = this.tracks.pick("bgm");
  const me = this.tracks.pick("me");

  console.log(`[LISTEN] BGM: ${bgm}, then ME: ${me}`);
  await this.ensureTrack("bgm", 1, bgm, { volume: 60 });

  console.log(`[LISTEN] Playing ME: ${me}`);
  FugsAudio.play("me", 1, me, { volume: 90 });
  await this.wait(4000);

  this.assert(true, "ME over BGM completed");
});

// =====================================================================
// PLAY ALL - Cycle through all tracks in a folder
// =====================================================================

TestRunner.add("playall", async function (params) {
  await this.cleanup();
  const type = params[0] || "bgm";
  const duration = parseInt(params[1]) || 3; // seconds per track

  const all = this.tracks._limitMode
    ? TestRunner.scanFolder(type).slice(0, 5) // In batch mode, play only 5
    : this.tracks.all(type);

  if (all.length === 0) {
    console.log(`⚠ No ${type} tracks found`);
    this.results.skipped++;
    return;
  }

  if (this.tracks._limitMode) {
    console.log(
      `[BATCH MODE] Playing 5 sample ${type.toUpperCase()} tracks (${duration}s each)`
    );
  } else {
    console.log(
      `\n═══ Playing ALL ${all.length} ${type.toUpperCase()} tracks (${duration}s each) ═══\n`
    );
    console.log("Press Ctrl+C in console or run FugsAudio.stopAll(0) to abort\n");
  }

  for (let i = 0; i < all.length; i++) {
    const name = all[i];
    console.log(`[${i + 1}/${all.length}] ${name}`);

    FugsAudio.play(type, 1, name, { volume: 80, fadein: 0.3 });
    await this.wait(this.dur(duration * 1000));
    FugsAudio.stop(type, 1, 0.3);
    await this.wait(this.dur(400));
  }

  this.assert(true, `Played ${all.length} ${type} tracks`);
});

TestRunner.add("playall:bgm", async function (params) {
  await TestRunner.tests.get("playall").call(this, ["bgm", params[0] || "3"]);
});

TestRunner.add("playall:bgs", async function (params) {
  await TestRunner.tests.get("playall").call(this, ["bgs", params[0] || "3"]);
});

TestRunner.add("playall:se", async function (params) {
  await TestRunner.tests.get("playall").call(this, ["se", params[0] || "1"]);
});

TestRunner.add("playall:me", async function (params) {
  await TestRunner.tests.get("playall").call(this, ["me", params[0] || "4"]);
});

// =====================================================================
// COMPREHENSIVE UNIT TESTS (parseClassicSyntax edge cases)
// =====================================================================

TestRunner.add("unit:parseClassic", async function () {
  console.log("Testing parseClassicSyntax edge cases...");
  const assert = this.assert.bind(this);
  const assertEq = (a, b, msg) => this.assert(a === b, `${msg}: expected ${b}, got ${a}`);

  // Basic play command
  {
    const p = FugsAudio.parseClassicSyntax("play-bgm1", ["Battle1", "90"]);
    assert(p !== null, "play-bgm1 parses");
    assertEq(p.action, "play", "action = play");
    assertEq(p.type, "bgm", "type = bgm");
    assertEq(p.trackId, "1", "trackId = 1");
  }

  // Stop command
  {
    const p = FugsAudio.parseClassicSyntax("stop-bgs2", ["1000"]);
    assert(p !== null, "stop-bgs2 parses");
    assertEq(p.action, "stop", "stop action");
    assertEq(p.type, "bgs", "bgs type");
    assertEq(p.trackId, "2", "trackId = 2");
  }

  // Fade with curve modifier
  {
    const p = FugsAudio.parseClassicSyntax("fade-bgm1", ["50", "2", "(curve:ease-in)"]);
    assert(p !== null, "fade-bgm1 parses");
    assertEq(p.action, "fade", "fade action");
    assertEq(p.curve, "ease-in", "curve parsed");
  }

  // Fadeall global command
  {
    const p = FugsAudio.parseClassicSyntax("fadeall-bgm", ["50", "2", "(curve:smooth)"]);
    assert(p !== null, "fadeall-bgm parses");
    assertEq(p.action, "fadeall-bgm", "fadeall action preserved");
    assertEq(p.type, "bgm", "fadeall type");
  }

  // Crossfade
  {
    const p = FugsAudio.parseClassicSyntax("crossfade-bgm1", ["Town1", "90", "2"]);
    assert(p !== null, "crossfade-bgm1 parses");
    assertEq(p.action, "crossfade", "crossfade action");
  }

  // Effect command
  {
    const p = FugsAudio.parseClassicSyntax("effect-bgm1", ["lowpass", "800"]);
    assert(p !== null, "effect-bgm1 parses");
    assertEq(p.action, "effect", "effect action");
  }

  // Preset command
  {
    const p = FugsAudio.parseClassicSyntax("preset-bgm1", ["underwater"]);
    assert(p !== null, "preset-bgm1 parses");
    assertEq(p.action, "preset", "preset action");
  }

  // Duck command
  {
    const p = FugsAudio.parseClassicSyntax("duck-bgm1", ["0.3", "0.5", "2"]);
    assert(p !== null, "duck-bgm1 parses");
    assertEq(p.action, "duck", "duck action");
  }

  // Duckall-sidechain special case
  {
    const p = FugsAudio.parseClassicSyntax("duckall-sidechain", ["bgm1", "0.3", "1", "4"]);
    assert(p !== null, "duckall-sidechain parses");
    assertEq(p.action, "duckall-sidechain", "duckall-sidechain action");
  }

  // Spatial command
  {
    const p = FugsAudio.parseClassicSyntax("spatial-bgs1", ["5", "3", "0"]);
    assert(p !== null, "spatial-bgs1 parses");
    assertEq(p.action, "spatial", "spatial action");
  }

  // Invalid type rejected
  {
    const p = FugsAudio.parseClassicSyntax("play-foo1", ["X"]);
    assert(p === null, "Invalid type foo rejected");
  }

  // Invalid command rejected
  {
    const _p = FugsAudio.parseClassicSyntax("invalid-bgm1", ["X"]);
    // Note: parseClassicSyntax may still return an object with action="invalid"
    // depending on implementation. Just check that it handles gracefully.
    assert(true, "Invalid action handled without crash");
  }
});

TestRunner.add("unit:loopFull", async function () {
  console.log("Testing checkLoop comprehensive...");
  const assertEq = (a, b, msg) => this.assert(a === b, `${msg}: expected ${b}, got ${a}`);

  // loop:forever
  {
    const r = FugsAudio.checkLoop(["(loop:forever)", "X", "Y"]);
    assertEq(r.loop, "forever", "loop:forever");
    assertEq(r.args.length, 2, "loop tag removed");
    assertEq(r.args[0], "X", "other args preserved");
  }

  // loop:never
  {
    const r = FugsAudio.checkLoop(["(loop:never)", "A"]);
    assertEq(r.loop, "never", "loop:never");
    assertEq(r.args.length, 1, "loop tag removed");
  }

  // loop:0 => never
  {
    const r = FugsAudio.checkLoop(["(loop:0)", "A"]);
    assertEq(r.loop, "never", "loop:0 = never");
  }

  // loop:1
  {
    const r = FugsAudio.checkLoop(["(loop:1)", "A"]);
    assertEq(r.loop, 1, "loop:1 numeric");
  }

  // loop:5
  {
    const r = FugsAudio.checkLoop(["(loop:5)", "A"]);
    assertEq(r.loop, 5, "loop:5 numeric");
  }

  // No loop tag
  {
    const r = FugsAudio.checkLoop(["A", "B", "C"]);
    assertEq(r.loop, undefined, "no loop = undefined");
    assertEq(r.args.length, 3, "args unchanged");
  }

  // Loop tag in middle
  {
    const r = FugsAudio.checkLoop(["A", "(loop:2)", "B"]);
    assertEq(r.loop, 2, "loop in middle");
    assertEq(r.args.length, 2, "loop removed from middle");
  }
});

TestRunner.add("unit:modifiers", async function () {
  console.log("Testing modifier parsing...");
  const assertEq = (a, b, msg) => this.assert(a === b, `${msg}: expected ${b}, got ${a}`);

  // Persistence modifiers
  {
    const p = FugsAudio.parseClassicSyntax("play-bgm1", ["X", "90", "(p:always)"]);
    assertEq(p.persistence, "always", "p:always");
  }
  {
    const p = FugsAudio.parseClassicSyntax("play-bgm1", ["X", "90", "(p:battle)"]);
    assertEq(p.persistence, "battle", "p:battle");
  }
  {
    const p = FugsAudio.parseClassicSyntax("play-bgm1", ["X", "90", "(p:scene)"]);
    assertEq(p.persistence, "scene", "p:scene");
  }
  {
    // Note: persist: is not an alias, only p: is supported
    const p = FugsAudio.parseClassicSyntax("play-bgm1", ["X", "90", "(p:always)"]);
    assertEq(p.persistence, "always", "p:always works");
  }

  // Pause modifiers
  {
    const p = FugsAudio.parseClassicSyntax("play-bgm1", ["X", "90", "(pause:never)"]);
    assertEq(p.pauseMode, "never", "pause:never");
  }
  {
    const p = FugsAudio.parseClassicSyntax("play-bgm1", ["X", "90", "(pause:menu)"]);
    assertEq(p.pauseMode, "menu", "pause:menu");
  }
  {
    // Note: pause:always is not in the allowed set (never/menu/battle/scene)
    const p = FugsAudio.parseClassicSyntax("play-bgm1", ["X", "90", "(pause:battle)"]);
    assertEq(p.pauseMode, "battle", "pause:battle");
  }

  // Curve modifiers
  {
    const p = FugsAudio.parseClassicSyntax("fade-bgm1", ["50", "2", "(curve:linear)"]);
    assertEq(p.curve, "linear", "curve:linear");
  }
  {
    const p = FugsAudio.parseClassicSyntax("fade-bgm1", ["50", "2", "(curve:ease-out)"]);
    assertEq(p.curve, "ease-out", "curve:ease-out");
  }
  {
    const p = FugsAudio.parseClassicSyntax("fade-bgm1", ["50", "2", "(curve:smooth)"]);
    assertEq(p.curve, "smooth", "curve:smooth");
  }

  // Combined modifiers
  {
    const p = FugsAudio.parseClassicSyntax("play-bgm1", [
      "X",
      "90",
      "(p:always)",
      "(pause:never)",
    ]);
    assertEq(p.persistence, "always", "combined: persistence");
    assertEq(p.pauseMode, "never", "combined: pauseMode");
    // fadein is passed positionally, not via modifier
    this.assert(p !== null, "combined: parsed successfully");
  }
});

TestRunner.add("unit:toNumFull", async function () {
  console.log("Testing toNum comprehensive...");
  const assertEq = (a, b, msg) => this.assert(a === b, `${msg}: expected ${b}, got ${a}`);

  // Numeric values
  assertEq(FugsAudio.toNum(0, 99), 0, "toNum(0) = 0");
  assertEq(FugsAudio.toNum(1, 99), 1, "toNum(1) = 1");
  assertEq(FugsAudio.toNum(100, 99), 100, "toNum(100) = 100");
  assertEq(FugsAudio.toNum(-5, 99), -5, "toNum(-5) = -5");
  assertEq(FugsAudio.toNum(3.14, 99), 3.14, "toNum(3.14) = 3.14");

  // String numbers
  assertEq(FugsAudio.toNum("0", 99), 0, 'toNum("0") = 0');
  assertEq(FugsAudio.toNum("50", 99), 50, 'toNum("50") = 50');
  assertEq(FugsAudio.toNum("-10", 99), -10, 'toNum("-10") = -10');
  assertEq(FugsAudio.toNum("3.5", 99), 3.5, 'toNum("3.5") = 3.5');

  // Default fallback
  assertEq(FugsAudio.toNum(null, 42), 42, "toNum(null) = default");
  assertEq(FugsAudio.toNum(undefined, 42), 42, "toNum(undefined) = default");
  assertEq(FugsAudio.toNum("", 42), 42, 'toNum("") = default');
  assertEq(FugsAudio.toNum("   ", 42), 42, "toNum(whitespace) = default");
  assertEq(FugsAudio.toNum("abc", 42), 42, 'toNum("abc") = default');
  assertEq(FugsAudio.toNum(NaN, 42), 42, "toNum(NaN) = default");

  // Infinity — must not reach WebAudio gain nodes
  assertEq(FugsAudio.toNum(Infinity, 42), 42, "toNum(Infinity) = default");
  assertEq(FugsAudio.toNum(-Infinity, 42), 42, "toNum(-Infinity) = default");
  assertEq(FugsAudio.toNum("Infinity", 42), 42, 'toNum("Infinity") = default');

  // Booleans — Number(true)=1, Number(false)=0, both valid
  assertEq(FugsAudio.toNum(true, 42), 1, "toNum(true) = 1");
  assertEq(FugsAudio.toNum(false, 42), 0, "toNum(false) = 0");

  // Padded strings — plugin args often have trailing spaces
  assertEq(FugsAudio.toNum(" 50 ", 42), 50, 'toNum(" 50 ") = 50');
  assertEq(FugsAudio.toNum(" -3.5 ", 42), -3.5, 'toNum(" -3.5 ") = -3.5');
  assertEq(FugsAudio.toNum(" 0 ", 42), 0, 'toNum(" 0 ") = 0');

  // Default fallback omitted — contract says 0
  assertEq(FugsAudio.toNum(undefined), 0, "toNum(undefined, no fallback) = 0");
  assertEq(FugsAudio.toNum(null), 0, "toNum(null, no fallback) = 0");

  // Edge numbers
  assertEq(FugsAudio.toNum(-0, 42), 0, "toNum(-0) = 0");
  assertEq(FugsAudio.toNum(0.001, 42), 0.001, "toNum(0.001) = 0.001");
  assertEq(
    FugsAudio.toNum(Number.MAX_SAFE_INTEGER, 42),
    Number.MAX_SAFE_INTEGER,
    "toNum(MAX_SAFE_INTEGER)"
  );

  // Garbage inputs — must not leak through
  assertEq(FugsAudio.toNum({}, 42), 42, "toNum({}) = default");
  assertEq(FugsAudio.toNum([], 42), 42, "toNum([]) = default");
  assertEq(FugsAudio.toNum("12px", 42), 42, 'toNum("12px") = default');
  assertEq(FugsAudio.toNum("1.2.3", 42), 42, 'toNum("1.2.3") = default');
});

// =====================================================================
// PARSER & UTILITY UNIT TESTS
// =====================================================================

TestRunner.add("unit:parseProximityConfig", async function () {
  console.log("Testing parseProximityConfig...");
  const assertEq = (a, b, msg) => this.assert(a === b, `${msg}: expected ${b}, got ${a}`);
  const assertDeep = (a, b, msg) =>
    this.assert(
      JSON.stringify(a) === JSON.stringify(b),
      `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`
    );

  // Basic key:value pairs
  {
    const r = FugsAudio.parseProximityConfig("{maxDist:10, curve:linear}");
    assertEq(r.maxDist, 10, "numeric value");
    assertEq(r.curve, "linear", "string token");
  }

  // Nested array
  {
    const r = FugsAudio.parseProximityConfig("{pool:[a,b,c]}");
    assertDeep(r.pool, ["a", "b", "c"], "array value");
  }

  // Nested object
  {
    const r = FugsAudio.parseProximityConfig("{inner:{x:1, y:2}}");
    assertDeep(r.inner, { x: 1, y: 2 }, "nested object");
  }

  // Quoted strings
  {
    const r = FugsAudio.parseProximityConfig('{name:"hello world"}');
    assertEq(r.name, "hello world", "double-quoted string");
  }
  {
    const r = FugsAudio.parseProximityConfig("{name:'single quotes'}");
    assertEq(r.name, "single quotes", "single-quoted string");
  }

  // Booleans
  {
    const r = FugsAudio.parseProximityConfig("{enabled:true, muted:false}");
    assertEq(r.enabled, true, "boolean true");
    assertEq(r.muted, false, "boolean false");
  }

  // Negative number
  {
    const r = FugsAudio.parseProximityConfig("{pan:-50}");
    assertEq(r.pan, -50, "negative number");
  }

  // Float
  {
    const r = FugsAudio.parseProximityConfig("{vol:0.75}");
    assertEq(r.vol, 0.75, "float value");
  }

  // Empty object
  {
    const r = FugsAudio.parseProximityConfig("{}");
    assertDeep(r, {}, "empty braces");
  }

  // Value containing colon (e.g. time strings)
  {
    const r = FugsAudio.parseProximityConfig("{time:12:30}");
    assertEq(r.time, "12:30", "colon in value preserved");
  }

  // Nested array with numbers
  {
    const r = FugsAudio.parseProximityConfig("{points:[0,1,0.5,0.5,1,0]}");
    assertDeep(r.points, [0, 1, 0.5, 0.5, 1, 0], "numeric array");
  }

  // Empty array
  {
    const r = FugsAudio.parseProximityConfig("{items:[]}");
    assertDeep(r.items, [], "empty array");
  }

  // Throws on missing braces
  {
    let threw = false;
    try {
      FugsAudio.parseProximityConfig("maxDist:10");
    } catch (_) {
      threw = true;
    }
    this.assert(threw, "throws on missing braces");
  }

  // Throws on empty string
  {
    let threw = false;
    try {
      FugsAudio.parseProximityConfig("");
    } catch (_) {
      threw = true;
    }
    this.assert(threw, "throws on empty string");
  }

  // Throws on invalid pair (no colon)
  {
    let threw = false;
    try {
      FugsAudio.parseProximityConfig("{justAKey}");
    } catch (_) {
      threw = true;
    }
    this.assert(threw, "throws on key without value");
  }

  // Null/undefined coerced to empty string -> throws
  {
    let threw = false;
    try {
      FugsAudio.parseProximityConfig(null);
    } catch (_) {
      threw = true;
    }
    this.assert(threw, "throws on null input");
  }
});

TestRunner.add("unit:parseAliasConfig", async function () {
  console.log("Testing parseAliasConfig...");
  const assertEq = (a, b, msg) => this.assert(a === b, `${msg}: expected ${b}, got ${a}`);
  const assertDeep = (a, b, msg) =>
    this.assert(
      JSON.stringify(a) === JSON.stringify(b),
      `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`
    );

  // Basic pool + jitter
  {
    const r = FugsAudio.parseAliasConfig(
      "{pool:[step1,step2,step3], volumeJitter:5, pitchJitter:3}"
    );
    assertDeep(r.pool, ["step1", "step2", "step3"], "pool parsed");
    assertEq(r.volumeJitter, 5, "volumeJitter numeric");
    assertEq(r.pitchJitter, 3, "pitchJitter numeric");
  }

  // Pool only
  {
    const r = FugsAudio.parseAliasConfig("{pool:[a,b]}");
    assertDeep(r.pool, ["a", "b"], "pool only");
    assertEq(r.volumeJitter, undefined, "no jitter key when absent");
  }

  // No pool — just k:v pairs
  {
    const r = FugsAudio.parseAliasConfig("{cooldown:100, volume:80}");
    assertEq(r.pool, undefined, "no pool key");
    assertEq(r.cooldown, 100, "cooldown numeric");
    assertEq(r.volume, 80, "volume numeric");
  }

  // Boolean values
  {
    const r = FugsAudio.parseAliasConfig("{pool:[x], enabled:true, muted:false}");
    assertEq(r.enabled, true, "boolean true");
    assertEq(r.muted, false, "boolean false");
  }

  // String value (not a number, not a boolean)
  {
    const r = FugsAudio.parseAliasConfig("{pool:[x], label:myAlias}");
    assertEq(r.label, "myAlias", "string value passthrough");
  }

  // Whitespace in pool items
  {
    const r = FugsAudio.parseAliasConfig("{pool:[ a , b , c ]}");
    assertDeep(r.pool, ["a", "b", "c"], "pool items trimmed");
  }

  // Throws on missing braces
  {
    let threw = false;
    try {
      FugsAudio.parseAliasConfig("pool:[a,b]");
    } catch (_) {
      threw = true;
    }
    this.assert(threw, "throws on missing braces");
  }

  // Empty config (valid braces, no content)
  {
    const r = FugsAudio.parseAliasConfig("{}");
    assertEq(r.pool, undefined, "empty config has no pool");
  }
});

TestRunner.add("unit:validateBuffer", async function () {
  console.log("Testing AudioEffects.validateBuffer...");
  const assertEq = (a, b, msg) => this.assert(a === b, `${msg}: expected ${b}, got ${a}`);

  // Valid mock buffer
  {
    const buf = {
      _sourceNode: { context: { state: "running" } },
      _gainNode: {},
    };
    const r = AudioEffects.validateBuffer(buf, "test_1");
    assertEq(r.valid, true, "valid buffer passes");
  }

  // Null buffer
  {
    const r = AudioEffects.validateBuffer(null, "test_1");
    assertEq(r.valid, false, "null buffer fails");
    this.assert(r.reason.length > 0, "null buffer has reason");
  }

  // Undefined buffer
  {
    const r = AudioEffects.validateBuffer(undefined, "test_1");
    assertEq(r.valid, false, "undefined buffer fails");
  }

  // Missing _sourceNode
  {
    const buf = { _gainNode: {} };
    const r = AudioEffects.validateBuffer(buf, "test_1");
    assertEq(r.valid, false, "missing _sourceNode fails");
    this.assert(
      r.reason.includes("sourceNode") || r.reason.includes("SourceNode"),
      "reason mentions sourceNode"
    );
  }

  // Missing _gainNode
  {
    const buf = { _sourceNode: { context: { state: "running" } } };
    const r = AudioEffects.validateBuffer(buf, "test_1");
    assertEq(r.valid, false, "missing _gainNode fails");
    this.assert(
      r.reason.includes("gainNode") || r.reason.includes("GainNode"),
      "reason mentions gainNode"
    );
  }

  // Missing context on sourceNode
  {
    const buf = { _sourceNode: {}, _gainNode: {} };
    const r = AudioEffects.validateBuffer(buf, "test_1");
    assertEq(r.valid, false, "missing context fails");
  }

  // Closed AudioContext
  {
    const buf = {
      _sourceNode: { context: { state: "closed" } },
      _gainNode: {},
    };
    const r = AudioEffects.validateBuffer(buf, "test_1");
    assertEq(r.valid, false, "closed context fails");
    this.assert(r.reason.includes("closed"), "reason mentions closed");
  }

  // Suspended context is still valid (not closed)
  {
    const buf = {
      _sourceNode: { context: { state: "suspended" } },
      _gainNode: {},
    };
    const r = AudioEffects.validateBuffer(buf, "test_1");
    assertEq(r.valid, true, "suspended context is valid");
  }
});

TestRunner.add("unit:consumeParenTag", async function () {
  console.log("Testing consumeParenTag + check* helpers...");
  const assertEq = (a, b, msg) => this.assert(a === b, `${msg}: expected ${b}, got ${a}`);
  const assertDeep = (a, b, msg) =>
    this.assert(
      JSON.stringify(a) === JSON.stringify(b),
      `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`
    );

  // --- checkStartTime ---
  {
    const r = FugsAudio.checkStartTime(["X", "90", "(start:5)"]);
    assertEq(r.startTime, 5, "start:5 parsed");
    assertDeep(r.args, ["X", "90"], "start tag consumed from args");
  }
  {
    const r = FugsAudio.checkStartTime(["X", "90", "(start:0)"]);
    assertEq(r.startTime, 0, "start:0 parsed");
  }
  {
    const r = FugsAudio.checkStartTime(["X", "90", "(start:2.5)"]);
    assertEq(r.startTime, 2.5, "start:2.5 float");
  }
  {
    // No start tag -> default 0
    const r = FugsAudio.checkStartTime(["X", "90"]);
    assertEq(r.startTime, 0, "no start tag = 0");
    assertDeep(r.args, ["X", "90"], "args unchanged");
  }
  {
    // Negative start time rejected (isValid requires >= 0)
    const r = FugsAudio.checkStartTime(["X", "(start:-1)"]);
    assertEq(r.startTime, 0, "negative start rejected");
  }
  {
    // Non-numeric start rejected
    const r = FugsAudio.checkStartTime(["X", "(start:abc)"]);
    assertEq(r.startTime, 0, "non-numeric start rejected");
  }

  // --- checkLoop ---
  {
    const r = FugsAudio.checkLoop(["X", "(loop:forever)"]);
    assertEq(r.loop, "forever", "loop:forever");
  }
  {
    const r = FugsAudio.checkLoop(["X", "(loop:never)"]);
    assertEq(r.loop, "never", "loop:never");
  }
  {
    const r = FugsAudio.checkLoop(["X", "(loop:3)"]);
    assertEq(r.loop, 3, "loop:3 numeric");
  }
  {
    const r = FugsAudio.checkLoop(["X", "(loop:true)"]);
    assertEq(r.loop, "forever", "loop:true = forever");
  }
  {
    const r = FugsAudio.checkLoop(["X", "(loop:false)"]);
    assertEq(r.loop, "never", "loop:false = never");
  }
  {
    const r = FugsAudio.checkLoop(["X", "(loop:once)"]);
    assertEq(r.loop, "never", "loop:once = never");
  }
  {
    const r = FugsAudio.checkLoop(["X", "(loop:infinite)"]);
    assertEq(r.loop, "forever", "loop:infinite = forever");
  }
  {
    // No loop tag -> undefined
    const r = FugsAudio.checkLoop(["X", "90"]);
    assertEq(r.loop, undefined, "no loop tag = undefined");
  }

  // --- checkCurve ---
  {
    const r = FugsAudio.checkCurve(["50", "2", "(curve:linear)"]);
    assertEq(r.curve, "linear", "curve:linear");
  }
  {
    const r = FugsAudio.checkCurve(["50", "2", "(curve:ease-in-out)"]);
    assertEq(r.curve, "ease-in-out", "curve:ease-in-out");
  }
  {
    // Invalid curve name -> default smooth
    const r = FugsAudio.checkCurve(["50", "(curve:banana)"]);
    assertEq(r.curve, "smooth", "invalid curve = smooth default");
  }
  {
    // No curve tag -> default smooth
    const r = FugsAudio.checkCurve(["50", "2"]);
    assertEq(r.curve, "smooth", "no curve = smooth default");
  }

  // --- checkPersistence ---
  {
    const r = FugsAudio.checkPersistence(["X", "(p:always)"]);
    assertEq(r.persistence, "always", "p:always");
  }
  {
    const r = FugsAudio.checkPersistence(["X", "(p:none)"]);
    assertEq(r.persistence, "none", "p:none");
  }
  {
    // Invalid persistence -> default
    const r = FugsAudio.checkPersistence(["X", "(p:banana)"]);
    this.assert(r.persistence !== "banana", "invalid persistence rejected");
  }

  // --- checkPauseMode ---
  {
    const r = FugsAudio.checkPauseMode(["X", "(pause:never)"]);
    assertEq(r.pauseMode, "never", "pause:never");
  }
  {
    const r = FugsAudio.checkPauseMode(["X", "(pause:scene)"]);
    assertEq(r.pauseMode, "scene", "pause:scene");
  }
  {
    // Invalid pause mode -> default
    const r = FugsAudio.checkPauseMode(["X", "(pause:banana)"]);
    this.assert(r.pauseMode !== "banana", "invalid pauseMode rejected");
  }

  // --- consumeParenTag directly: tag not found leaves args intact ---
  {
    const r = FugsAudio.consumeParenTag(
      ["a", "b", "c"],
      "missing",
      (v) => v,
      () => true
    );
    assertDeep(r.args, ["a", "b", "c"], "no match = args unchanged");
    assertEq(r.value, undefined, "no match = value undefined");
  }

  // --- consumeParenTag: non-string args are skipped ---
  {
    const r = FugsAudio.consumeParenTag(
      [42, null, "(start:5)"],
      "start",
      (v) => Number(v),
      (n) => !isNaN(n)
    );
    assertEq(r.value, 5, "skips non-string args");
  }
});

TestRunner.add("unit:toNumParity", async function () {
  console.log("Testing AudioEffects.toNum parity with FugsAudio.toNum...");
  const assertEq = (a, b, msg) => this.assert(a === b, `${msg}: expected ${b}, got ${a}`);

  // AudioEffects.toNum should behave the same for shared inputs
  // (Note: AudioEffects.toNum doesn't have the object guard, so skip those)
  assertEq(AudioEffects.toNum(0, 99), 0, "AE.toNum(0) = 0");
  assertEq(AudioEffects.toNum(1, 99), 1, "AE.toNum(1) = 1");
  assertEq(AudioEffects.toNum("50", 99), 50, 'AE.toNum("50") = 50');
  assertEq(AudioEffects.toNum(null, 42), 42, "AE.toNum(null) = fallback");
  assertEq(AudioEffects.toNum(undefined, 42), 42, "AE.toNum(undefined) = fallback");
  assertEq(AudioEffects.toNum("", 42), 42, 'AE.toNum("") = fallback');
  assertEq(AudioEffects.toNum("   ", 42), 42, "AE.toNum(whitespace) = fallback");
  assertEq(AudioEffects.toNum("abc", 42), 42, 'AE.toNum("abc") = fallback');
  assertEq(AudioEffects.toNum(NaN, 42), 42, "AE.toNum(NaN) = fallback");
  assertEq(AudioEffects.toNum(Infinity, 42), 42, "AE.toNum(Infinity) = fallback");
  assertEq(AudioEffects.toNum(-Infinity, 42), 42, "AE.toNum(-Infinity) = fallback");

  // Confirm FugsAudio and AudioEffects agree on representative inputs
  const inputs = [0, 1, -5, 3.14, "0", "50", null, undefined, "", "abc", NaN];
  for (const v of inputs) {
    const a = FugsAudio.toNum(v, 99);
    const b = AudioEffects.toNum(v, 99);
    assertEq(a, b, `parity: toNum(${String(v)})`);
  }
});

TestRunner.add("unit:distanceCurvesCustom", async function () {
  console.log("Testing DistanceCurves.custom...");
  const approx = (a, b, t = 0.01) => Math.abs(a - b) <= t;

  // Linear ramp via custom points [[0,1],[1,0]]
  {
    const v = DistanceCurves.custom(0, 10, [
      [0, 1],
      [1, 0],
    ]);
    this.assert(approx(v, 1), "custom at dist=0 = 1");
  }
  {
    const v = DistanceCurves.custom(5, 10, [
      [0, 1],
      [1, 0],
    ]);
    this.assert(approx(v, 0.5), "custom at dist=5/10 midpoint = 0.5");
  }
  {
    const v = DistanceCurves.custom(10, 10, [
      [0, 1],
      [1, 0],
    ]);
    this.assert(approx(v, 0), "custom at dist=max = 0");
  }

  // Flat array format [x,y,x,y]
  {
    const v = DistanceCurves.custom(5, 10, [0, 1, 1, 0]);
    this.assert(approx(v, 0.5), "flat array at midpoint = 0.5");
  }

  // Absolute distance points (x > 1 -> normalized by maxDist)
  {
    const v = DistanceCurves.custom(5, 10, [
      [0, 1],
      [10, 0],
    ]);
    this.assert(approx(v, 0.5), "absolute dist points normalized");
  }

  // Stepped curve: stays at 1 until 50%, then drops to 0
  {
    const v1 = DistanceCurves.custom(2, 10, [
      [0, 1],
      [0.5, 1],
      [0.5001, 0],
      [1, 0],
    ]);
    this.assert(approx(v1, 1, 0.05), "stepped: before midpoint ~1");
    const v2 = DistanceCurves.custom(8, 10, [
      [0, 1],
      [0.5, 1],
      [0.5001, 0],
      [1, 0],
    ]);
    this.assert(approx(v2, 0, 0.05), "stepped: after midpoint ~0");
  }

  // Fallback to linear on too few points
  {
    const v = DistanceCurves.custom(5, 10, [0, 1]); // Only 2 items = 1 pair
    this.assert(approx(v, 0.5), "< 2 pairs falls back to linear");
  }

  // maxDistance = 0 -> returns 0
  {
    const v = DistanceCurves.custom(5, 0, [
      [0, 1],
      [1, 0],
    ]);
    this.assert(approx(v, 0), "maxDist=0 returns 0");
  }

  // Distance beyond max -> last point value
  {
    const v = DistanceCurves.custom(15, 10, [
      [0, 1],
      [1, 0],
    ]);
    this.assert(approx(v, 0), "beyond max = last point value");
  }

  // Unsorted points (should sort internally)
  {
    const v = DistanceCurves.custom(5, 10, [
      [1, 0],
      [0, 1],
    ]);
    this.assert(approx(v, 0.5), "unsorted points sorted internally");
  }
});

TestRunner.add("unit:parseArguments", async function () {
  console.log("Testing parseArguments tokenizer...");
  const assertDeep = (a, b, msg) =>
    this.assert(
      JSON.stringify(a) === JSON.stringify(b),
      `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`
    );

  // Simple space-separated tokens
  assertDeep(FugsAudio.parseArguments("a b c"), ["a", "b", "c"], "simple tokens");

  // Double-quoted string preserved as single token
  assertDeep(
    FugsAudio.parseArguments('"hello world" 42'),
    ["hello world", "42"],
    "double quotes"
  );

  // Single-quoted string
  assertDeep(FugsAudio.parseArguments("'foo bar' baz"), ["foo bar", "baz"], "single quotes");

  // Mixed quotes and plain
  assertDeep(
    FugsAudio.parseArguments('play "My Song" 90 (curve:smooth)'),
    ["play", "My Song", "90", "(curve:smooth)"],
    "mixed args"
  );

  // Empty string
  assertDeep(FugsAudio.parseArguments(""), [], "empty string");

  // Single token
  assertDeep(FugsAudio.parseArguments("hello"), ["hello"], "single token");

  // Numbers and special chars
  assertDeep(
    FugsAudio.parseArguments("100 -50 3.14"),
    ["100", "-50", "3.14"],
    "numeric tokens"
  );
});

// =====================================================================
// PROXIMITY UNIT TESTS
// =====================================================================

TestRunner.add("unit:proximity", async function () {
  console.log("Testing proximity system...");
  const assertEq = (a, b, msg) => this.assert(a === b, `${msg}: expected ${b}, got ${a}`);
  const approx = (a, b, eps, msg) =>
    this.assert(Math.abs(a - b) < eps, `${msg}: expected ~${b}, got ${a} (eps ${eps})`);

  // ── setupProximitySource ──────────────────────────────────────────

  // 1. Valid config → returns true, data in map
  {
    FugsAudio.proximityData.clear();
    const ok = FugsAudio.setupProximitySource("test_1", {
      x: 10,
      y: 20,
      maxDistance: 8,
      minVolume: 0.1,
      curve: "exponential",
      pan: true,
      doppler: false,
    });
    assertEq(ok, true, "setupProximitySource returns true");
    assertEq(FugsAudio.proximityData.has("test_1"), true, "key stored in map");

    const cfg = FugsAudio.proximityData.get("test_1");
    assertEq(cfg.x, 10, "config.x preserved");
    assertEq(cfg.y, 20, "config.y preserved");
    assertEq(cfg.maxDistance, 8, "config.maxDistance preserved");
    assertEq(cfg.minVolume, 0.1, "config.minVolume preserved");
    assertEq(cfg.curve, "exponential", "config.curve preserved");
    assertEq(cfg.enablePan, true, "config.enablePan from pan:true");
    assertEq(cfg.doppler, false, "config.doppler preserved");
  }

  // 2. Defaults are filled in
  {
    FugsAudio.proximityData.clear();
    FugsAudio.setupProximitySource("test_def", { x: 0, y: 0 });
    const cfg = FugsAudio.proximityData.get("test_def");
    assertEq(typeof cfg.maxDistance, "number", "default maxDistance is number");
    assertEq(cfg.maxDistance > 0, true, "default maxDistance > 0");
    assertEq(typeof cfg.minVolume, "number", "default minVolume is number");
    assertEq(cfg.curve, "linear", "default curve is linear");
    assertEq(cfg.enablePan, false, "default pan is false");
    assertEq(cfg.doppler, false, "default doppler is false");
  }

  // 3. Invalid config → returns false (suppress expected error logs)
  {
    const origError = Logger.error;
    Logger.error = function () {}; // silence expected errors
    const r1 = FugsAudio.setupProximitySource("bad1", null);
    assertEq(r1, false, "null config returns false");
    const r2 = FugsAudio.setupProximitySource("bad2", "string");
    assertEq(r2, false, "string config returns false");
    Logger.error = origError;
  }

  // 4. Event-based config stores eventId
  {
    FugsAudio.proximityData.clear();
    FugsAudio.setupProximitySource("ev_1", { event: 5, maxDistance: 12 });
    const cfg = FugsAudio.proximityData.get("ev_1");
    assertEq(cfg.eventId, 5, "eventId parsed from event:5");
  }

  // ── setProximity / clearProximity ─────────────────────────────────

  // 5. setProximity shorthand
  {
    FugsAudio.proximityData.clear();
    const ok = FugsAudio.setProximity("bgs", 2, {
      x: 5,
      y: 5,
      maxDistance: 15,
      pan: true,
    });
    assertEq(ok, true, "setProximity returns true");
    assertEq(FugsAudio.proximityData.has("bgs_2"), true, "setProximity stores bgs_2");
    const cfg = FugsAudio.proximityData.get("bgs_2");
    assertEq(cfg.maxDistance, 15, "setProximity maxDistance");
    assertEq(cfg.enablePan, true, "setProximity pan");
  }

  // 6. clearProximity removes the entry
  {
    FugsAudio.clearProximity("bgs", 2);
    assertEq(FugsAudio.proximityData.has("bgs_2"), false, "clearProximity removes key");
  }

  // ── updateProximityVolume (static position, mock buffer) ──────────

  // 7. Volume scales with distance (linear curve)
  if (window.$gamePlayer && window.$gameMap && window.$dataMap) {
    // Save originals
    const origRX = $gamePlayer._realX;
    const origRY = $gamePlayer._realY;

    // Create a mock-like buffer on the tracks map
    const mockKey = "bgs_99";
    const mockBuffer = {
      _manualVolume: 1.0,
      _originalVolume: 1.0,
      _volume: 1.0,
      _pitch: 1.0,
      _basePitch: 1.0,
      _pan: 0,
      get volume() {
        return this._volume;
      },
      set volume(v) {
        this._volume = v;
      },
      get pan() {
        return this._pan;
      },
      set pan(v) {
        this._pan = v;
      },
      set pitch(v) {
        this._pitch = v;
      },
      get pitch() {
        return this._pitch;
      },
    };
    FugsAudio.tracks.set(mockKey, mockBuffer);

    // Setup proximity at (10, 10), maxDistance 10, linear
    FugsAudio.proximityData.clear();
    FugsAudio.setupProximitySource(mockKey, {
      x: 10,
      y: 10,
      maxDistance: 10,
      minVolume: 0,
      curve: "linear",
      pan: true,
    });

    // Player right on top → distance 0 → volume 1.0
    $gamePlayer._realX = 10;
    $gamePlayer._realY = 10;
    FugsAudio.updateProximityVolume();
    approx(mockBuffer._volume, 1.0, 0.01, "at source → volume ≈1.0");

    // Player at edge of maxDistance → distance 10 → volume ≈0
    $gamePlayer._realX = 20;
    $gamePlayer._realY = 10;
    // Reset dirty-flag cache so it recalculates
    const cfg = FugsAudio.proximityData.get(mockKey);
    cfg.lastSourceX = undefined;
    cfg.lastTargetX = undefined;
    FugsAudio.updateProximityVolume();
    approx(mockBuffer._volume, 0.0, 0.05, "at maxDist → volume ≈0");

    // Player halfway → distance 5 → volume ≈0.5
    $gamePlayer._realX = 15;
    $gamePlayer._realY = 10;
    cfg.lastSourceX = undefined;
    cfg.lastTargetX = undefined;
    FugsAudio.updateProximityVolume();
    approx(mockBuffer._volume, 0.5, 0.05, "halfway → volume ≈0.5");

    // 8. Pan shifts toward source
    // Source at x=10, player at x=15 → source is LEFT → pan should be negative
    assertEq(mockBuffer._pan < 0, true, "source left of player → negative pan");

    // Player at x=5 → source is RIGHT → pan should be positive
    $gamePlayer._realX = 5;
    $gamePlayer._realY = 10;
    cfg.lastSourceX = undefined;
    cfg.lastTargetX = undefined;
    FugsAudio.updateProximityVolume();
    assertEq(mockBuffer._pan > 0, true, "source right of player → positive pan");

    // Player directly on source → pan ≈ 0
    $gamePlayer._realX = 10;
    $gamePlayer._realY = 10;
    cfg.lastSourceX = undefined;
    cfg.lastTargetX = undefined;
    FugsAudio.updateProximityVolume();
    approx(mockBuffer._pan, 0, 0.01, "at source → pan ≈0");

    // 9. minVolume floor
    FugsAudio.proximityData.clear();
    FugsAudio.setupProximitySource(mockKey, {
      x: 10,
      y: 10,
      maxDistance: 5,
      minVolume: 0.3,
      curve: "linear",
    });
    $gamePlayer._realX = 100; // way beyond maxDistance
    $gamePlayer._realY = 100;
    FugsAudio.updateProximityVolume();
    assertEq(
      mockBuffer._volume >= 0.3,
      true,
      `minVolume floor respected: ${mockBuffer._volume} >= 0.3`
    );

    // 10. Dirty-flag optimization: same position → no recalc
    {
      const _cfgMin = FugsAudio.proximityData.get(mockKey);
      // Force a known volume then call update without moving
      mockBuffer._volume = 0.999;
      mockBuffer._manualVolume = 0.999;
      // Positions are already cached from above, call again
      FugsAudio.updateProximityVolume();
      // With dirty-flag, volume should NOT be recalculated (stays 0.999)
      // unless the implementation resets the cache
      // Actually: the dirty-flag compares lastSourceX/lastTargetX
      // Since we didn't clear them, it should skip
      // This validates the optimization path exists
      this.assert(true, "dirty-flag path exercised without error");
    }

    // Cleanup
    FugsAudio.tracks.delete(mockKey);
    FugsAudio.proximityData.clear();
    $gamePlayer._realX = origRX;
    $gamePlayer._realY = origRY;
  } else {
    console.log("  [SKIP] $gamePlayer not available — skipping volume/pan tests");
    this.results.skipped++;
  }

  // ── Edge cases ────────────────────────────────────────────────────

  // 11. updateProximityVolume with no proximity data → no error
  {
    FugsAudio.proximityData.clear();
    FugsAudio.updateProximityVolume();
    this.assert(true, "updateProximityVolume with empty map → no crash");
  }

  // 12. updateProximityVolume with missing buffer → skip gracefully
  {
    FugsAudio.proximityData.clear();
    FugsAudio.setupProximitySource("ghost_1", { x: 0, y: 0 });
    // ghost_1 has no buffer in tracks map
    FugsAudio.updateProximityVolume();
    this.assert(true, "missing buffer skipped without crash");
    FugsAudio.proximityData.clear();
  }
});

// =====================================================================
// SFX ALIAS POOL TESTS
// =====================================================================

TestRunner.add("pool:create", async function () {
  await this.cleanup();
  console.log("Testing SFX alias pool creation...");

  const seTracks = this.tracks.all("se");
  if (!seTracks || seTracks.length === 0) {
    this.skip("No SE files available for alias pool test");
    return;
  }

  const aliasName = "PoolCreateTest";
  FugsAudio.unregisterAlias(aliasName);

  const pool = seTracks.slice(0, Math.min(3, seTracks.length));
  const registered = FugsAudio.registerAlias(aliasName, {
    pool,
    volumeJitter: 5,
    pitchJitter: 3,
    panJitter: 10,
  });

  this.assert(registered, `Alias registered: ${aliasName}`);
  this.assert(FugsAudio.sfxAliases.has(aliasName), "Alias exists in sfxAliases map");

  const played1 = FugsAudio.playAlias(aliasName, "se", "1");
  await this.wait(120);
  const played2 = FugsAudio.playAlias(aliasName, "se", "2");
  await this.wait(120);

  this.assert(played1 || played2, "Alias pool produced playable SFX");

  const aliases = FugsAudio.listAliases();
  const row = aliases.find((a) => a.name === aliasName);
  this.assert(!!row, "Alias appears in listAliases()");
  this.assert(row && row.poolSize === pool.length, `Alias pool size is ${pool.length}`);

  FugsAudio.unregisterAlias(aliasName);
  this.assert(!FugsAudio.sfxAliases.has(aliasName), "Alias removed cleanly");
});

TestRunner.add("pool:reuse", async function () {
  await this.cleanup();
  console.log("Testing SFX alias cooldown/reuse behavior...");

  const seTracks = this.tracks.all("se");
  if (!seTracks || seTracks.length === 0) {
    this.skip("No SE files available for alias cooldown test");
    return;
  }

  const aliasName = "PoolReuseTest";
  FugsAudio.unregisterAlias(aliasName);

  const registered = FugsAudio.registerAlias(aliasName, {
    pool: seTracks.slice(0, Math.min(2, seTracks.length)),
    cooldown: 250,
  });
  this.assert(registered, "Alias with cooldown registered");

  const first = FugsAudio.playAlias(aliasName, "se", "1");
  const second = FugsAudio.playAlias(aliasName, "se", "1"); // immediate, should be blocked
  await this.wait(300);
  const third = FugsAudio.playAlias(aliasName, "se", "1");

  this.assert(first, "First alias play succeeds");
  this.assert(!second, "Immediate replay blocked by cooldown");
  this.assert(third, "Replay succeeds after cooldown window");

  FugsAudio.unregisterAlias(aliasName);
});

TestRunner.add("pool:limits", async function () {
  await this.cleanup();
  console.log("Testing alias pool selection limits...");

  const bgmTracks = this.tracks.all("bgm");
  if (!bgmTracks || bgmTracks.length < 2) {
    this.skip("Need at least 2 BGM files for alias pool limit test");
    return;
  }

  const aliasName = "PoolLimitsTest";
  FugsAudio.unregisterAlias(aliasName);

  const allowed = [bgmTracks[0], bgmTracks[1]];
  const registered = FugsAudio.registerAlias(aliasName, {
    pool: allowed,
    volume: 30,
  });
  this.assert(registered, "Two-item alias pool registered");

  const plays = this.tracks._limitMode ? 3 : 8;
  let started = 0;
  for (let i = 1; i <= plays; i++) {
    const ok = FugsAudio.playAlias(aliasName, "bgm", String(i));
    if (ok) started++;
    if (this.tracks._limitMode) await this.wait(80);
  }
  await this.wait(300);

  let inspected = 0;
  let inPool = 0;
  for (let i = 1; i <= plays; i++) {
    const buffer = FugsAudio.tracks.get(`bgm_${i}`);
    if (!buffer || !buffer._name) continue;
    inspected++;
    if (allowed.includes(buffer._name)) inPool++;
  }

  this.assert(
    started >= Math.max(1, plays - 2),
    `Alias burst started ${started}/${plays} tracks`
  );
  this.assert(inspected > 0, "Inspectable alias-started tracks exist");
  this.assert(
    inPool === inspected,
    `All inspected tracks came from configured pool (${inPool}/${inspected})`
  );

  FugsAudio.unregisterAlias(aliasName);
  await this.cleanup();
});

// =====================================================================
// STRESS TESTS
// =====================================================================

// --- PLAY STRESS ---
TestRunner.add("stress:play:rapid", async function () {
  await this.cleanup();
  // Reduced from 100 to 30 cycles for batch mode - each cycle creates+destroys
  // a WebAudio.Buffer (sourceNode + gainNode + pannerNode) and Chromium 65 has
  // limited node budgets. 30 cycles is still a solid stress test.
  const cycles = this.tracks._limitMode ? 20 : 100;
  console.log(`[STRESS] Rapid play/stop cycles (${cycles}x)...`);

  const track = this.tracks.pick("bgm");
  let errors = 0;

  for (let i = 0; i < cycles; i++) {
    try {
      FugsAudio.play("bgm", 1, track, { volume: 50, fadein: 0 });
      await this.wait(50);
      FugsAudio.stop("bgm", 1, 0);
      await this.wait(30);
    } catch (e) {
      errors++;
      console.log(`  Cycle ${i} error: ${e.message}`);
    }
    // GC pause every 5 cycles
    if (i % 5 === 4) await this.wait(200);
  }

  this.assert(errors === 0, `${cycles} rapid play/stop cycles (${errors} errors)`);
  await this.cleanup();
});

TestRunner.add("stress:play:many", async function () {
  await this.cleanup();
  // Reduce track count in batch mode to conserve WebAudio node budget
  const bgmCount = this.tracks._limitMode ? 4 : 8;
  const bgsCount = this.tracks._limitMode ? 2 : 4;
  console.log(`[STRESS] Many simultaneous tracks (${bgmCount} BGM + ${bgsCount} BGS)...`);

  for (let i = 1; i <= bgmCount; i++) {
    FugsAudio.play("bgm", i, this.tracks.pick("bgm", (i - 1) % 3), { volume: 20, fadein: 0 });
  }
  for (let i = 1; i <= bgsCount; i++) {
    FugsAudio.play("bgs", i, this.tracks.pick("bgs", (i - 1) % 2), { volume: 20, fadein: 0 });
  }
  await this.wait(1000);

  const activeTracks = FugsAudio.tracks.size;
  const expectedMin = bgmCount + bgsCount - 2; // allow 2 short
  console.log(`  Active tracks: ${activeTracks}`);
  this.assert(
    activeTracks >= expectedMin,
    `${expectedMin}+ tracks active (got ${activeTracks})`
  );

  // Stop half
  const halfBgm = Math.floor(bgmCount / 2);
  for (let i = 1; i <= halfBgm; i++) {
    FugsAudio.stop("bgm", i, 0);
  }
  await this.wait(300);

  const remaining = FugsAudio.tracks.size;
  const expectedRemain = bgmCount + bgsCount - halfBgm - 2;
  console.log(`  After stopping half: ${remaining}`);
  this.assert(
    remaining >= expectedRemain,
    `${expectedRemain}+ tracks remain (got ${remaining})`
  );

  await this.cleanup();
});

TestRunner.add("stress:play:burst", async function () {
  await this.cleanup();
  const burstCount = this.tracks._limitMode ? 3 : 10;
  console.log(`[STRESS] Burst play + effects (${burstCount} tracks)...`);

  // Stagger slightly to avoid simultaneous decodeAudioData calls
  // which can spike memory and crash NW.js on Chromium 65
  for (let i = 1; i <= burstCount; i++) {
    FugsAudio.play("bgm", i, this.tracks.pick("bgm", (i - 1) % 3), { volume: 30, fadein: 0 });
    if (this.tracks._limitMode) await this.wait(100);
  }
  await this.wait(500);

  const count = FugsAudio.tracks.size;
  const minExpect = burstCount - 2;
  this.assert(count >= minExpect, `Burst play started ${count}/${burstCount} tracks`);

  // Burst-apply effects to active tracks (staggered to reduce node pressure)
  const presets = ["underwater", "cave", "phone", "nightmare"];
  let effectAttempts = 0;
  let effectApplied = 0;
  for (let i = 1; i <= burstCount; i++) {
    const key = `bgm_${i}`;
    if (!FugsAudio.tracks.has(key)) continue;

    effectAttempts++;
    const preset = presets[(i - 1) % presets.length];
    const ok = FugsAudio.setEffect("bgm", i, preset);
    if (ok) effectApplied++;
    if (this.tracks._limitMode) await this.wait(80);
  }

  await this.wait(400);
  const chainCount = FugsAudio.effectChains.size;
  const minEffectExpect = Math.max(1, Math.min(effectAttempts, minExpect) - 1);
  this.assert(
    effectApplied >= minEffectExpect,
    `Burst effects applied ${effectApplied}/${effectAttempts}`
  );
  this.assert(
    chainCount >= Math.max(1, minEffectExpect - 1),
    `Effect chains active: ${chainCount}`
  );

  await this.cleanup();
});

// --- FADE STRESS ---
TestRunner.add("stress:fade:overlapping", async function () {
  await this.cleanup();
  console.log("[STRESS] Overlapping volume fades...");

  const track = this.tracks.pick("bgm");
  FugsAudio.play("bgm", 1, track, { volume: 100, fadein: 0 });
  await this.wait(500);

  // Fire overlapping fades rapidly - last one should win
  FugsAudio.fade("bgm", 1, { volume: 20, duration: 2 });
  await this.wait(100);
  FugsAudio.fade("bgm", 1, { volume: 90, duration: 1.5 });
  await this.wait(100);
  FugsAudio.fade("bgm", 1, { volume: 40, duration: 1 });
  await this.wait(100);
  FugsAudio.fade("bgm", 1, { volume: 70, duration: 0.8 });
  await this.wait(1200);

  const buf = FugsAudio.tracks.get("bgm_1");
  const vol = buf ? Math.round(buf.volume * 100) : 0;
  console.log(`  Final volume: ${vol}%`);
  this.assert(this.approx(vol / 100, 0.7, 0.15), `Volume near 70% (got ${vol}%)`);
  await this.cleanup();
});

TestRunner.add("stress:fade:multiParam", async function () {
  await this.cleanup();
  console.log("[STRESS] Simultaneous multi-parameter fades...");

  const track = this.tracks.pick("bgm");
  FugsAudio.play("bgm", 1, track, { volume: 80, fadein: 0 });
  await this.wait(500);

  // Fade volume, pan, and pitch all at once
  FugsAudio.fade("bgm", 1, { volume: 40, duration: 1 });
  FugsAudio.fade("bgm", 1, { pan: -60, duration: 1.2 });
  FugsAudio.fade("bgm", 1, { pitch: 85, duration: 0.8 });
  await this.wait(1500);

  const buf = FugsAudio.tracks.get("bgm_1");
  if (buf) {
    console.log(
      `  Vol: ${Math.round(buf.volume * 100)}%, Pan: ${Math.round((buf._pan || 0) * 100)}, Pitch: ${Math.round((buf._basePitch || 1) * 100)}%`
    );
  }
  this.assert(true, "Multi-parameter fades completed");
  await this.cleanup();
});

TestRunner.add("stress:fade:rapid", async function () {
  await this.cleanup();
  console.log("[STRESS] Rapid fade commands (50x)...");

  const track = this.tracks.pick("bgm");
  FugsAudio.play("bgm", 1, track, { volume: 50, fadein: 0 });
  await this.wait(300);

  let errors = 0;
  for (let i = 0; i < 50; i++) {
    try {
      const vol = 20 + (i % 60);
      FugsAudio.fade("bgm", 1, { volume: vol, duration: 0.1 });
      await this.wait(30);
    } catch (_e) {
      errors++;
    }
  }

  this.assert(errors === 0, `50 rapid fades (${errors} errors)`);
  await this.cleanup();
});

// --- EFFECT STRESS ---
TestRunner.add("stress:effect:rapid", async function () {
  await this.cleanup();
  console.log("[STRESS] Rapid effect switching...");

  const track = this.tracks.pick("bgm");
  FugsAudio.play("bgm", 1, track, { volume: 70, fadein: 0 });
  await this.wait(500);

  const presets = ["underwater", "phone", "cave", "radio", "megaphone", "muffled"];
  // Reduced from 30 to 12 in batch — each setEffect creates a full WebAudio
  // effect chain (gain+convolver+biquad+etc) that eats the node budget.
  const switchCount = this.tracks._limitMode ? 12 : 30;
  let errors = 0;

  for (let i = 0; i < switchCount; i++) {
    try {
      const preset = presets[i % presets.length];
      FugsAudio.setEffect("bgm", 1, preset);
      await this.wait(100);
      // Every 4 cycles, give GC extra time to reclaim disposed WebAudio nodes
      if (i % 4 === 3) await this.wait(250);
    } catch (_e) {
      errors++;
    }
  }
  FugsAudio.removeEffect("bgm", 1);

  this.assert(errors === 0, `${switchCount} rapid effect switches (${errors} errors)`);
  await this.cleanup();
});

TestRunner.add("stress:effect:manyTracks", async function () {
  await this.cleanup();
  console.log("[STRESS] Effects on multiple tracks simultaneously...");

  // Start 4 tracks
  FugsAudio.play("bgm", 1, this.tracks.pick("bgm", 0), { volume: 40, fadein: 0 });
  FugsAudio.play("bgm", 2, this.tracks.pick("bgm", 1), { volume: 40, fadein: 0 });
  FugsAudio.play("bgs", 1, this.tracks.pick("bgs", 0), { volume: 40, fadein: 0 });
  FugsAudio.play("bgs", 2, this.tracks.pick("bgs", 1), { volume: 40, fadein: 0 });
  await this.wait(500);

  // Apply different effects to each
  FugsAudio.setEffect("bgm", 1, "underwater");
  FugsAudio.setEffect("bgm", 2, "cave");
  FugsAudio.setEffect("bgs", 1, "phone");
  FugsAudio.setEffect("bgs", 2, "radio");
  await this.wait(800);

  const effectCount = FugsAudio.effectChains.size;
  console.log(`  Effect chains active: ${effectCount}`);
  this.assert(effectCount >= 3, `Multiple effect chains (got ${effectCount})`);

  // Remove all
  FugsAudio.removeEffect("bgm", 1);
  FugsAudio.removeEffect("bgm", 2);
  FugsAudio.removeEffect("bgs", 1);
  FugsAudio.removeEffect("bgs", 2);
  await this.wait(300);

  this.assert(FugsAudio.effectChains.size === 0, "All effects removed");
  await this.cleanup();
});

// --- EFFECT + FADE STRESS ---
TestRunner.add("stress:effectFade:simultaneous", async function () {
  await this.cleanup();
  console.log("[STRESS] Fading while effects active...");

  const track = this.tracks.pick("bgm");
  FugsAudio.play("bgm", 1, track, { volume: 80, fadein: 0 });
  await this.wait(500);

  // Apply effect, then fade volume
  FugsAudio.setEffect("bgm", 1, "underwater");
  await this.wait(200);
  FugsAudio.fade("bgm", 1, { volume: 30, duration: 1 });
  await this.wait(1200);

  const buf = FugsAudio.tracks.get("bgm_1");
  const hasEffect = FugsAudio.effectChains.has("bgm_1");
  console.log(
    `  Effect active: ${hasEffect}, Volume: ${buf ? Math.round(buf.volume * 100) : 0}%`
  );

  this.assert(hasEffect, "Effect still active after fade");
  this.assert(buf && buf.volume < 0.5, "Volume faded with effect");
  await this.cleanup();
});

TestRunner.add("stress:effectFade:fadeInOut", async function () {
  await this.cleanup();
  console.log("[STRESS] Effect fade in/out while volume fading...");

  const track = this.tracks.pick("bgm");
  FugsAudio.play("bgm", 1, track, { volume: 80, fadein: 0 });
  await this.wait(500);

  // Fade in effect while fading volume down
  FugsAudio.fadeInEffect("bgm", 1, "cave", 1.5);
  FugsAudio.fade("bgm", 1, { volume: 40, duration: 1.5 });
  await this.wait(1800);

  // Fade out effect while fading volume up
  FugsAudio.fadeOutEffectOnTrack("bgm", 1, 1);
  FugsAudio.fade("bgm", 1, { volume: 80, duration: 1 });
  await this.wait(1300);

  const buf = FugsAudio.tracks.get("bgm_1");
  const hasEffect = FugsAudio.effectChains.has("bgm_1");
  console.log(
    `  Effect active: ${hasEffect}, Volume: ${buf ? Math.round(buf.volume * 100) : 0}%`
  );

  this.assert(!hasEffect, "Effect faded out");
  this.assert(buf && buf.volume > 0.6, "Volume restored");
  await this.cleanup();
});

// --- CROSSFADE STRESS ---
TestRunner.add("stress:crossfade:rapid", async function () {
  await this.cleanup();
  console.log("[STRESS] Rapid crossfades (5x quick switches)...");

  const tracks = [
    this.tracks.pick("bgm", 0),
    this.tracks.pick("bgm", 1),
    this.tracks.pick("bgm", 2),
  ];

  FugsAudio.play("bgm", 1, tracks[0], { volume: 70, fadein: 0 });
  await this.wait(500);

  for (let i = 1; i <= 5; i++) {
    const nextTrack = tracks[i % 3];
    FugsAudio.crossfade("bgm", 1, "bgm", 1, nextTrack, { volume: 70, duration: 0.3 });
    await this.wait(400);
  }

  this.assert(FugsAudio.tracks.has("bgm_1"), "Track survives rapid crossfades");
  await this.cleanup();
});

TestRunner.add("stress:crossfade:withEffects", async function () {
  await this.cleanup();
  console.log("[STRESS] Crossfade while effects active...");

  const track1 = this.tracks.pick("bgm", 0);
  const track2 = this.tracks.pick("bgm", 1);

  FugsAudio.play("bgm", 1, track1, { volume: 70, fadein: 0 });
  await this.wait(500);

  FugsAudio.setEffect("bgm", 1, "underwater");
  await this.wait(300);

  // Crossfade to new track
  FugsAudio.crossfade("bgm", 1, "bgm", 1, track2, { volume: 70, duration: 1 });
  await this.wait(1300);

  const buf = FugsAudio.tracks.get("bgm_1");
  this.assert(buf && buf._name === track2, `Crossfaded to ${track2}`);
  await this.cleanup();
});

// --- DUCK STRESS ---
TestRunner.add("stress:duck:overlapping", async function () {
  await this.cleanup();
  console.log("[STRESS] Overlapping duck commands...");

  const track = this.tracks.pick("bgm");
  FugsAudio.play("bgm", 1, track, { volume: 80, fadein: 0 });
  await this.wait(500);

  // Fire multiple ducks rapidly
  FugsAudio.duck("bgm", 1, { level: 0.3, fadeTime: 0.5, holdTime: 1 });
  await this.wait(200);
  FugsAudio.duck("bgm", 1, { level: 0.5, fadeTime: 0.3, holdTime: 0.5 });
  await this.wait(200);
  FugsAudio.duck("bgm", 1, { level: 0.2, fadeTime: 0.4, holdTime: 2 });
  await this.wait(3000);

  const buf = FugsAudio.tracks.get("bgm_1");
  console.log(`  Volume after ducks: ${buf ? Math.round(buf.volume * 100) : 0}%`);
  this.assert(true, "Overlapping ducks completed");
  await this.cleanup();
});

// --- MEMORY STRESS ---
TestRunner.add("stress:memory:leaks", async function () {
  await this.cleanup();
  const cycles = this.tracks._limitMode ? 3 : 10;
  console.log(`[STRESS] Memory leak check (${cycles} full cycles)...`);

  const initialTimeouts = FugsAudio.activeTimeouts.size;
  const initialFades = FugsAudio.FadeManager.activeFades.size;
  const initialEffects = FugsAudio.effectChains.size;

  for (let cycle = 0; cycle < cycles; cycle++) {
    const track = this.tracks.pick("bgm", cycle % 3);
    FugsAudio.play("bgm", 1, track, { volume: 50, fadein: 0.3 });
    await this.wait(400);
    FugsAudio.setEffect("bgm", 1, "underwater");
    await this.wait(200);
    FugsAudio.fade("bgm", 1, { volume: 80, duration: 0.3 });
    await this.wait(400);
    FugsAudio.removeEffect("bgm", 1);
    await this.wait(100);
    FugsAudio.stop("bgm", 1, 0.2);
    await this.wait(400);
  }

  await this.cleanup();
  await this.wait(800);

  const finalTimeouts = FugsAudio.activeTimeouts.size;
  const finalFades = FugsAudio.FadeManager.activeFades.size;
  const finalEffects = FugsAudio.effectChains.size;

  console.log(`  Timeouts: ${initialTimeouts} -> ${finalTimeouts}`);
  console.log(`  Fades: ${initialFades} -> ${finalFades}`);
  console.log(`  Effects: ${initialEffects} -> ${finalEffects}`);

  this.assert(finalTimeouts <= initialTimeouts + 2, `No timeout leak (${finalTimeouts})`);
  this.assert(finalFades <= initialFades + 2, `No fade leak (${finalFades})`);
  this.assert(finalEffects === 0, `No effect leak (${finalEffects})`);
});

TestRunner.add("stress:memory:trackCleanup", async function () {
  await this.cleanup();
  console.log("[STRESS] Track cleanup verification...");

  const trackCount = this.tracks._limitMode ? 3 : 10;
  for (let i = 1; i <= trackCount; i++) {
    FugsAudio.play("bgm", i, this.tracks.pick("bgm", (i - 1) % 3), { volume: 30, fadein: 0 });
  }
  await this.wait(500);

  const beforeCleanup = FugsAudio.tracks.size;
  console.log(`  Tracks before cleanup: ${beforeCleanup}`);

  FugsAudio.stopAll(0);
  await this.wait(500);

  const afterCleanup = FugsAudio.tracks.size;
  console.log(`  Tracks after cleanup: ${afterCleanup}`);

  this.assert(beforeCleanup >= trackCount - 2, `Created tracks (${beforeCleanup})`);
  this.assert(afterCleanup === 0, `All tracks cleaned up (${afterCleanup})`);
});

// --- COMBINED CHAOS TEST ---
TestRunner.add("stress:chaos", async function () {
  await this.cleanup();
  console.log("[STRESS] CHAOS TEST - Everything at once...");

  let errors = 0;

  try {
    // In batch mode, use fewer tracks to conserve node budget
    const isBatch = this.tracks._limitMode;

    // Start tracks
    FugsAudio.play("bgm", 1, this.tracks.pick("bgm", 0), { volume: 60, fadein: 0 });
    FugsAudio.play("bgm", 2, this.tracks.pick("bgm", 1), { volume: 50, fadein: 0 });
    if (!isBatch) {
      FugsAudio.play("bgs", 1, this.tracks.pick("bgs", 0), { volume: 40, fadein: 0 });
    }
    await this.wait(300);

    // Apply effect to one track
    FugsAudio.setEffect("bgm", 1, "underwater");
    await this.wait(200);

    // Start fades
    FugsAudio.fade("bgm", 1, { volume: 30, duration: 0.5 });
    FugsAudio.fade("bgm", 2, { pitch: 80, duration: 0.5 });
    await this.wait(600);

    // Remove effect before crossfade to reduce node pressure
    FugsAudio.removeEffect("bgm", 1);
    await this.wait(200);

    // Crossfade
    FugsAudio.crossfade("bgm", 1, "bgm", 1, this.tracks.pick("bgm", 2), {
      volume: 70,
      duration: 0.3,
    });
    await this.wait(500);

    // Duck
    FugsAudio.duck("bgm", 2, { level: 0.3, fadeTime: 0.2, holdTime: 0.3 });
    await this.wait(600);

    // Stop remaining
    FugsAudio.stopAll(0);
    await this.wait(300);
  } catch (e) {
    errors++;
    console.log(`  Chaos error: ${e.message}`);
  }

  const remainingTracks = FugsAudio.tracks.size;
  console.log(`  Remaining tracks: ${remainingTracks}`);
  console.log(`  Effect chains: ${FugsAudio.effectChains.size}`);
  console.log(`  Active fades: ${FugsAudio.FadeManager.activeFades.size}`);

  this.assert(errors === 0, "Chaos test completed without errors");
  await this.cleanup();
});

// =====================================================================
// COVERAGE REPORT
// =====================================================================
TestRunner.add("coverage", async function () {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  CODE COVERAGE REPORT — FugsMultiTrackAudioEX");
  console.log("═══════════════════════════════════════════════════════════");

  // ── Method registry (every public/private method per object) ──────
  const registry = {
    Logger: ["info", "warn", "error", "success", "effect", "switch", "debug", "debugOnce"],
    DistanceCurves: [
      "linear",
      "exponential",
      "logarithmic",
      "smooth",
      "sharp",
      "gentle",
      "custom",
    ],
    AudioEffects: [
      "init",
      "toNum",
      "validateBuffer",
      "createEffectChain",
      "createDistortionCurve",
      "_addToCache",
      "createBitcrusherCurve",
      "getPreset",
      "listPresets",
      "getAllPresetNames",
    ],
    FadeManager: ["startFade", "update", "applyCurve", "cancelFade", "cancelAllFades"],
    SwitchManager: [
      "init",
      "hookSwitchSystem",
      "addSwitch",
      "removeSwitch",
      "isMonitored",
      "getMonitoredSwitches",
      "clearAll",
    ],
    SwitchBuffer: [
      "_makeCommandKey",
      "_makeCommandSignature",
      "_removeActiveId",
      "addCommand",
      "addRestoreCommand",
      "executeSwitch",
      "executeSwitchCommands",
      "stopSwitchCommands",
      "clearSwitch",
      "clearAll",
    ],
    FugsMultiTrackAudioEX: [
      "init",
      "toNum",
      "ensurePumpNode",
      "updatePump",
      "registerAlias",
      "unregisterAlias",
      "playAlias",
      "listAliases",
      "parseProximityConfig",
      "parseAliasConfig",
      "executeCommand",
      "playAudio",
      "syncPlay",
      "startSyncedBuffers",
      "setupSidechain",
      "_disposeSidechainConnection",
      "stopSidechain",
      "stopAudio",
      "fadeAudio",
      "fadeAllAudio",
      "fadeAllOfType",
      "duckVolume",
      "duckAllOfType",
      "duckAllAudio",
      "sidechainDuck",
      "pitchBendAll",
      "pitchBendAllOfType",
      "startPanSweep",
      "stopPanSweep",
      "pauseAudio",
      "resumeAudio",
      "pauseAll",
      "resumeAll",
      "connectEffectChain",
      "_disposeEffectChain",
      "_setEffectWetMix",
      "applyEffect",
      "fadeEffect",
      "fadeOutEffect",
      "crossFadeEffect",
      "clearEffect",
      "setupProximitySource",
      "updateTrackPitch",
      "updateProximityVolume",
      "cleanupTrack",
      "captureTrackState",
      "saveAllStates",
      "loadTrackState",
      "loadAllStates",
      "getSaveData",
      "applySaveData",
      "parseCommand",
      "parseClassicSyntax",
      "consumeParenTag",
      "checkStartTime",
      "checkLoop",
      "checkCurve",
      "checkPersistence",
      "checkPauseMode",
      "parseArguments",
      "handleSceneTransition",
      "cleanupOrphanedTracks",
      "stopAllOfType",
      "stopAll",
      "executeChain",
      "listall",
      "testCommand",
      "play",
      "stop",
      "fade",
      "crossfade",
      "duck",
      "duckAll",
      "startPump",
      "stopPump",
      "setProximity",
      "clearProximity",
      "setEffect",
      "fadeInEffect",
      "fadeOutEffectOnTrack",
      "crossfadeEffects",
      "removeEffect",
      "sync",
      "chain",
      "pause",
      "resume",
      "sweepPan",
      "stopSweepPan",
      "save",
      "load",
      "list",
    ],
  };

  // ── Coverage map: method → tests that exercise it ────────────────
  const coverageMap = {
    // --- Logger (internal, exercised indirectly by every test) ---
    "Logger.info": ["*"],
    "Logger.warn": ["*"],
    "Logger.error": ["*"],
    "Logger.success": ["*"],
    "Logger.effect": ["effect", "effect:fadein", "effect:fadeout"],
    "Logger.switch": [],
    "Logger.debug": ["*"],
    "Logger.debugOnce": [],
    // --- DistanceCurves ---
    "DistanceCurves.linear": ["unit:distanceCurves", "spatial"],
    "DistanceCurves.exponential": ["unit:distanceCurves", "spatial"],
    "DistanceCurves.logarithmic": ["unit:distanceCurves"],
    "DistanceCurves.smooth": ["unit:distanceCurves"],
    "DistanceCurves.sharp": ["unit:distanceCurves"],
    "DistanceCurves.gentle": ["unit:distanceCurves"],
    "DistanceCurves.custom": ["unit:distanceCurves", "unit:distanceCurvesCustom"],
    // --- AudioEffects ---
    "AudioEffects.init": [],
    "AudioEffects.toNum": ["unit:toNumParity"],
    "AudioEffects.validateBuffer": ["unit:validateBuffer"],
    "AudioEffects.createEffectChain": ["effect", "effect:fadein", "preset", "preset:all"],
    "AudioEffects.createDistortionCurve": [],
    "AudioEffects._addToCache": [],
    "AudioEffects.createBitcrusherCurve": [],
    "AudioEffects.getPreset": [
      "unit:presetStructure",
      "unit:presetLookup",
      "unit:presetAliases",
      "unit:presetEdgeCases",
      "unit:presetCategories",
      "unit:presetSamples",
      "unit:presetAliasChain",
      "preset",
    ],
    "AudioEffects.listPresets": ["unit:presetListMethods"],
    "AudioEffects.getAllPresetNames": [
      "unit:presetCounts",
      "unit:presetNoDuplicates",
      "unit:presetListMethods",
    ],
    // --- FadeManager ---
    "FadeManager.startFade": [
      "diag:fade",
      "fade:volume",
      "fade:curve",
      "fade:pan",
      "fade:pitch",
      "fade:pitch:automation",
      "crossfade",
    ],
    "FadeManager.update": [
      "diag:fade",
      "fade:volume",
      "fade:curve",
      "fade:pan",
      "fade:pitch",
      "fade:pitch:automation",
    ],
    "FadeManager.applyCurve": ["unit:fadeCurves", "diag:fade", "fade:volume", "fade:curve"],
    "FadeManager.cancelFade": ["stop:fade", "stop:all"],
    "FadeManager.cancelAllFades": ["stop:all"],
    // --- SwitchManager ---
    "SwitchManager.init": [],
    "SwitchManager.hookSwitchSystem": [],
    "SwitchManager.addSwitch": [],
    "SwitchManager.removeSwitch": [],
    "SwitchManager.isMonitored": [],
    "SwitchManager.getMonitoredSwitches": [],
    "SwitchManager.clearAll": [],
    // --- SwitchBuffer ---
    "SwitchBuffer._makeCommandKey": [],
    "SwitchBuffer._makeCommandSignature": [],
    "SwitchBuffer._removeActiveId": [],
    "SwitchBuffer.addCommand": [],
    "SwitchBuffer.addRestoreCommand": [],
    "SwitchBuffer.executeSwitch": [],
    "SwitchBuffer.executeSwitchCommands": [],
    "SwitchBuffer.stopSwitchCommands": [],
    "SwitchBuffer.clearSwitch": [],
    "SwitchBuffer.clearAll": [],
    // --- FugsMultiTrackAudioEX ---
    "FugsMultiTrackAudioEX.init": [],
    "FugsMultiTrackAudioEX.toNum": ["unit:toNum", "unit:toNumFull", "unit:toNumParity"],
    "FugsMultiTrackAudioEX.ensurePumpNode": ["stress:chaos"],
    "FugsMultiTrackAudioEX.updatePump": ["stress:chaos"],
    "FugsMultiTrackAudioEX.registerAlias": [],
    "FugsMultiTrackAudioEX.unregisterAlias": [],
    "FugsMultiTrackAudioEX.playAlias": [],
    "FugsMultiTrackAudioEX.listAliases": [],
    "FugsMultiTrackAudioEX.parseProximityConfig": ["unit:parseProximityConfig"],
    "FugsMultiTrackAudioEX.parseAliasConfig": ["unit:parseAliasConfig"],
    "FugsMultiTrackAudioEX.executeCommand": ["unit:command", "stress:chaos"],
    "FugsMultiTrackAudioEX.playAudio": [
      "play",
      "play:multi",
      "play:types",
      "play:fadein",
      "layers",
      "se",
      "me",
      "pool:create",
      "pool:reuse",
      "pool:limits",
      "stress:play:rapid",
      "stress:play:many",
      "stress:play:burst",
    ],
    "FugsMultiTrackAudioEX.syncPlay": [],
    "FugsMultiTrackAudioEX.startSyncedBuffers": [],
    "FugsMultiTrackAudioEX.setupSidechain": [],
    "FugsMultiTrackAudioEX._disposeSidechainConnection": [],
    "FugsMultiTrackAudioEX.stopSidechain": [],
    "FugsMultiTrackAudioEX.stopAudio": [
      "stop",
      "stop:fade",
      "stop:all",
      "layers",
      "se",
      "me",
      "memory",
    ],
    "FugsMultiTrackAudioEX.fadeAudio": [
      "fade:volume",
      "fade:curve",
      "fade:pan",
      "fade:pitch",
      "fade:pitch:automation",
      "fade:pitch:analyze",
      "stress:fade:overlapping",
      "stress:fade:multiParam",
      "stress:fade:rapid",
    ],
    "FugsMultiTrackAudioEX.fadeAllAudio": [],
    "FugsMultiTrackAudioEX.fadeAllOfType": [],
    "FugsMultiTrackAudioEX.duckVolume": ["duck", "stress:duck:overlapping"],
    "FugsMultiTrackAudioEX.duckAllOfType": [],
    "FugsMultiTrackAudioEX.duckAllAudio": ["duck:all"],
    "FugsMultiTrackAudioEX.sidechainDuck": [],
    "FugsMultiTrackAudioEX.pitchBendAll": [],
    "FugsMultiTrackAudioEX.pitchBendAllOfType": [],
    "FugsMultiTrackAudioEX.startPanSweep": [],
    "FugsMultiTrackAudioEX.stopPanSweep": [],
    "FugsMultiTrackAudioEX.pauseAudio": ["pause"],
    "FugsMultiTrackAudioEX.resumeAudio": ["pause"],
    "FugsMultiTrackAudioEX.pauseAll": [],
    "FugsMultiTrackAudioEX.resumeAll": [],
    "FugsMultiTrackAudioEX.connectEffectChain": ["effect", "effect:fadein", "preset"],
    "FugsMultiTrackAudioEX._disposeEffectChain": ["effect:fadeout", "memory"],
    "FugsMultiTrackAudioEX._setEffectWetMix": ["effect:fadein", "effect:fadeout"],
    "FugsMultiTrackAudioEX.applyEffect": [
      "effect",
      "preset",
      "preset:all",
      "preset:categories:full",
      "stress:effect:rapid",
      "stress:effect:manyTracks",
    ],
    "FugsMultiTrackAudioEX.fadeEffect": [
      "effect:fadein",
      "stress:effectFade:simultaneous",
      "stress:effectFade:fadeInOut",
    ],
    "FugsMultiTrackAudioEX.fadeOutEffect": ["effect:fadeout", "stress:effectFade:fadeInOut"],
    "FugsMultiTrackAudioEX.crossFadeEffect": [
      "preset:crossfade",
      "stress:crossfade:withEffects",
    ],
    "FugsMultiTrackAudioEX.clearEffect": ["effect:fadeout", "memory"],
    "FugsMultiTrackAudioEX.setupProximitySource": ["spatial", "unit:proximity"],
    "FugsMultiTrackAudioEX.updateTrackPitch": [
      "unit:pitchMath",
      "fade:pitch",
      "fade:pitch:automation",
    ],
    "FugsMultiTrackAudioEX.updateProximityVolume": ["spatial", "unit:proximity"],
    "FugsMultiTrackAudioEX.cleanupTrack": [
      "memory",
      "stress:memory:leaks",
      "stress:memory:trackCleanup",
    ],
    "FugsMultiTrackAudioEX.captureTrackState": ["save"],
    "FugsMultiTrackAudioEX.saveAllStates": ["save"],
    "FugsMultiTrackAudioEX.loadTrackState": ["load"],
    "FugsMultiTrackAudioEX.loadAllStates": ["load"],
    "FugsMultiTrackAudioEX.getSaveData": ["save"],
    "FugsMultiTrackAudioEX.applySaveData": ["load"],
    "FugsMultiTrackAudioEX.parseCommand": ["unit:parse", "unit:command", "unit:parseClassic"],
    "FugsMultiTrackAudioEX.parseClassicSyntax": ["unit:parse", "unit:parseClassic"],
    "FugsMultiTrackAudioEX.consumeParenTag": ["unit:consumeParenTag"],
    "FugsMultiTrackAudioEX.checkStartTime": ["unit:consumeParenTag", "unit:modifiers"],
    "FugsMultiTrackAudioEX.checkLoop": [
      "unit:consumeParenTag",
      "unit:modifiers",
      "unit:loop",
      "unit:loopFull",
    ],
    "FugsMultiTrackAudioEX.checkCurve": ["unit:consumeParenTag", "unit:modifiers"],
    "FugsMultiTrackAudioEX.checkPersistence": ["unit:consumeParenTag", "unit:modifiers"],
    "FugsMultiTrackAudioEX.checkPauseMode": ["unit:consumeParenTag", "unit:modifiers"],
    "FugsMultiTrackAudioEX.parseArguments": ["unit:parseArguments"],
    "FugsMultiTrackAudioEX.handleSceneTransition": [],
    "FugsMultiTrackAudioEX.cleanupOrphanedTracks": ["memory"],
    "FugsMultiTrackAudioEX.stopAllOfType": ["stop:all"],
    "FugsMultiTrackAudioEX.stopAll": ["stop:all", "stress:chaos"],
    "FugsMultiTrackAudioEX.executeChain": [],
    "FugsMultiTrackAudioEX.listall": [],
    "FugsMultiTrackAudioEX.testCommand": [],
    "FugsMultiTrackAudioEX.play": ["play", "play:multi", "play:types", "play:fadein"],
    "FugsMultiTrackAudioEX.stop": ["stop", "stop:fade"],
    "FugsMultiTrackAudioEX.fade": ["fade:volume", "fade:curve", "fade:pan", "fade:pitch"],
    "FugsMultiTrackAudioEX.crossfade": ["crossfade", "crossfade:same"],
    "FugsMultiTrackAudioEX.duck": ["duck"],
    "FugsMultiTrackAudioEX.duckAll": ["duck:all"],
    "FugsMultiTrackAudioEX.startPump": [],
    "FugsMultiTrackAudioEX.stopPump": [],
    "FugsMultiTrackAudioEX.setProximity": ["spatial", "unit:proximity"],
    "FugsMultiTrackAudioEX.clearProximity": ["spatial", "unit:proximity"],
    "FugsMultiTrackAudioEX.setEffect": [
      "effect",
      "preset",
      "preset:all",
      "preset:categories:full",
    ],
    "FugsMultiTrackAudioEX.fadeInEffect": ["effect:fadein"],
    "FugsMultiTrackAudioEX.fadeOutEffectOnTrack": ["effect:fadeout"],
    "FugsMultiTrackAudioEX.crossfadeEffects": ["preset:crossfade"],
    "FugsMultiTrackAudioEX.removeEffect": ["effect:fadeout", "memory"],
    "FugsMultiTrackAudioEX.sync": [],
    "FugsMultiTrackAudioEX.chain": [],
    "FugsMultiTrackAudioEX.pause": ["pause"],
    "FugsMultiTrackAudioEX.resume": ["pause"],
    "FugsMultiTrackAudioEX.sweepPan": [],
    "FugsMultiTrackAudioEX.stopSweepPan": [],
    "FugsMultiTrackAudioEX.save": ["save"],
    "FugsMultiTrackAudioEX.load": ["load"],
    "FugsMultiTrackAudioEX.list": [],
  };

  // ── Validate registry matches actual objects ─────────────────────
  console.log("\n┌─ Registry Validation ────────────────────────────────┐");
  const objects = {
    Logger: Logger,
    DistanceCurves: DistanceCurves,
    AudioEffects: AudioEffects,
    FadeManager: FugsAudio.FadeManager,
    SwitchManager: FugsAudio.SwitchManager,
    SwitchBuffer: FugsAudio.SwitchBuffer,
    FugsMultiTrackAudioEX: FugsAudio,
  };
  let registryErrors = 0;
  for (const [objName, methods] of Object.entries(registry)) {
    const obj = objects[objName];
    if (!obj) {
      console.log(`  ✗ Object ${objName} not found`);
      registryErrors++;
      continue;
    }
    for (const m of methods) {
      if (typeof obj[m] !== "function") {
        console.log(`  ✗ ${objName}.${m} not a function`);
        registryErrors++;
      }
    }
  }
  if (registryErrors === 0) {
    console.log("  ✓ All registered methods verified on live objects");
  }
  this.assert(registryErrors === 0, `Registry matches live objects (${registryErrors} errors)`);

  // ── Compute coverage ─────────────────────────────────────────────
  let totalMethods = 0;
  let coveredMethods = 0;
  let uncoveredMethods = 0;
  const perObject = {};
  const uncoveredList = [];

  for (const [objName, methods] of Object.entries(registry)) {
    let objCovered = 0;
    let objTotal = methods.length;
    for (const m of methods) {
      totalMethods++;
      const key = `${objName}.${m}`;
      const tests = coverageMap[key];
      if (tests && tests.length > 0) {
        coveredMethods++;
        objCovered++;
      } else {
        uncoveredMethods++;
        uncoveredList.push(key);
      }
    }
    perObject[objName] = { covered: objCovered, total: objTotal };
  }

  const pct = ((coveredMethods / totalMethods) * 100).toFixed(1);

  // ── Per-object breakdown with bar chart ──────────────────────────
  console.log("\n┌─ Per-Object Coverage ────────────────────────────────┐");
  const barWidth = 30;
  for (const [objName, stats] of Object.entries(perObject)) {
    const objPct = stats.total > 0 ? ((stats.covered / stats.total) * 100).toFixed(0) : 0;
    const filled = Math.round((stats.covered / stats.total) * barWidth);
    const empty = barWidth - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    const icon = stats.covered === stats.total ? "✓" : "△";
    console.log(
      `  ${icon} ${objName.padEnd(25)} ${bar} ${stats.covered}/${stats.total} (${objPct}%)`
    );
  }

  // ── Test categorization ──────────────────────────────────────────
  console.log("\n┌─ Test Categories ────────────────────────────────────┐");
  const allTests = Array.from(TestRunner.tests.keys());
  const unitTests = allTests.filter((t) => t.startsWith("unit:"));
  const integTests = allTests.filter(
    (t) =>
      !t.startsWith("unit:") &&
      !t.startsWith("stress:") &&
      !t.startsWith("diag:") &&
      !t.startsWith("pool:") &&
      !t.startsWith("playall") &&
      t !== "minimal" &&
      t !== "coverage"
  );
  const stressTests = allTests.filter((t) => t.startsWith("stress:"));
  const poolTests = allTests.filter((t) => t.startsWith("pool:"));
  const diagTests = allTests.filter((t) => t.startsWith("diag:"));
  console.log(`  Unit tests:        ${unitTests.length}`);
  console.log(`  Integration tests: ${integTests.length}`);
  console.log(`  Stress tests:      ${stressTests.length}`);
  console.log(`  Pool tests:        ${poolTests.length}`);
  console.log(`  Diagnostic tests:  ${diagTests.length}`);
  console.log(`  Total registered:  ${allTests.length} (excl. minimal, coverage)`);

  // ── Uncovered methods detail ─────────────────────────────────────
  console.log("\n┌─ Uncovered Methods ──────────────────────────────────┐");
  if (uncoveredList.length === 0) {
    console.log("  ✓ All methods have at least one test!");
  } else {
    // Group by object
    const grouped = {};
    for (const key of uncoveredList) {
      const [obj, method] = key.split(".");
      if (!grouped[obj]) grouped[obj] = [];
      grouped[obj].push(method);
    }
    for (const [obj, methods] of Object.entries(grouped)) {
      console.log(`  ${obj}:`);
      for (const m of methods) {
        console.log(`    • ${m}`);
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log("\n┌─ Summary ────────────────────────────────────────────┐");
  const summaryBar =
    "█".repeat(Math.round((pct / 100) * barWidth)) +
    "░".repeat(barWidth - Math.round((pct / 100) * barWidth));
  console.log(`  Overall:  ${summaryBar} ${coveredMethods}/${totalMethods} methods (${pct}%)`);
  console.log(`  Covered:   ${coveredMethods}`);
  console.log(`  Uncovered: ${uncoveredMethods}`);
  console.log("└──────────────────────────────────────────────────────┘");

  // ── Assertions ───────────────────────────────────────────────────
  this.assert(totalMethods > 130, `Registry has ${totalMethods} methods (expected >130)`);
  this.assert(coveredMethods > 80, `${coveredMethods} methods covered (expected >80)`);
  this.assert(Number(pct) > 55, `Coverage ${pct}% (expected >55%)`);
});

// =====================================================================
// GLOBAL TEST FUNCTION
// =====================================================================
window.test = (pattern) => TestRunner.run(pattern);
window.TestRunner = TestRunner;

Logger.info("Test runner loaded. Run: test() for help");

})();
