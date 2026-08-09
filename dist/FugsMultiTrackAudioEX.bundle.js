//=======================================================================//
//            FugsMultiTrackAudioEX.bundle.js (GENERATED)               //
//  Do not edit — rebuild with: node scripts/build-bundle.js           //
//=======================================================================//

//=======================================================================//
//                      FugsMultiTrackAudioEX.js                         //
//=======================================================================//
/*:
 * @plugindesc v2.2 Fugs MultiTrack Audio — ALL-IN-ONE BUNDLE (Core+Effects+Spatial+Dynamics+Switch+Aliases+Compat)
 * @target MV 1.63
 * @author Fug
 *
 * @param Debug Logs
 * @type select
 * @desc Select debug logging level.
 * @option Silent (for production)
 * @value 1
 * @option Critical errors only
 * @value 2
 * @option Basic logging
 * @value 3
 * @option Verbose logging
 * @value 4
 * @default 2
 *
 * @param Scene Fadeout Time
 * @type number
 * @desc Default fadeout duration in seconds for scene transitions.
 * @min 0
 * @max 10
 * @decimals 1
 * @default 0.5
 *
 * @param Default Doppler Scale
 * @type number
 * @desc Intensity of doppler pitch shifts for proximity audio.
 * @min 0.1
 * @max 10
 * @decimals 1
 * @default 1.0
 *
 * @param Default Persistence Mode
 * @type select
 * @desc What happens to tracks during scene/battle transitions.
 * @option None - Stops on any transition
 * @value none
 * @option Scene - Survives map changes, stops for battle
 * @value scene
 * @option Battle - Survives battle, stops for map changes
 * @value battle
 * @option Always - Never stops automatically
 * @value always
 * @default scene
 *
 * @param Default Pause Mode
 * @type select
 * @desc When should tracks auto-pause (and later resume).
 * @option Never - Never auto-pauses
 * @value never
 * @option Menu - Pauses when menu opens
 * @value menu
 * @option Battle - Pauses during battles
 * @value battle
 * @option Scene - Pauses on scene changes
 * @value scene
 * @default battle
 *
 * @help
 * =========================================================================
 * Fugs MultiTrack Audio — ALL-IN-ONE BUNDLE
 * =========================================================================
 * Mixer: play / stop / fade / crossfade / pause / resume / save / load /
 * syncplay / chain / pitch / pan / listall.
 *
 * Full command playbook, presets, spatial, dynamics, switches, aliases:
 *   Install and open  FugsAudio0Docs  in Plugin Manager.
 *
 * This file is a concatenated soft-transition bundle.
 * Prefer the modular pack (FugsMultiTrackAudioEX + FugsAudio2…7) for development.
 * Docs: install FugsAudio0Docs separately. Dev tests: FugsAudio8Test separately.
 * Do NOT also enable the individual satellite plugins when using this bundle.
 * =========================================================================
 */

(() => {
  function readPluginParams(name) {
    const p = PluginManager.parameters(name);
    return p && typeof p === "object" && Object.keys(p).length > 0 ? p : null;
  }
  const params =
    readPluginParams("FugsAudio1Core") ||
    readPluginParams("FugsMultiTrackAudioEX") ||
    {};
  const sceneFadeParam = Number(params["Scene Fadeout Time"]);
  const SceneFadeoutTime = !isNaN(sceneFadeParam) ? sceneFadeParam : 0.5;
  const DefaultDopplerScale = Number(params["Default Doppler Scale"]) || 1.0;
  const DefaultPersistenceMode = params["Default Persistence Mode"] || "scene";
  const DefaultPauseMode = params["Default Pause Mode"] || "battle";
  const FugsAudioConfig = {
    loggingLevel: Number(params["Debug Logs"]) || 2,
    sceneFadeoutTime: !isNaN(Number(params["Scene Fadeout Time"]))
      ? Number(params["Scene Fadeout Time"])
      : 0.5,
    defaultDopplerScale: Number(params["Default Doppler Scale"]) || 1.0,
    defaultPersistenceMode: params["Default Persistence Mode"] || "scene",
    defaultPauseMode: params["Default Pause Mode"] || "battle",
    sceneTransitionDelayMS: 100,
  };
  // Local aliases keep existing call sites working during multi-plugin transition.
  const loggingLevel = Number(params["Debug Logs"]) || 2;
  const sceneTransitionDelayMS = 100; // Fallback delay for simple transitions

  // Magic number constants (keep this small: only values used in code)
  const AUDIO_CONSTANTS = {
    // General
    CURVE_CACHE_MAX_SIZE: 50,
    REVERB_CACHE_MAX_SIZE: 20,
    MAX_RETRIES: 50,
    CACHE_KEY_DECIMALS: 6,

    // Distance curve math
    SMOOTHSTEP_A: 3,
    SMOOTHSTEP_B: 2,

    // Proximity defaults
    DEFAULT_PROXIMITY_MAX_DISTANCE: 10,
    DEFAULT_PROXIMITY_MIN_VOLUME: 0,
    DEFAULT_DOPPLER_SMOOTHING: 0.8,
    DOPPLER_SMOOTHING_MIN: 0,
    DOPPLER_SMOOTHING_MAX: 0.99,

    // Pump defaults
    DEFAULT_PUMP_BPM: 120,
    DEFAULT_PUMP_DEPTH: 0.5,
    DEFAULT_PUMP_SHAPE: "sine",

    // Core effect defaults
    DEFAULT_REVERB_DURATION: 2,
    DEFAULT_REVERB_DECAY: 0.8,
    DEFAULT_RESONANCE: 1,
    DEFAULT_LOWPASS_FREQ: 1000,
    DEFAULT_HIGHPASS_FREQ: 300,
    DEFAULT_BANDPASS_FREQ: 1000,
    DEFAULT_DISTORTION_AMOUNT: 50,
    DEFAULT_BITCRUSHER_BITS: 8,
    DEFAULT_BITCRUSHER_NORMFREQ: 0.5,
    DEFAULT_DELAY_MAX: 1,
    DEFAULT_DELAY_TIME: 0.3,
    DEFAULT_FEEDBACK: 0.3,

    // Compressor defaults
    DEFAULT_COMPRESSOR_THRESHOLD: -24,
    DEFAULT_COMPRESSOR_KNEE: 30,
    DEFAULT_COMPRESSOR_RATIO: 12,
    DEFAULT_COMPRESSOR_ATTACK: 0.003,
    DEFAULT_COMPRESSOR_RELEASE: 0.25,

    // LFO defaults
    DEFAULT_TREMOLO_RATE: 4,
    DEFAULT_TREMOLO_DEPTH: 0.5,
    DEFAULT_VIBRATO_RATE: 5,
    DEFAULT_VIBRATO_DEPTH: 20,
    VIBRATO_BASE_DELAY: 0.005,
    VIBRATO_CENTS_TO_RATIO: 1200,
    VIBRATO_DELAY_SCALE: 0.01,

    // Phaser defaults
    DEFAULT_PHASER_STAGES: 4,
    DEFAULT_PHASER_BASE_FREQ: 1000,
    DEFAULT_PHASER_DEPTH: 500,
    DEFAULT_PHASER_RATE: 1,

    // Chorus defaults
    CHORUS_VOICE_COUNT: 3,
    CHORUS_MAX_DELAY: 0.05,
    CHORUS_DELAY_BASE: 0.01,
    CHORUS_DELAY_INCREMENT: 0.01,
    CHORUS_MIX_FACTOR: 1 / 3,

    // Flanger defaults
    FLANGER_MAX_DELAY: 0.02,
    FLANGER_FEEDBACK_MAX: 0.95,
    DEFAULT_FLANGER_DELAY: 0.005,
    DEFAULT_FLANGER_FEEDBACK: 0.5,
    DEFAULT_FLANGER_RATE: 0.5,
    DEFAULT_FLANGER_DEPTH: 0.002,

    // Widener defaults
    DEFAULT_WIDENER_WIDTH: 0.015,
    WIDENER_MAX_DELAY: 1,

    // EQ defaults
    DEFAULT_EQ_LOW_FREQ: 320,
    DEFAULT_EQ_MID_FREQ: 1000,
    DEFAULT_EQ_HIGH_FREQ: 3200,

    // Ringmod / autopan defaults
    DEFAULT_RINGMOD_SPEED: 30,
    DEFAULT_RINGMOD_MIX: 1,
    DEFAULT_AUTOPAN_SPEED: 0.5,
    DEFAULT_AUTOPAN_DEPTH: 1,
    AUTOPAN_PAN_MIN: -1,
    AUTOPAN_PAN_MAX: 1,

    // Overdrive defaults
    OVERDRIVE_DRIVE_DEFAULT: 20,
    OVERDRIVE_OUTPUT_DEFAULT: 1.2,
    OVERDRIVE_DRIVE_MIN: 0.1,
    OVERDRIVE_DRIVE_SCALE: 10,

    // Multitap defaults
    MULTITAP_DEFAULT_DELAY_1: 0.18,
    MULTITAP_DEFAULT_FEEDBACK_1: 0.3,
    MULTITAP_DEFAULT_PAN_1: -0.5,
    MULTITAP_DEFAULT_WET: 0.5,
    MULTITAP_TAP_DELAY_FALLBACK: 0.25,
    MULTITAP_DEFAULT_DELAY_2: 0.32,
    MULTITAP_DEFAULT_FEEDBACK_2: 0.25,
    MULTITAP_DEFAULT_PAN_2: 0.5,
    MULTITAP_DEFAULT_DELAY_3: null,
    MULTITAP_DEFAULT_FEEDBACK_3: null,
    MULTITAP_DEFAULT_PAN_3: 0,

    // Curve generation bounds
    MIN_SAMPLE_RATE: 44100,
    MIN_CURVE_SAMPLES: 2048,
    MAX_CURVE_SAMPLES: 65536,

    DISTORTION_AMOUNT_MIN: 0,
    DISTORTION_AMOUNT_MAX: 1000,
    DISTORTION_DEG_TO_RAD: Math.PI / 180,
    DISTORTION_INPUT_SCALE: 2,
    DISTORTION_INPUT_OFFSET: 1,
    DISTORTION_AMP_MULTIPLIER: 3,
    DISTORTION_X_SCALER: 20,
    DISTORTION_OUTPUT_CLAMP_MIN: -1,
    DISTORTION_OUTPUT_CLAMP_MAX: 1,

    BITCRUSHER_BITS_MIN: 1,
    BITCRUSHER_BITS_MAX: 16,
    NORMFREQ_MIN: 0.0001,
    NORMFREQ_MAX: 1,
    BITCRUSHER_LEVELS_BASE: 2,
    BITCRUSHER_STEP_BASE: 2,
    BITCRUSHER_RANGE_MIN: -1,
    BITCRUSHER_RANGE_MAX: 1,
    BITCRUSHER_INDEX_SCALE: 2,
    BITCRUSHER_INPUT_OFFSET: 1,
    BITCRUSHER_STEPPED_OFFSET: 1,
    BITCRUSHER_BLEND_NORMAL: 1,
    BITCRUSHER_BLEND_FACTOR: 0.5,
  };

  // Logger
  const Logger = {
    prefix: "FugsAudioEX",
    _debugOnce: new Set(),
    info(message, data = {}) {
      if (loggingLevel < 3) return;
      console.groupCollapsed(`[${this.prefix} INFO] ${message}`);
      if (Object.keys(data).length > 0) {
        console.log("Data:", data);
      }
      console.trace("Called from:");
      console.groupEnd();
    },

    warn(message, data = {}) {
      if (loggingLevel >= 3) {
        console.warn(`[${this.prefix} WARN] ${message}`, data);
      }
    },

    error(message, data = {}) {
      if (loggingLevel >= 2) {
        console.error(`[${this.prefix} ERROR] ${message}`, data);
      }
    },

    success(message, data = {}) {
      if (loggingLevel >= 3) {
        console.log(`[${this.prefix} OK] ${message}`, data);
      }
    },

    effect(message, data = {}) {
      if (loggingLevel >= 4) {
        console.log(`[${this.prefix} EFFECT] ${message}`, data);
      }
    },

    switch(message, data = {}) {
      if (loggingLevel >= 4) {
        console.log(`[${this.prefix} SWITCH] ${message}`, data);
      }
    },

    debug(message, data = {}) {
      if (loggingLevel >= 4) {
        console.log(`[${this.prefix} DEBUG] ${message}`, data);
      }
    },

    debugOnce(message, data = {}, key = message) {
      if (loggingLevel >= 4) {
        if (this._debugOnce.has(key)) return;
        this._debugOnce.add(key);
        console.log(`[${this.prefix} DEBUG] ${message}`, data);
      }
    },
  };
  // DistanceCurves extracted to FugsAudio3Spatial.js (Phase 4)
  const DistanceCurves = window.DistanceCurves || {
    linear() { return 1; },
    exponential() { return 1; },
    logarithmic() { return 1; },
    smooth() { return 1; },
    sharp() { return 1; },
    gentle() { return 1; },
    custom() { return 1; },
  };

  // AudioEffects extracted to FugsAudio2Effects.js (Phase 3)

  // Performance-optimized fade system
  // Uses RAF for smooth updates with a setTimeout watchdog that kicks in
  // whenever RAF stalls (backgrounded tab, heavy GC, DevTools open, etc.).
  const FadeManager = {
    activeFades: new Map(),
    rafId: null,
    _watchdogId: null,
    _lastTick: 0, // Timestamp of last successful update()

    startFade(key, startValue, targetValue, duration, onUpdate, onComplete, curve = "smooth") {
      if (this.activeFades.has(key)) {
        this.cancelFade(key);
      }

      // Handle instant fade (duration = 0)
      if (duration <= 0) {
        onUpdate(targetValue);
        if (onComplete) onComplete();
        return;
      }

      const fade = {
        key,
        startValue,
        targetValue,
        duration: duration * 1000,
        startTime: performance.now(),
        onUpdate,
        onComplete,
        curve,
      };

      this.activeFades.set(key, fade);
      this._ensureRunning();
    },

    // Start both RAF and watchdog if not already running
    _ensureRunning() {
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => this.update());
      }
      if (!this._watchdogId) {
        this._watchdogId = setInterval(() => this._watchdog(), 100);
      }
    },

    // Watchdog: if RAF hasn't ticked in >150 ms, drive update() manually
    _watchdog() {
      if (this.activeFades.size === 0) {
        this._stopWatchdog();
        return;
      }
      const now = performance.now();
      if (now - this._lastTick > 150) {
        this.update();
      }
    },

    _stopWatchdog() {
      if (this._watchdogId) {
        clearInterval(this._watchdogId);
        this._watchdogId = null;
      }
    },

    update() {
      this._lastTick = performance.now();
      const now = this._lastTick;
      const completedFades = [];

      for (const [key, fade] of this.activeFades.entries()) {
        // B08: skip fades already finalized by a re-entrant update() (RAF vs
        // watchdog racing, or an onComplete that synchronously drives update()).
        if (fade._completed) continue;

        const elapsed = now - fade.startTime;
        const progress = Math.min(elapsed / fade.duration, 1);

        const easedProgress = this.applyCurve(progress, fade.curve);

        const currentValue = fade.startValue + (fade.targetValue - fade.startValue) * easedProgress;
        fade.onUpdate(currentValue);

        if (progress >= 1) {
          // Mark done and collect; do NOT fire onComplete yet.
          fade._completed = true;
          completedFades.push(fade);
        }
      }

      // B08: remove completed fades from the map BEFORE firing onComplete so a
      // re-entrant update() can never observe (and re-fire) the same fade.
      completedFades.forEach((fade) => this.activeFades.delete(fade.key));
      completedFades.forEach((fade) => {
        if (fade.onComplete) fade.onComplete();
      });

      if (this.activeFades.size > 0) {
        this.rafId = requestAnimationFrame(() => this.update());
      } else {
        this.rafId = null;
        this._stopWatchdog();
      }
    },
    applyCurve(progress, curve) {
      // Adapt distance curves for fade progress (0-1 range)
      switch (curve) {
        case "linear":
          return progress;

        case "exponential":
          return Math.pow(progress, 2);

        case "logarithmic":
          return Math.sqrt(progress);

        case "smooth":
          return 3 * progress * progress - 2 * progress * progress * progress;

        case "sharp":
          return Math.pow(progress, 3);

        case "gentle":
          return Math.pow(progress, 0.5);

        case "ease-in":
          return progress * progress;

        case "ease-out":
          return 1 - Math.pow(1 - progress, 2);

        case "ease-in-out":
          return progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

        default:
          return progress; // fallback to linear
      }
    },
    cancelFade(key) {
      this.activeFades.delete(key);
      // RAF will auto-stop when activeFades is empty (see update())
    },

    cancelAllFades() {
      this.activeFades.clear();
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this._stopWatchdog();
    },
  };

  // SwitchManager + SwitchBuffer extracted to FugsAudio5Switch.js (Phase 5)

  // Main Plugin System
  const FugsMultiTrackAudioEX = {
    tracks: new Map(),
    namedSnapshots: new Map(),
    proximityData: new Map(),
    pausedTracks: new Set(),
    pausedSnapshots: new Map(), // Store paused track state for reliable resume
    effectChains: new Map(),
    panSweeps: new Map(),
    sidechainConnections: new Map(), // Track active sidechain compressors
    activeTimeouts: new Map(), // Track setTimeout IDs for cleanup
    proximityErrors: new Set(), // Track logged proximity errors to avoid spam
    sfxAliases: new Map(), // SFX alias pool definitions
    aliasLastPlayed: new Map(), // Cooldown tracking for aliases
    pumpConfig: { active: false, bpm: 120, depth: 0, shape: "sine", tracks: "all", startTime: 0 },
    // Phase 2 extension contract
    config: typeof FugsAudioConfig !== "undefined" ? FugsAudioConfig : {},
    _handlers: new Map(),
    _teardownHooks: [],
    _updateHooks: [],
    _sceneTransitionHooks: [],
    _captureStateHooks: [],
    _restoreStateHooks: [],
    _captureGlobalStateHooks: [],
    _restoreGlobalStateHooks: [],
    _savedGlobalMeta: null, // pending __fugsMeta from applySaveData
    _switchGatedHandlers: [],
    _coreLifecycleRegistered: false,
    lastPlayerX: null, // Track player position for proximity dirty-flag optimization
    lastPlayerY: null,

    init() {
      if (window.AudioEffects && typeof window.AudioEffects.init === "function") {
        window.AudioEffects.init();
      }
      this._registerCoreLifecycle();
      // SwitchManager.init() runs in FugsAudio5Switch when loaded.
      // Only log at verbose level to avoid console clutter
      if (loggingLevel >= 4) {
        Logger.info("Debug logging level:", { level: loggingLevel });
      }
    },

    // Safe number conversion to prevent NaN poisoning
    // Correctly handles 0 as a valid value (unlike Number(x) || default pattern)
    // Uses Number.isNaN (not global isNaN) for proper type checking
    toNum(value, fallback = 0) {
      if (value === undefined || value === null) return fallback;
      if (typeof value === "object") return fallback; // reject arrays/objects
      if (typeof value === "string" && value.trim() === "") return fallback;
      const n = Number(value);
      return Number.isNaN(n) || !Number.isFinite(n) ? fallback : n;
    },

    // =====================================================================
    // Rhythmic Pump / Duck System
    // =====================================================================


    // =====================================================================
    // Extension contract — command registry + lifecycle hooks (Phase 2)
    // =====================================================================

    registerHandler(action, fn) {
      if (!action || typeof fn !== "function") {
        Logger.warn("registerHandler: action and function required", { action });
        return false;
      }
      this._handlers.set(String(action).toLowerCase(), fn);
      return true;
    },

    unregisterHandler(action) {
      return this._handlers.delete(String(action).toLowerCase());
    },

    hasHandler(action) {
      return this._handlers.has(String(action).toLowerCase());
    },

    isKnownPluginCommand(cmdName) {
      if (!cmdName || typeof cmdName !== "string") return false;
      const lower = cmdName.toLowerCase();
      for (const action of this._handlers.keys()) {
        if (lower === action || lower.startsWith(action + "-")) return true;
      }
      const builtins = [
        "play","stop","fade","crossfade","pause","resume","effect","duck","proximity","pitch","pan",
        "syncplay","sidechain","doppler","chain","stopall","fadeall","duckall","listall","saveall","loadall",
        "pauseall","resumeall","duckpump","stoppump","pansweep","stoppansweep","fadeeffect","fadeouteffect",
        "cleareffect","crossfadeeffect","registeralias","unregisteralias","listaliases","pitchbendall",
        "stopsidechain","duckall-sidechain",
      ];
      for (const action of builtins) {
        if (lower === action || lower.startsWith(action + "-")) return true;
      }
      return false;
    },

    onTeardown(fn) { if (typeof fn === "function") this._teardownHooks.push(fn); },
    onUpdate(fn) { if (typeof fn === "function") this._updateHooks.push(fn); },
    onSceneTransition(fn) { if (typeof fn === "function") this._sceneTransitionHooks.push(fn); },
    onCaptureState(fn) { if (typeof fn === "function") this._captureStateHooks.push(fn); },
    onRestoreState(fn) { if (typeof fn === "function") this._restoreStateHooks.push(fn); },
    onCaptureGlobalState(fn) { if (typeof fn === "function") this._captureGlobalStateHooks.push(fn); },
    onRestoreGlobalState(fn) { if (typeof fn === "function") this._restoreGlobalStateHooks.push(fn); },
    onSwitchGatedCommand(fn) { if (typeof fn === "function") this._switchGatedHandlers.push(fn); },

    _runHooks(list, ...args) {
      if (!list || !list.length) return;
      for (let i = 0; i < list.length; i++) {
        try { list[i].apply(this, args); }
        catch (e) { Logger.error("Lifecycle hook failed", { error: e && e.message ? e.message : e }); }
      }
    },

    runUpdateHooks() { this._runHooks(this._updateHooks); },

    // B06: collect satellite per-track state (e.g. proximity/spatial config) into
    // one plain object that travels with the saved track state. Each capture hook
    // receives the track key and returns an object that is merged in (namespaced
    // by the satellite, e.g. { proximity: {...} }) — undefined/non-objects skipped.
    _runCaptureHooks(key) {
      const ext = {};
      if (!this._captureStateHooks || !this._captureStateHooks.length) return ext;
      for (let i = 0; i < this._captureStateHooks.length; i++) {
        try {
          const part = this._captureStateHooks[i].call(this, key);
          if (part && typeof part === "object") Object.assign(ext, part);
        } catch (e) {
          Logger.error("Capture-state hook failed", { key, error: e && e.message ? e.message : e });
        }
      }
      return ext;
    },

    // B06: hand the saved satellite state back to each restore hook after the
    // track has been (re)created, so e.g. proximity can re-bind. Never throws.
    _runRestoreHooks(key, ext) {
      if (!this._restoreStateHooks || !this._restoreStateHooks.length) return;
      const data = ext && typeof ext === "object" ? ext : {};
      for (let i = 0; i < this._restoreStateHooks.length; i++) {
        try {
          this._restoreStateHooks[i].call(this, key, data);
        } catch (e) {
          Logger.error("Restore-state hook failed", { key, error: e && e.message ? e.message : e });
        }
      }
    },

    // Global (non-per-track) satellite state for save files — e.g. active pump.
    // Stored under reserved key __fugsMeta in getSaveData(); never treated as a
    // named snapshot.
    _runGlobalCaptureHooks() {
      const meta = {};
      if (!this._captureGlobalStateHooks || !this._captureGlobalStateHooks.length) return meta;
      for (let i = 0; i < this._captureGlobalStateHooks.length; i++) {
        try {
          const part = this._captureGlobalStateHooks[i].call(this);
          if (part && typeof part === "object") Object.assign(meta, part);
        } catch (e) {
          Logger.error("Capture-global-state hook failed", {
            error: e && e.message ? e.message : e,
          });
        }
      }
      return meta;
    },

    _runGlobalRestoreHooks(meta) {
      if (!this._restoreGlobalStateHooks || !this._restoreGlobalStateHooks.length) return;
      const data = meta && typeof meta === "object" ? meta : {};
      for (let i = 0; i < this._restoreGlobalStateHooks.length; i++) {
        try {
          this._restoreGlobalStateHooks[i].call(this, data);
        } catch (e) {
          Logger.error("Restore-global-state hook failed", {
            error: e && e.message ? e.message : e,
          });
        }
      }
    },

    tryPlayAlias(aliasName, type, trackId) {
      if (typeof this.playAlias === "function") return this.playAlias(aliasName, type, trackId);
      console.warn("[FugsAudio] alias:" + aliasName + " requires FugsAudio6Aliases");
      return false;
    },

    applyEffectIfPresent(key, effectConfig, params) {
      if (!window.AudioEffects) {
        console.warn("[FugsAudio] effect on " + key + " requires FugsAudio2Effects");
        return false;
      }
      if (typeof this.applyEffect === "function") return this.applyEffect(key, effectConfig, params);
      console.warn("[FugsAudio] effect on " + key + " requires FugsAudio2Effects");
      return false;
    },

    _registerCoreLifecycle() {
      if (this._coreLifecycleRegistered) return;
      this._coreLifecycleRegistered = true;

      // Soft-stub satellite commands (console.warn so default loggingLevel still shows them).
      // Satellites overwrite these via registerHandler when loaded.
      const soft = (action, plugin) => {
        this.registerHandler(action, function () {
          console.warn("[FugsAudio] " + action + " requires " + plugin);
          return false;
        });
      };
      soft("effect", "FugsAudio2Effects");
      soft("fadeeffect", "FugsAudio2Effects");
      soft("fadeouteffect", "FugsAudio2Effects");
      soft("cleareffect", "FugsAudio2Effects");
      soft("crossfadeeffect", "FugsAudio2Effects");
      soft("proximity", "FugsAudio3Spatial");
      soft("doppler", "FugsAudio3Spatial");
      soft("pansweep", "FugsAudio3Spatial");
      soft("stoppansweep", "FugsAudio3Spatial");
      soft("duck", "FugsAudio4Dynamics");
      soft("duckpump", "FugsAudio4Dynamics");
      soft("stoppump", "FugsAudio4Dynamics");
      soft("duckall", "FugsAudio4Dynamics");
      soft("duckall-sidechain", "FugsAudio4Dynamics");
      soft("duckall-bgm", "FugsAudio4Dynamics");
      soft("duckall-bgs", "FugsAudio4Dynamics");
      soft("duckall-me", "FugsAudio4Dynamics");
      soft("duckall-se", "FugsAudio4Dynamics");
      soft("pitchbendall", "FugsAudio4Dynamics");
      soft("pitchbendall-bgm", "FugsAudio4Dynamics");
      soft("pitchbendall-bgs", "FugsAudio4Dynamics");
      soft("pitchbendall-me", "FugsAudio4Dynamics");
      soft("pitchbendall-se", "FugsAudio4Dynamics");
      soft("sidechain", "FugsAudio4Dynamics");
      soft("stopsidechain", "FugsAudio4Dynamics");
      soft("registeralias", "FugsAudio6Aliases");
      soft("unregisteralias", "FugsAudio6Aliases");
      soft("listaliases", "FugsAudio6Aliases");
      // Switch gating registers from FugsAudio5Switch when loaded.
      // Proximity/pump updates register from Spatial/Dynamics satellites.
    },

    ensurePumpNode(_buffer) {
      console.warn("[FugsAudio] ensurePumpNode requires FugsAudio4Dynamics");
      return false;
    },
    updatePump() {
      console.warn("[FugsAudio] updatePump requires FugsAudio4Dynamics");
      return false;
    },
    // =====================================================================
    // SFX Alias Pool + Humanizer
    // =====================================================================

    /**
     * Register an SFX alias with a pool of sounds and humanization options.
     * @param {string} aliasName - Logical name (e.g., "FootstepGrass")
     * @param {object} config - Configuration object
     * @param {string[]} config.pool - Array of audio file names
     * @param {number} [config.volumeJitter=0] - Random volume variance +/-%
     * @param {number} [config.pitchJitter=0] - Random pitch variance +/-%
     * @param {number} [config.panJitter=0] - Random pan variance +/-
     * @param {number} [config.cooldown=0] - Minimum ms between plays
     * @param {number} [config.volume=90] - Base volume %
     * @param {number} [config.pitch=100] - Base pitch %
     * @param {number} [config.pan=0] - Base pan
     */
    registerAlias(_aliasName, _config) {
      console.warn("[FugsAudio] registerAlias requires FugsAudio6Aliases");
      return false;
    },
    /**
     * Remove an SFX alias.
     * @param {string} aliasName
     */
    unregisterAlias(_aliasName) {
      console.warn("[FugsAudio] unregisterAlias requires FugsAudio6Aliases");
      return false;
    },
    /**
     * Play an SFX alias with humanization.
     * @param {string} aliasName - The registered alias name
     * @param {string} [type='se'] - Audio type (usually 'se')
     * @param {string} [trackId='1'] - Track ID
     * @returns {boolean} - Whether the sound was played
     */
    playAlias(_aliasName, _type, _trackId) {
      console.warn("[FugsAudio] playAlias requires FugsAudio6Aliases");
      return false;
    },
    /**
     * Get all registered aliases (for debugging).
     */
    listAliases() {
      console.warn("[FugsAudio] listAliases requires FugsAudio6Aliases");
      return false;
    },
    parseProximityConfig(_str) {
      console.warn("[FugsAudio] parseProximityConfig requires FugsAudio3Spatial");
      return false;
    },
    /**
     * Parse alias config from command string.
     * Supports: {pool:[a,b,c], volumeJitter:5, pitchJitter:5}
     */
    parseAliasConfig(_str) {
      console.warn("[FugsAudio] parseAliasConfig requires FugsAudio6Aliases");
      return false;
    },
    executeCommand(commandObject) {
      const { type, trackId, action, switchId, curve: parsedCurve, loop } = commandObject;
      // Guard args to ensure it's always an array
      const args = Array.isArray(commandObject.args) ? commandObject.args : [];

      Logger.info(
        `Executing command: ${type} ${trackId} ${action} ${args.join(" ")} ${switchId || ""}`
      );

      // Phase 2: satellite handlers take precedence
      const _regHandler = this._handlers.get(String(action || "").toLowerCase());
      if (_regHandler) {
        return _regHandler.call(this, commandObject);
      }

      switch (action) {
        case "play":
          // Check for alias: prefix
          if (
            args[0] &&
            typeof args[0] === "string" &&
            args[0].toLowerCase().startsWith("alias:")
          ) {
            const aliasName = args[0].substring(6); // Remove 'alias:' prefix
            return this.tryPlayAlias(aliasName, type, trackId);
          }
          return this.playAudio({
            type,
            trackId,
            name: args[0],
            volume: this.toNum(args[1], 90),
            fadein: this.toNum(args[2], 0),
            pan: this.toNum(args[3], 0),
            pitch: this.toNum(args[4], 100),
            loop,
            persistence: commandObject.persistence || DefaultPersistenceMode,
            pauseMode: commandObject.pauseMode || DefaultPauseMode,
            effect: commandObject.effect,
            startTime: commandObject.startTime || this.toNum(args[5], 0),
          });

        case "stop":
          return this.stopAudio(type, trackId, this.toNum(args[0], 0));

        case "fade":
          return this.fadeAudio(type, trackId, {
            volume: args[0] !== undefined ? this.toNum(args[0]) : undefined,
            duration: this.toNum(args[1], 0),
            pan: args[2] !== undefined ? this.toNum(args[2]) : undefined,
            pitch: args[3] !== undefined ? this.toNum(args[3]) : undefined,
            curve: parsedCurve || args[4] || "smooth",
          });

        case "duck":
          return this.duckVolume(
            type,
            trackId,
            args[0] !== undefined ? this.toNum(args[0], 0.5) : 0.5,
            this.toNum(args[1], 1),
            this.toNum(args[2], 0),
            switchId
          );

        case "duckpump": {
          // duckpump [bpm] [depth] [shape] [tracks]
          // e.g. duckpump 128 0.8 heartbeat bgm
          const bpm = this.toNum(args[0], AUDIO_CONSTANTS.DEFAULT_PUMP_BPM);
          const depth = this.toNum(args[1], AUDIO_CONSTANTS.DEFAULT_PUMP_DEPTH);
          const shape = args[2] || AUDIO_CONSTANTS.DEFAULT_PUMP_SHAPE;
          const tracks = args[3] || "all";

          this.pumpConfig = {
            active: true,
            bpm,
            depth,
            shape,
            tracks,
            startTime: performance.now(),
          };
          Logger.info(`Started rhythmic pump: ${bpm}bpm, ${shape}, depth ${depth} on ${tracks}`);
          return true;
        }

        case "stoppump":
          this.pumpConfig.active = false;
          // Reset all pump nodes immediately
          for (const buffer of this.tracks.values()) {
            if (buffer._pumpGainNode) {
              buffer._pumpGainNode.gain.value = 1.0;
            }
          }
          Logger.info("Stopped rhythmic pump");
          return true;

        case "effect":
          return this.applyEffect(`${type}_${trackId}`, args[0], args.slice(1));

        case "fadeeffect": {
          if (args.length === 0) {
            Logger.warn(`No effect specified for fadeeffect command`);
            return false;
          }
          let fadeEffectParams, fadeInDuration;
          if (args.length === 1) {
            // Just effect name, use default duration
            fadeEffectParams = [];
            fadeInDuration = 2;
          } else {
            // Last argument is duration, everything else is effect params
            fadeEffectParams = args.slice(1, -1);
            fadeInDuration = Number(args[args.length - 1]);
            if (isNaN(fadeInDuration)) {
              // Last arg wasn't a number, treat it as effect param
              fadeEffectParams = args.slice(1);
              fadeInDuration = 2;
            }
          }

          return this.fadeEffect(`${type}_${trackId}`, args[0], fadeEffectParams, fadeInDuration);
        }

        case "fadeouteffect":
          return this.fadeOutEffect(`${type}_${trackId}`, this.toNum(args[0], 2));

        case "cleareffect":
          return this.clearEffect(`${type}_${trackId}`, { keepConfig: false });

        case "crossfade": {
          // Parse arguments for your syntax: crossfade-bgm1 bgm3 Scene2 3 smooth 90
          let toType, toTrackId, name, duration, rest;
          const firstArg = args[0];

          // Check if first arg is a track (bgm3, bgs2, etc.)
          if (firstArg && firstArg.match(/^(bgm|bgs|me|se)\d*$/i)) {
            // crossfade-bgm1 bgm3 Scene2 5 [curve] [volume]
            const match = firstArg.match(/^(bgm|bgs|me|se)(\d*)$/i);
            toType = match[1];
            toTrackId = match[2] || "1";
            name = args[1];
            duration = this.toNum(args[2], 2);
            rest = args.slice(3);
          } else {
            // crossfade-bgm1 Scene2 5 [curve] [volume]
            toType = type;
            toTrackId = String(Number(trackId) + 1);
            name = args[0];
            duration = this.toNum(args[1], 2);
            rest = args.slice(2);
          }

          // Detect if first rest arg is a curve name or a number (volume)
          // Valid curves: linear, exponential, logarithmic, smooth, sharp, gentle, ease-in, ease-out, ease-in-out
          const validCurves = [
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
          let curve, volume;
          if (rest[0] && validCurves.includes(rest[0].toLowerCase())) {
            curve = rest[0].toLowerCase();
            volume = this.toNum(rest[1], 90);
          } else {
            // First arg is a number (volume) or missing
            curve = "smooth";
            volume = this.toNum(rest[0], 90);
          }

          return this.crossFade(
            type,
            trackId,
            toType,
            toTrackId,
            name,
            duration,
            curve,
            volume,
            commandObject.persistence || DefaultPersistenceMode,
            commandObject.pauseMode || DefaultPauseMode
          );
        }

        case "crossfadeeffect":
          // crossfadeeffect-bgm oldEffect newEffect duration [param1] [param2] ...
          return this.crossFadeEffect(
            `${type}_${trackId}`,
            args[0],
            args[1],
            this.toNum(args[2], 3),
            "smooth",
            args.slice(3) // Pass remaining args as new effect params
          );

        case "pause":
          return this.pauseAudio(type, trackId, args);

        case "resume":
          return this.resumeAudio(type, trackId, args);

        case "pansweep":
          // pansweep-[type][track]? minPan maxPan totalDuration loops? curve?
          // min/max pan are -100..100; totalDuration is a full L->R->L cycle in seconds
          return this.startPanSweep(
            type,
            trackId,
            args[0] !== undefined ? this.toNum(args[0], -100) : -100,
            args[1] !== undefined ? this.toNum(args[1], 100) : 100,
            args[2] !== undefined ? this.toNum(args[2], 3) : 3,
            args[3] !== undefined ? this.toNum(args[3], 0) : 0, // 0 = infinite
            parsedCurve || args[4] || "smooth"
          );

        case "stoppansweep":
          return this.stopPanSweep(type, trackId);

        // Global commands
        // Global "all" commands
        case "pauseall":
          return this.pauseAll();

        case "resumeall":
          return this.resumeAll();

        case "stopall":
          if (type === "all") {
            return this.stopAll(this.toNum(args[0], 0));
          } else {
            return this.stopAllOfType(type, this.toNum(args[0], 0));
          }

        case "listall":
          return this.listall("all");

        case "fadeall":
          return this.fadeAllAudio(args);

        case "duckall":
          return this.duckAllAudio(args, switchId);

        case "duckall-sidechain": {
          // Duck everything EXCEPT the specified tracks
          // Syntax: duckall-sidechain bgm1 se2 0.3 1 4
          const exceptTracks = [];
          let sidechainArgsStartIndex = 0;

          // Parse track identifiers until we hit a non-track argument
          for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            // Check if arg looks like a track identifier (bgm1, se2, etc.)
            if (/^(bgm|bgs|me|se)\d*$/i.test(arg)) {
              exceptTracks.push(arg);
            } else {
              // First non-track argument - this is where duck params start
              sidechainArgsStartIndex = i;
              break;
            }
          }

          const sidechainArgs = args.slice(sidechainArgsStartIndex);
          return this.sidechainDuck(exceptTracks, sidechainArgs, switchId);
        }

        case "pitchbendall":
          return this.pitchBendAll(args);

        case "fadeall-bgm":
        case "fadeall-bgs":
        case "fadeall-me":
        case "fadeall-se": {
          const fadeallType = action.split("-")[1]; // Extract bgm/bgs/me/se
          return this.fadeAllOfType(fadeallType, args);
        }

        case "duckall-bgm":
        case "duckall-bgs":
        case "duckall-me":
        case "duckall-se": {
          const duckallType = action.split("-")[1];
          return this.duckAllOfType(duckallType, args, switchId);
        }

        case "pitchbendall-bgm":
        case "pitchbendall-bgs":
        case "pitchbendall-me":
        case "pitchbendall-se": {
          const pitchallType = action.split("-")[1];
          return this.pitchBendAllOfType(pitchallType, args);
        }

        case "listall-bgm":
        case "listall-bgs":
        case "listall-me":
        case "listall-se": {
          const listallType = action.split("-")[1];
          return this.listall(listallType);
        }

        case "chain":
          return this.executeChain(type, trackId, args.join(" "));

        case "proximity":
          // Parse proximity config from args (JSON or key:value format)
          try {
            const configStr = args.join(" ");
            const config = this.parseProximityConfig(configStr);
            this.setupProximitySource(`${type}_${trackId}`, config);
            return true;
          } catch (e) {
            Logger.error(`Failed to parse proximity config: ${e.message}`);
            Logger.error(`Received: ${args.join(" ")}`);
            return false;
          }

        case "saveall":
          this.saveAllStates(args[0] || "auto");
          return true;

        case "loadall":
          return this.loadAllStates(args[0] || "auto") > 0;

        case "registeralias":
          // registeralias AliasName {pool:[file1,file2], volumeJitter:5, ...}
          try {
            const aliasName = args[0];
            const configStr = args.slice(1).join(" ");
            // Parse the config - support both JSON-ish and simple format
            let config;
            if (configStr.startsWith("{")) {
              // Try to parse as relaxed JSON/object notation
              config = this.parseAliasConfig(configStr);
            } else {
              Logger.error("registeralias: config must be wrapped in braces");
              return false;
            }
            return this.registerAlias(aliasName, config);
          } catch (e) {
            Logger.error(`registeralias failed: ${e.message}`);
            return false;
          }

        case "unregisteralias":
          return this.unregisterAlias(args[0]);

        case "listaliases":
          return this.listAliases();

        case "syncplay":
          // syncplay TrackName1 TrackName2 ... [vol1 vol2 ...] or
          // syncplay-bgm TrackName1 TrackName2 ... [vol1 vol2 ...]
          // Volumes are optional, default to 90 for first track, 0 for rest
          return this.syncPlay(type, args);

        case "sidechain":
          // sidechain <sourceId> <targetId> [threshold] [ratio] [attack] [release]
          return this.setupSidechain(args);

        case "stopsidechain":
          // stopsidechain <sourceId> <targetId>
          return this.stopSidechain(args);

        case "pitch":
          // pitch-bgm1 120 [duration] [curve] — shorthand for pitch-only fade
          return this.fadeAudio(type, trackId, {
            pitch: args[0] !== undefined ? this.toNum(args[0]) : undefined,
            duration: this.toNum(args[1], 0),
            curve: parsedCurve || args[2] || "smooth",
          });

        case "pan":
          // pan-bgm1 -50 [duration] [curve] — shorthand for pan-only fade
          return this.fadeAudio(type, trackId, {
            pan: args[0] !== undefined ? this.toNum(args[0]) : undefined,
            duration: this.toNum(args[1], 0),
            curve: parsedCurve || args[2] || "smooth",
          });

        case "doppler":
          // doppler-bgm1 {event:5, maxDistance:10} — proximity with doppler forced on
          try {
            const dopplerConfigStr = args.join(" ");
            const dopplerConfig = this.parseProximityConfig(dopplerConfigStr);
            dopplerConfig.doppler = true;
            this.setupProximitySource(`${type}_${trackId}`, dopplerConfig);
            return true;
          } catch (e) {
            Logger.error(`Failed to parse doppler config: ${e.message}`);
            return false;
          }

        default:
          Logger.warn(`Unknown command action: ${action}`);
          return false;
      }
    },

    /**
     * Schedule auto-cleanup / repeat restart after a non-forever track ends.
     * Shared by playAudio and resumeAudio (fixes B04 one-shot resume cleanup).
     */
    _scheduleTrackEndAction(key, buffer, offsetSeconds = 0) {
      if (!buffer || !key) return;

      const trackTimeout = (timeoutId) => {
        if (!this.activeTimeouts.has(key)) {
          this.activeTimeouts.set(key, []);
        }
        this.activeTimeouts.get(key).push(timeoutId);
      };

      const removeTrackedTimeout = (timeoutId) => {
        if (!this.activeTimeouts.has(key)) return;
        const list = this.activeTimeouts.get(key);
        const index = list.indexOf(timeoutId);
        if (index > -1) list.splice(index, 1);
        if (list.length === 0) this.activeTimeouts.delete(key);
      };

      const schedule = () => {
        if (this.tracks.get(key) !== buffer) return;
        if (buffer._fugsManualStop) return;

        const totalTime = typeof buffer._totalTime === "number" ? buffer._totalTime : 0;
        const pitchNow =
          typeof buffer._pitch === "number" && buffer._pitch > 0 ? buffer._pitch : 1;

        if (totalTime <= 0) {
          const retryId = setTimeout(schedule, 200);
          trackTimeout(retryId);
          return;
        }

        const remaining = Math.max(0, totalTime - (offsetSeconds || 0));
        const delayMs = Math.max(50, (remaining / pitchNow) * 1000 + 60);
        const timeoutId = setTimeout(() => {
          removeTrackedTimeout(timeoutId);
          if (this.tracks.get(key) !== buffer) return;
          if (buffer._fugsManualStop) return;

          if (
            typeof buffer._fugsLoopRepeatsRemaining === "number" &&
            buffer._fugsLoopRepeatsRemaining > 0
          ) {
            buffer._fugsLoopRepeatsRemaining -= 1;
            buffer.play(false, 0);
            if (buffer._effect) {
              this.connectEffectChain(key, buffer);
            }
            this._scheduleTrackEndAction(key, buffer, 0);
            return;
          }

          Logger.info(`Auto-cleanup: ${key} finished playing`);
          this._releaseBuffer(buffer);
          this.tracks.delete(key);
          this.cleanupTrack(key);
        }, delayMs);
        trackTimeout(timeoutId);
      };

      if (
        typeof buffer.isReady === "function" &&
        !buffer.isReady() &&
        typeof buffer.addLoadListener === "function"
      ) {
        buffer.addLoadListener(schedule);
        return;
      }

      schedule();
    },

    playAudio(options) {
      const {
        type,
        trackId,
        name,
        volume = 90,
        fadein = 0,
        pan = 0,
        pitch = 100,
        persistence = DefaultPersistenceMode,
        pauseMode = DefaultPauseMode,
        effect = null,
        loop, // boolean | 'forever' | 'never' | number (repeat count)
        startTime = 0,
      } = options;

      const normalizeLoop = () => {
        // Default behavior when `loop` is omitted:
        // - bgm/bgs loop forever
        // - se/me do not loop
        if (typeof loop === "undefined") {
          if (type === "se" || type === "me") return { mode: "never", repeatCount: 0 };
          return { mode: "forever", repeatCount: 0 };
        }

        if (typeof loop === "boolean") {
          return loop ? { mode: "forever", repeatCount: 0 } : { mode: "never", repeatCount: 0 };
        }

        if (typeof loop === "number") {
          const n = Number.isFinite(loop) ? Math.max(0, Math.floor(loop)) : 0;
          return n > 0 ? { mode: "repeat", repeatCount: n } : { mode: "never", repeatCount: 0 };
        }

        if (typeof loop === "string") {
          const v = loop.trim().toLowerCase();
          if (v === "forever" || v === "true" || v === "loop" || v === "infinite") {
            return { mode: "forever", repeatCount: 0 };
          }
          if (v === "never" || v === "false" || v === "once" || v === "0") {
            return { mode: "never", repeatCount: 0 };
          }

          const n = Number(v);
          if (Number.isFinite(n)) {
            const count = Math.max(0, Math.floor(n));
            return count > 0
              ? { mode: "repeat", repeatCount: count }
              : { mode: "never", repeatCount: 0 };
          }
        }

        return { mode: "never", repeatCount: 0 };
      };

      const loopCfg = normalizeLoop();
      const shouldLoop = loopCfg.mode === "forever";

      const key = `${type}_${trackId}`;

      if (this.tracks.has(key)) {
        this.stopAudio(type, trackId, 0);
      }

      try {
        const buffer = AudioManager.createBuffer(type.toLowerCase(), name);

        if (!buffer) {
          Logger.error(`Failed to create audio buffer for ${name}`);
          return false;
        }

        buffer._name = name;
        buffer._persistence = persistence;
        buffer._pauseMode = pauseMode;
        buffer._effect = effect;
        buffer._originalVolume = volume / 100;
        buffer._fugsManualStop = false;
        buffer._fugsLoopMode = loopCfg.mode; // "forever" | "repeat" | "never"

        this.tracks.set(key, buffer);

        buffer.volume = Math.max(0, Math.min(1, fadein > 0 ? 0 : volume / 100));
        buffer.pan = Math.max(-1, Math.min(1, pan / 100));

        // Manual volume tracking for proximity audio compatibility
        buffer._manualVolume = volume / 100; // Track user-set volume separately

        // Pitch System Initialization
        buffer._basePitch = Math.max(0.1, Math.min(4, pitch / 100));
        buffer._dopplerPitch = 1.0;
        this.updateTrackPitch(buffer);

        // Start playback first to create _sourceNode
        if (startTime > 0) {
          Logger.info(`Playing ${key} from ${startTime}s using play(${shouldLoop}, ${startTime})`);
          buffer.play(shouldLoop, startTime);
        } else {
          buffer.play(shouldLoop);
        }

        // Loop modes:
        // - forever: use WebAudio looping (no end timer)
        // - repeat: play once, then restart on end N times
        // - never: play once
        if (loopCfg.mode === "repeat") {
          buffer._fugsLoopRepeatsRemaining = loopCfg.repeatCount;
          this._scheduleTrackEndAction(key, buffer, startTime);
        } else if (!shouldLoop) {
          this._scheduleTrackEndAction(key, buffer, startTime);
        }

        // Connect effect chain AFTER buffer.play() creates _sourceNode
        if (effect) {
          this.applyEffectIfPresent(key, effect);
          this.connectEffectChain(key, buffer);
        }

        // Apply fade-in only after buffer is ready to prevent fade from executing on unloaded buffer
        const applyFadeIn = () => {
          Logger.info(
            `applyFadeIn callback triggered for ${key} (fadein: ${fadein}, buffer match: ${this.tracks.get(key) === buffer})`
          );

          if (fadein > 0 && this.tracks.get(key) === buffer) {
            this.fadeAudio(type, trackId, { volume, duration: fadein });
          }

          // Initialize proximity volume if configured
          if (this.proximityData.has(key)) {
            this.updateProximityVolume();
          }
        };

        // Wait for buffer to be ready before applying fade-in
        const bufferSupportsReady = typeof buffer.isReady === "function";
        const bufferIsReady = bufferSupportsReady ? buffer.isReady() : true;
        const supportsLoadListener = typeof buffer.addLoadListener === "function";

        Logger.info(
          `Fade-in setup for ${key}: isReady=${bufferIsReady}, supportsReady=${bufferSupportsReady}, supportsListener=${supportsLoadListener}`
        );

        if (bufferSupportsReady && !bufferIsReady && supportsLoadListener) {
          Logger.info(`${key}: Waiting for buffer to load before applying fade-in`);
          buffer.addLoadListener(applyFadeIn);
        } else {
          Logger.info(`${key}: Applying fade-in immediately`);
          applyFadeIn();
        }

        return true;
      } catch (error) {
        Logger.error(`Error playing audio`, {
          type,
          trackId,
          name,
          error: error.message,
        });
        // Clean up on failure - cleanup first while track is still in map, then delete
        this.cleanupTrack(key);
        this.tracks.delete(key);
        return false;
      }
    },

    /**
     * Synchronized playback of multiple stems/tracks.
     * All tracks start at the exact same AudioContext time for sample-accurate sync.
     *
     * Usage: syncplay-bgm Drums Bass Pads Lead 90 0 0 0
     *        (4 track names followed by 4 volumes)
     *
     * The pattern for stem mixing:
     * - Start all stems together, some at 0 volume
     * - Use fade-bgm1/2/3/4 to bring layers in and out
     * - Stems stay in sync because they never stop, just go silent
     *
     * @param {string} type - Audio type (bgm, bgs, etc.)
     * @param {array} args - [name1, name2, ..., vol1, vol2, ...] or just [name1, name2, ...]
     */
    syncPlay(type, args) {
      if (!args || args.length === 0) {
        Logger.error("syncPlay requires at least one track name");
        return false;
      }

      // Parse args: could be "Drums Bass Pads Lead" or "Drums Bass Pads Lead 90 0 0 0"
      // Strategy: find where numbers start (volumes) vs strings (names)
      const names = [];
      const volumes = [];

      for (const arg of args) {
        const num = Number(arg);
        if (!isNaN(num) && names.length > 0) {
          // Once we hit a number after names, rest are volumes
          volumes.push(num);
        } else if (isNaN(num) || names.length === 0) {
          // It's a name (or first arg even if numeric-looking filename)
          names.push(arg);
        } else {
          volumes.push(num);
        }
      }

      if (names.length === 0) {
        Logger.error("syncPlay: No track names provided");
        return false;
      }

      // Default volumes: first track 90, rest 0 (silent but playing)
      while (volumes.length < names.length) {
        volumes.push(volumes.length === 0 ? 90 : 0);
      }

      Logger.info(`syncPlay: Starting ${names.length} synchronized tracks`, {
        names,
        volumes,
        type,
      });

      // Step 1: Create all buffers and store them
      const buffers = [];
      const keys = [];

      for (let i = 0; i < names.length; i++) {
        const trackId = String(i + 1);
        const key = `${type}_${trackId}`;
        const name = names[i];

        // Stop any existing track in this slot
        if (this.tracks.has(key)) {
          this.stopAudio(type, trackId, 0);
        }

        try {
          const buffer = AudioManager.createBuffer(type.toLowerCase(), name);
          if (!buffer) {
            Logger.error(`syncPlay: Failed to create buffer for ${name}`);
            continue;
          }

          buffer._name = name;
          buffer._persistence = DefaultPersistenceMode;
          buffer._pauseMode = DefaultPauseMode;
          buffer._originalVolume = volumes[i] / 100;
          buffer._syncGroup = `sync_${Date.now()}`; // Tag for sync group identification

          buffers.push({ buffer, key, trackId, volume: volumes[i], index: i });
          keys.push(key);
        } catch (error) {
          Logger.error(`syncPlay: Error creating buffer for ${name}:`, error);
        }
      }

      if (buffers.length === 0) {
        Logger.error("syncPlay: No buffers created successfully");
        return false;
      }

      // Step 2: Wait for all buffers to load, then start them together
      // Timeout after 10 seconds to prevent infinite spin
      const maxWaitMs = 10000;
      const startWait = performance.now();

      const checkAllLoaded = () => {
        const allLoaded = buffers.every(({ buffer }) => buffer.isReady());

        if (allLoaded) {
          this.startSyncedBuffers(type, buffers);
        } else if (performance.now() - startWait > maxWaitMs) {
          Logger.error(`syncPlay: Timed out waiting for buffers to load after ${maxWaitMs}ms`);
          // Start whatever is ready
          const readyBuffers = buffers.filter(({ buffer }) => buffer.isReady());
          if (readyBuffers.length > 0) {
            this.startSyncedBuffers(type, readyBuffers);
          }
        } else {
          // Check again next frame
          requestAnimationFrame(checkAllLoaded);
        }
      };

      // Start checking (some may already be cached/loaded)
      checkAllLoaded();

      return true;
    },

    /**
     * Internal: Start all buffers at the exact same AudioContext time
     */
    startSyncedBuffers(type, buffers) {
      if (!WebAudio._context) {
        Logger.error("syncPlay: No WebAudio context available");
        return false;
      }

      // Schedule start slightly in the future to ensure all are ready
      const startTime = WebAudio._context.currentTime + 0.05; // 50ms buffer

      Logger.info(
        `syncPlay: Scheduling ${buffers.length} tracks to start at context time ${startTime.toFixed(3)}`
      );

      for (const { buffer, key, volume } of buffers) {
        // Set initial volume
        buffer.volume = Math.max(0, Math.min(1, volume / 100));
        buffer.pan = 0;

        // Pitch initialization
        buffer._basePitch = 1.0;
        buffer._dopplerPitch = 1.0;
        this.updateTrackPitch(buffer);

        // Store in tracks map
        this.tracks.set(key, buffer);

        // Start with loop enabled, at the scheduled time
        // We need to access the internal WebAudio source node
        try {
          // First call play() to create the source node infrastructure
          buffer.play(true, 0);

          // The buffer is now playing from "now", but we want precise sync
          // For truly sample-accurate sync, we'd need to access _sourceNode.start(when)
          // RPG Maker's buffer.play() doesn't expose this, so this is "close enough"
          // The 50ms scheduling window helps, but it's not perfect

          Logger.success(`syncPlay: Started ${key} (${buffer._name}) at ${volume}% volume`);
        } catch (error) {
          Logger.error(`syncPlay: Failed to start ${key}:`, error);
        }
      }

      // Store sync group info for potential future use (stopping all synced tracks together)
      const syncGroupId =
        buffers.length > 0 && buffers[0] && buffers[0].buffer
          ? buffers[0].buffer._syncGroup
          : undefined;
      if (syncGroupId) {
        Logger.info(`syncPlay: Created sync group ${syncGroupId} with ${buffers.length} tracks`);
      }

      return true;
    },

    /**
     * Setup real sidechain compression using envelope follower
     * @param {Array} args - [sourceId, targetId, threshold, ratio, attack, release]
     */
    setupSidechain(_args) {
      console.warn("[FugsAudio] setupSidechain requires FugsAudio4Dynamics");
      return false;
    },
    _disposeSidechainConnection(_connectionKey, _connection, _options) {
      console.warn("[FugsAudio] _disposeSidechainConnection requires FugsAudio4Dynamics");
      return false;
    },
    /**
     * Stop sidechain compression between two tracks
     * @param {Array} args - [sourceId, targetId]
     */
    stopSidechain(_args) {
      console.warn("[FugsAudio] stopSidechain requires FugsAudio4Dynamics");
      return false;
    },
    stopAudio(type, trackId, fadeout = 0, _saveState = false) {
      const key = `${type}_${trackId}`;
      const buffer = this.tracks.get(key);

      if (!buffer) {
        Logger.warn(`No audio found to stop for ${type}${trackId}`);
        return false;
      }

      // Cancel any pending timeouts for this track immediately (e.g. finite-loop end timers)
      if (this.activeTimeouts.has(key)) {
        const timeoutIds = this.activeTimeouts.get(key);
        timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
        this.activeTimeouts.delete(key);
      }

      if (fadeout > 0) {
        Logger.info(`Stopping ${key} with ${fadeout}s fadeout`);

        // Stop proximity updates immediately so they don't fight the fade
        this.proximityData.delete(key);

        // Start the fadeout
        this.fadeAudio(type, trackId, { volume: 0, duration: fadeout });

        // Schedule buffer stop via setTimeout to ensure it happens even if fade is cancelled
        const timeoutId = setTimeout(() => {
          // Check if this buffer is still the current one (could have been replaced)
          if (this.tracks.get(key) === buffer) {
            // Disconnect pump gain node before stopping
            if (buffer._pumpGainNode) {
              try {
                buffer._pumpGainNode.disconnect();
              } catch (_e) {
                // already disconnected
              }
              buffer._pumpGainNode = null;
            }
            buffer._fugsManualStop = true;
            try {
              buffer.stop();
            } catch (_e) {
              // DOMException if already stopped or context closed
            }
            this._releaseBuffer(buffer);
            this.tracks.delete(key);
            this.cleanupTrack(key);
            Logger.success(`Stop complete for ${key} after ${fadeout}s fadeout`);
          } else {
            Logger.info(`Stop fadeout skipped - ${key} was replaced`);
          }

          // Remove timeout from tracking
          if (this.activeTimeouts.has(key)) {
            const timeouts = this.activeTimeouts.get(key);
            const index = timeouts.indexOf(timeoutId);
            if (index > -1) timeouts.splice(index, 1);
            if (timeouts.length === 0) this.activeTimeouts.delete(key);
          }
        }, fadeout * 1000);

        // Track this timeout for cleanup
        if (!this.activeTimeouts.has(key)) {
          this.activeTimeouts.set(key, []);
        }
        this.activeTimeouts.get(key).push(timeoutId);
      } else {
        // Disconnect pump gain node before stopping
        if (buffer._pumpGainNode) {
          try {
            buffer._pumpGainNode.disconnect();
          } catch (_e) {
            // already disconnected
          }
          buffer._pumpGainNode = null;
        }
        buffer._fugsManualStop = true;
        try {
          buffer.stop();
        } catch (_e) {
          // DOMException if already stopped or context closed
        }
        this._releaseBuffer(buffer);
        this.tracks.delete(key);
        this.cleanupTrack(key);
        Logger.success(`Stop complete for ${key} (instant)`);
      }

      return true;
    },

    fadeAudio(type, trackId, options, onComplete) {
      const { volume, duration = 0, pan, pitch, curve = "smooth" } = options;
      const key = `${type}_${trackId}`;
      const buffer = this.tracks.get(key);

      if (!buffer) {
        Logger.error(`Cannot fade - no audio found for ${type}${trackId}`);
        return false;
      }

      // Cancel active pan sweep if we're fading pan
      if (this.panSweeps && this.panSweeps.has(key) && pan !== undefined) {
        this.stopPanSweep(type, trackId);
      }

      let fadeCount = 0;
      let expectedFades = 0;
      const fadeTypes = [];

      const checkComplete = () => {
        fadeCount++;
        if (fadeCount >= expectedFades) {
          Logger.success(`Fade complete for ${key}: ${fadeTypes.join(", ")}`);
          if (onComplete) onComplete();
        }
      };

      if (volume !== undefined) {
        expectedFades++;
        fadeTypes.push(`volume to ${volume}%`);
        const startVolume = buffer.volume;
        const target = volume / 100;

        Logger.info(
          `Starting fade for ${key}: volume ${Math.round(
            startVolume * 100
          )}% -> ${volume}% over ${duration}s`
        );

        FadeManager.startFade(
          `${key}_volume`,
          startVolume,
          target,
          duration,
          (value) => {
            const buf = this.tracks.get(key);
            if (!buf) return; // Track was stopped/replaced
            buf.volume = Math.max(0, Math.min(1, value));
            buf._manualVolume = buf.volume; // Update manual volume for proximity compatibility
          },
          checkComplete,
          curve
        );
      }

      if (pan !== undefined) {
        expectedFades++;
        fadeTypes.push(`pan to ${pan}`);

        Logger.info(
          `Starting fade for ${key}: pan ${Math.round(
            buffer.pan * 100
          )} -> ${pan} over ${duration}s`
        );

        FadeManager.startFade(
          `${key}_pan`,
          buffer.pan,
          pan / 100,
          duration,
          (value) => {
            const buf = this.tracks.get(key);
            if (!buf) return; // Track was stopped/replaced
            buf.pan = Math.max(-1, Math.min(1, value));
          },
          checkComplete,
          curve
        );
      }

      if (pitch !== undefined) {
        expectedFades++;
        fadeTypes.push(`pitch to ${pitch}%`);

        Logger.info(
          `Starting fade for ${key}: pitch ${Math.round(
            buffer.pitch * 100
          )}% -> ${pitch}% over ${duration}s`
        );

        FadeManager.startFade(
          `${key}_pitch`,
          buffer._basePitch, // Start from base pitch, not combined pitch
          pitch / 100,
          duration,
          (value) => {
            const buf = this.tracks.get(key);
            if (!buf) return; // Track was stopped/replaced
            buf._basePitch = Math.max(0.1, Math.min(4, value));
            this.updateTrackPitch(buf);
          },
          checkComplete,
          curve
        );
      }

      if (expectedFades === 0) {
        Logger.info(`No fade parameters specified for ${key}`);
        if (onComplete) onComplete();
      }

      return true;
    },

    // Global fade functions
    fadeAllAudio(args) {
      const volume = this.toNum(args[0]);
      const duration = this.toNum(args[1], 0);
      const pan = args[2] !== undefined ? this.toNum(args[2]) : undefined;
      const pitch = args[3] !== undefined ? this.toNum(args[3]) : undefined;

      let count = 0;
      let completed = 0;

      for (const [key] of this.tracks.entries()) {
        // Skip paused tracks - they're not actively playing
        if (this.pausedTracks && this.pausedTracks.has(key)) continue;

        if (typeof key !== "string" || key.indexOf("_") === -1) continue;

        const [type, trackId] = key.split("_");
        if (
          this.fadeAudio(type, trackId, { volume, duration, pan, pitch }, () => {
            completed++;
            if (completed === count) {
              Logger.success(`Global fade complete: ${count} tracks faded`);
            }
          })
        ) {
          count++;
        }
      }

      Logger.info(`Starting global fade: ${count} tracks to vol:${volume}% over ${duration}s`);
      return count;
    },

    fadeAllOfType(type, args) {
      const volume = args[0] !== undefined ? this.toNum(args[0]) : undefined;
      const duration = this.toNum(args[1], 0);
      const pan = args[2] !== undefined ? this.toNum(args[2]) : undefined;
      const pitch = args[3] !== undefined ? this.toNum(args[3]) : undefined;
      let count = 0;
      let completed = 0;

      // Collect entries first to avoid potential iterator invalidation
      const entries = Array.from(this.tracks.entries());

      for (const [key] of entries) {
        if (key.startsWith(type)) {
          // B13: skip paused tracks so their stopped buffer isn't modified — the
          // change would be lost on resume (mirrors fadeAllAudio's global skip).
          if (this.pausedTracks && this.pausedTracks.has(key)) continue;

          const trackId = key.split("_")[1];
          if (
            this.fadeAudio(type, trackId, { volume, duration, pan, pitch }, () => {
              completed++;
              if (completed === count) {
                Logger.success(`${type.toUpperCase()} fade complete: ${count} tracks faded`);
              }
            })
          ) {
            count++;
          }
        }
      }

      Logger.info(
        `Starting ${type.toUpperCase()} fade: ${count} tracks to vol:${volume}% over ${duration}s`
      );
      return count;
    },

    duckVolume(_type, _trackId, _duckLevel, _fadeTime, _holdTime, _switchId) {
      console.warn("[FugsAudio] duckVolume requires FugsAudio4Dynamics");
      return false;
    },
    duckAllOfType(_type, _args, _switchId) {
      console.warn("[FugsAudio] duckAllOfType requires FugsAudio4Dynamics");
      return false;
    },
    duckAllAudio(_args, _switchId) {
      console.warn("[FugsAudio] duckAllAudio requires FugsAudio4Dynamics");
      return false;
    },
    sidechainDuck(_exceptTracks, _args, _switchId) {
      console.warn("[FugsAudio] sidechainDuck requires FugsAudio4Dynamics");
      return false;
    },
    pitchBendAll(_args) {
      console.warn("[FugsAudio] pitchBendAll requires FugsAudio4Dynamics");
      return false;
    },
    pitchBendAllOfType(_type, _args) {
      console.warn("[FugsAudio] pitchBendAllOfType requires FugsAudio4Dynamics");
      return false;
    },
    // Pan sweep implementation
    startPanSweep(_type, _trackId, _minPan, _maxPan, _totalDuration, _loops, _curve) {
      console.warn("[FugsAudio] startPanSweep requires FugsAudio3Spatial");
      return false;
    },
    stopPanSweep(_type, _trackId) {
      console.warn("[FugsAudio] stopPanSweep requires FugsAudio3Spatial");
      return false;
    },
    // Pause/resume with parameters

    pauseAudio(type, trackId, args) {
      const key = `${type}_${trackId}`;
      const buffer = this.tracks.get(key);

      if (!buffer) {
        Logger.error(`No audio found to pause for ${type}${trackId}`);
        return false;
      }

      // B03: already paused (or pause-with-fade in progress) — keep snapshot/seek
      if (this.pausedTracks.has(key)) {
        Logger.info(`Track ${key} already paused — keeping saved position`);
        return true;
      }

      // Use RPG Maker's built-in position tracking
      let currentTime = 0;
      if (buffer.seek && typeof buffer.seek === "function") {
        try {
          currentTime = buffer.seek();
          Logger.success(`Got timestamp via buffer.seek(): ${currentTime}s`);
        } catch (e) {
          Logger.warn(`seek() failed: ${e.message}`);
        }
      }

      // Store paused state in a dedicated snapshot for reliable resume
      // This ensures we don't depend on the stopped buffer object
      const pausedSnapshot = {
        name: buffer._name,
        pos: currentTime,
        volume: buffer.volume,
        pan: buffer.pan,
        pitch: buffer._basePitch || buffer.pitch,
        persistence: buffer._persistence,
        pauseMode: buffer._pauseMode,
        effect: buffer._effect,
        originalVolume: buffer._originalVolume,
        dopplerPitch: buffer._dopplerPitch || 1.0,
        loopMode: buffer._fugsLoopMode || null,
        loopRepeatsRemaining: buffer._fugsLoopRepeatsRemaining || 0,
      };
      this.pausedSnapshots.set(key, pausedSnapshot);

      // Also save on buffer for backward compatibility
      buffer._pausedPos = currentTime; // Position in seconds
      buffer._pausedVolume = buffer.volume;
      buffer._pausedPan = buffer.pan;
      buffer._pausedPitch = buffer.pitch;

      Logger.info(`Pausing ${key} at position: ${currentTime}s`);

      // Cancel active effects that shouldn't continue while paused
      // (but preserve effect chains and proximity config for resume)
      FadeManager.cancelFade(`${key}_volume`);
      FadeManager.cancelFade(`${key}_pan`);
      FadeManager.cancelFade(`${key}_pitch`);

      if (this.panSweeps && this.panSweeps.has(key)) {
        this.stopPanSweep(type, trackId);
      }

      // Cancel pending timeouts for this track (end timers, prior pause fades)
      if (this.activeTimeouts.has(key)) {
        const timeoutIds = this.activeTimeouts.get(key);
        timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
        this.activeTimeouts.delete(key);
        Logger.info(`Cancelled ${timeoutIds.length} pending timeout(s) for paused ${key}`);
      }

      // B16: mark paused immediately so resume works during fadeout
      this.pausedTracks.add(key);

      const fadeout = this.toNum(args[0], 0);
      const pan = args[1] !== undefined ? this.toNum(args[1]) : undefined;
      const pitch = args[2] !== undefined ? this.toNum(args[2]) : undefined;

      if (fadeout > 0 || pan !== undefined || pitch !== undefined) {
        // Start the fadeout
        this.fadeAudio(type, trackId, {
          volume: 0,
          duration: fadeout,
          pan: pan,
          pitch: pitch,
        });

        // Schedule buffer stop (track already in pausedTracks)
        const pauseDelay = Math.max(fadeout || 0, 0);
        const timeoutId = setTimeout(() => {
          // Only stop if still paused and buffer hasn't been replaced/resumed
          if (this.tracks.get(key) === buffer && this.pausedTracks.has(key)) {
            try {
              buffer.stop();
            } catch (_e) {
              // DOMException if already stopped or context closed
            }
            Logger.success(`Pause complete for ${key}`);
          } else {
            Logger.info(`Pause stop skipped - ${key} was resumed or replaced`);
          }

          // Remove timeout from tracking
          if (this.activeTimeouts.has(key)) {
            const timeouts = this.activeTimeouts.get(key);
            const index = timeouts.indexOf(timeoutId);
            if (index > -1) timeouts.splice(index, 1);
            if (timeouts.length === 0) this.activeTimeouts.delete(key);
          }
        }, pauseDelay * 1000);

        // Track this timeout for cleanup / resume cancel
        if (!this.activeTimeouts.has(key)) {
          this.activeTimeouts.set(key, []);
        }
        this.activeTimeouts.get(key).push(timeoutId);
      } else {
        try {
          buffer.stop();
        } catch (_e) {
          // DOMException if already stopped or context closed
        }
      }

      return true;
    },

    resumeAudio(type, trackId, args) {
      const key = `${type}_${trackId}`;

      if (!this.pausedTracks.has(key)) {
        Logger.warn(`Track ${key} is not paused`);
        return false;
      }

      // B16: cancel pending pause-stop timeout and in-progress pause fades
      if (this.activeTimeouts.has(key)) {
        const timeoutIds = this.activeTimeouts.get(key);
        timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
        this.activeTimeouts.delete(key);
        Logger.info(`Cancelled ${timeoutIds.length} pending timeout(s) for resume ${key}`);
      }
      FadeManager.cancelFade(`${key}_volume`);
      FadeManager.cancelFade(`${key}_pan`);
      FadeManager.cancelFade(`${key}_pitch`);

      // Get snapshot (preferred) or fall back to buffer
      const snapshot = this.pausedSnapshots.get(key);
      const buffer = this.tracks.get(key);

      if (!snapshot && !buffer) {
        Logger.error(`No snapshot or buffer found for paused track ${key}`);
        return false;
      }

      const savedName = snapshot ? snapshot.name : buffer ? buffer._name : null;
      if (!savedName) {
        Logger.error(`No audio name found for paused track ${key}`);
        return false;
      }

      const volume = args[0] !== undefined ? this.toNum(args[0]) : undefined;
      const fadein = this.toNum(args[1], 0);
      const pan = args[2] !== undefined ? this.toNum(args[2]) : undefined;
      const pitch = args[3] !== undefined ? this.toNum(args[3]) : undefined;

      // Get saved values from snapshot or buffer
      const startPos = snapshot ? snapshot.pos : (buffer ? buffer._pausedPos : 0) || 0;
      const savedVolume = snapshot ? snapshot.volume : buffer ? buffer._pausedVolume : 0.9;
      const savedPan = snapshot ? snapshot.pan : buffer ? buffer._pausedPan : 0;
      const savedPitch = snapshot ? snapshot.pitch : buffer ? buffer._pausedPitch : 1;

      const resumeVolume = volume !== undefined ? volume : savedVolume * 100;
      const resumePan = pan !== undefined ? pan : savedPan * 100;
      const resumePitch = pitch !== undefined ? pitch : savedPitch * 100;

      // Resolve loop mode from snapshot/buffer
      const loopMode = snapshot ? snapshot.loopMode : buffer ? buffer._fugsLoopMode : null;

      // For repeat-mode tracks, delegate to playAudio which owns the
      // end-action timer.  The manual resume path below handles
      // forever/never modes only (WebAudio native loop or one-shot).
      if (loopMode === "repeat") {
        const remaining = snapshot
          ? snapshot.loopRepeatsRemaining
          : buffer
            ? buffer._fugsLoopRepeatsRemaining
            : 0;

        Logger.info(`Resuming repeat-mode ${key} via playAudio (${remaining} repeats left)`);

        // Clean up pause state first
        this.pausedTracks.delete(key);
        this.pausedSnapshots.delete(key);

        const savedPersistence = snapshot
          ? snapshot.persistence
          : buffer
            ? buffer._persistence
            : DefaultPersistenceMode;
        const savedPauseMode = snapshot
          ? snapshot.pauseMode
          : buffer
            ? buffer._pauseMode
            : DefaultPauseMode;
        const savedEffect = snapshot ? snapshot.effect : buffer ? buffer._effect : null;

        return this.playAudio({
          type,
          trackId,
          name: savedName,
          volume: resumeVolume,
          fadein,
          pan: resumePan,
          pitch: resumePitch,
          persistence: savedPersistence,
          pauseMode: savedPauseMode,
          effect: savedEffect,
          startTime: startPos,
          loop: remaining || 0,
        });
      }

      // B16 fast path: pause fade still running — buffer never stopped
      if (buffer && typeof buffer.isPlaying === "function" && buffer.isPlaying()) {
        buffer._manualVolume = Math.max(0, Math.min(1, resumeVolume / 100));
        buffer.pan = Math.max(-1, Math.min(1, resumePan / 100));
        buffer._basePitch = Math.max(0.1, Math.min(4, resumePitch / 100));
        this.updateTrackPitch(buffer);
        if (fadein > 0) {
          buffer.volume = 0;
          this.fadeAudio(type, trackId, { volume: resumeVolume, duration: fadein });
        } else {
          buffer.volume = Math.max(0, Math.min(1, resumeVolume / 100));
        }
        // Pause cancelled end timers — re-arm for one-shots (B04)
        const typeKeyFast = (type || "").toLowerCase();
        const shouldLoopFast =
          loopMode === "forever" ||
          (loopMode == null && typeKeyFast !== "se" && typeKeyFast !== "me");
        if (!shouldLoopFast) {
          let posFast = startPos;
          if (buffer.seek && typeof buffer.seek === "function") {
            try {
              posFast = buffer.seek();
            } catch (_e) {
              /* keep startPos */
            }
          }
          this._scheduleTrackEndAction(key, buffer, posFast);
        }
        this.pausedTracks.delete(key);
        this.pausedSnapshots.delete(key);
        if (this.proximityData.has(key) && typeof this.updateProximityVolume === "function") {
          try {
            this.updateProximityVolume();
          } catch (proxErr) {
            Logger.warn(`Proximity refresh after resume failed for ${key}`, {
              error: proxErr && proxErr.message ? proxErr.message : proxErr,
            });
          }
        }
        Logger.success(`Resumed ${key} (cancelled in-progress pause fade)`);
        return true;
      }

      Logger.info(`Resuming ${key} from position: ${startPos}s using RPG Maker method`);

      try {
        // Dispose any existing effect chain tied to the paused buffer BEFORE we replace the buffer.
        // This avoids leaking WebAudio nodes when resume swaps the buffer object.
        if (this.effectChains && this.effectChains.has(key)) {
          this.clearEffect(key, { keepConfig: true });
        }

        // Create new buffer (we have to because the old one was stopped)
        let newBuffer;
        try {
          newBuffer = AudioManager.createBuffer(type.toLowerCase(), savedName);
        } catch (bufferError) {
          Logger.error(`Exception creating buffer for ${savedName}: ${bufferError.message}`);
          return false;
        }

        if (!newBuffer) {
          Logger.error(`Failed to recreate buffer for ${savedName}`);
          return false;
        }

        // Copy all the properties from snapshot or buffer
        newBuffer._name = savedName;
        newBuffer._persistence = snapshot
          ? snapshot.persistence
          : buffer
            ? buffer._persistence
            : DefaultPersistenceMode;
        newBuffer._pauseMode = snapshot
          ? snapshot.pauseMode
          : buffer
            ? buffer._pauseMode
            : DefaultPauseMode;
        newBuffer._effect = snapshot ? snapshot.effect : buffer ? buffer._effect : null;
        newBuffer._originalVolume = snapshot
          ? snapshot.originalVolume
          : buffer
            ? buffer._originalVolume
            : 0.9;
        newBuffer._pausedPos = startPos;
        newBuffer._pausedVolume = savedVolume;
        newBuffer._pausedPan = savedPan;
        newBuffer._pausedPitch = savedPitch;
        // Restore manual volume tracking so proximity keeps the intended loudness.
        newBuffer._manualVolume = Math.max(0, Math.min(1, resumeVolume / 100));

        // Restore loop mode (forever or never — repeat was handled above)
        const typeKey = (type || "").toLowerCase();
        const shouldLoop =
          loopMode === "forever" || (loopMode == null && typeKey !== "se" && typeKey !== "me");
        newBuffer._fugsLoopMode =
          loopMode || (typeKey === "se" || typeKey === "me" ? "never" : "forever");

        // Replace the buffer
        this.tracks.set(key, newBuffer);

        // Set audio properties
        if (fadein > 0) {
          newBuffer.volume = 0;
        } else {
          newBuffer.volume = Math.max(0, Math.min(1, resumeVolume / 100));
        }
        newBuffer.pan = Math.max(-1, Math.min(1, resumePan / 100));

        // Restore pitch properties
        newBuffer._basePitch = Math.max(0.1, Math.min(4, resumePitch / 100));
        newBuffer._dopplerPitch = snapshot
          ? snapshot.dopplerPitch || 1.0
          : (buffer ? buffer._dopplerPitch : 1.0) || 1.0;
        this.updateTrackPitch(newBuffer);

        // Use RPG Maker's buffer.play(loop, startPosition)
        if (startPos > 0) {
          newBuffer.play(shouldLoop, startPos);
        } else {
          newBuffer.play(shouldLoop);
        }

        // B04: re-arm end cleanup for one-shots (pause cancelled the old timer)
        if (!shouldLoop) {
          this._scheduleTrackEndAction(key, newBuffer, startPos);
        }

        // Apply fade-in if needed
        if (fadein > 0) {
          this.fadeAudio(type, trackId, {
            volume: resumeVolume,
            duration: fadein,
          });
        }

        // Recreate effects if they existed (old chain was for old buffer)
        if (newBuffer._effect) {
          this.applyEffectIfPresent(key, newBuffer._effect);
          if (!this.connectEffectChain(key, newBuffer)) {
            Logger.warn(`Failed to reconnect effect chain for ${key}`);
          }
        }

        this.pausedTracks.delete(key);
        this.pausedSnapshots.delete(key); // Clean up snapshot

        // B15: refresh proximity loudness after buffer swap (never fail resume)
        if (this.proximityData.has(key) && typeof this.updateProximityVolume === "function") {
          try {
            this.updateProximityVolume();
          } catch (proxErr) {
            Logger.warn(`Proximity refresh after resume failed for ${key}`, {
              error: proxErr && proxErr.message ? proxErr.message : proxErr,
            });
          }
        }

        Logger.success(`Successfully resumed ${key} from ${startPos}s!`);
        return true;
      } catch (error) {
        Logger.error(`Error resuming ${key}:`, error);
        // Re-add to paused set on failure so user can retry
        // Keep both in sync to avoid state desync
        this.pausedTracks.add(key);
        // Don't delete pausedSnapshots - keep snapshot for next retry attempt
        return false;
      }
    },

    pauseAll() {
      let count = 0;
      for (const key of this.tracks.keys()) {
        if (typeof key !== "string" || key.indexOf("_") === -1) continue;
        const [type, trackId] = key.split("_");
        if (this.pauseAudio(type, trackId, [])) {
          count++;
        }
      }
      Logger.info(`Paused ${count} tracks`);
      return count;
    },

    resumeAll() {
      let count = 0;
      // Clone the Set to avoid modification during iteration
      // (resumeAudio deletes from pausedTracks)
      const tracksToResume = Array.from(this.pausedTracks);
      for (const key of tracksToResume) {
        if (typeof key !== "string" || key.indexOf("_") === -1) continue;
        const [type, trackId] = key.split("_");
        if (this.resumeAudio(type, trackId, [])) {
          count++;
        }
      }
      Logger.info(`Resumed ${count} tracks`);
      return count;
    },
    connectEffectChain(_key, _buffer) {
      console.warn("[FugsAudio] connectEffectChain requires FugsAudio2Effects");
      return false;
    },
    _disposeEffectChain(_key, _chain, _buffer, _options) {
      console.warn("[FugsAudio] _disposeEffectChain requires FugsAudio2Effects");
      return false;
    },
    _setEffectWetMix(chain, wetMix) {
      if (!chain || !chain.wetGain || !chain.dryGain) return false;
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      const mix = clamp01(typeof wetMix === "number" && isFinite(wetMix) ? wetMix : 0);

      // Equal-power (sqrt) crossfade to avoid loudness dips at mid-mix.
      // mix=0.5 => wet≈0.707, dry≈0.707 (instead of 0.5/0.5 which often sounds quieter)
      chain._wetMix = mix;
      chain.wetGain.gain.value = Math.sqrt(mix);
      chain.dryGain.gain.value = Math.sqrt(1 - mix);
      return true;
    },

    applyEffect(_key, _effectConfig, _params) {
      console.warn("[FugsAudio] applyEffect requires FugsAudio2Effects");
      return false;
    },
    fadeEffect(_key, _effectConfig, _params, _fadeInDuration) {
      console.warn("[FugsAudio] fadeEffect requires FugsAudio2Effects");
      return false;
    },
    fadeOutEffect(_key, _fadeOutDuration) {
      console.warn("[FugsAudio] fadeOutEffect requires FugsAudio2Effects");
      return false;
    },
    crossFadeEffect(_key, _oldEffect, _newEffect, _duration, _curve, _newEffectParams) {
      console.warn("[FugsAudio] crossFadeEffect requires FugsAudio2Effects");
      return false;
    },
    clearEffect(_key, _options) {
      console.warn("[FugsAudio] clearEffect requires FugsAudio2Effects");
      return false;
    },
    // Proximity audio with events and curves
    setupProximitySource(_key, _config) {
      console.warn("[FugsAudio] setupProximitySource requires FugsAudio3Spatial");
      return false;
    },
    updateTrackPitch(buffer) {
      if (!buffer) return;
      // Combine base pitch (from commands/fades) with doppler pitch
      const basePitch = buffer._basePitch || 1.0;
      const dopplerPitch = buffer._dopplerPitch || 1.0;
      const targetPitch = Math.max(0.1, Math.min(4, basePitch * dopplerPitch));

      // Use AudioParam ramp when possible to avoid zipper/buzz artifacts
      if (
        typeof WebAudio !== "undefined" &&
        WebAudio._context &&
        buffer._sourceNode &&
        buffer._sourceNode.playbackRate
      ) {
        const param = buffer._sourceNode.playbackRate;
        const now = WebAudio._context.currentTime;
        try {
          param.cancelScheduledValues(now);
          param.setTargetAtTime(targetPitch, now, 0.02);
        } catch (_e) {
          try {
            param.value = targetPitch;
          } catch (_err) {
            // Dev-only diagnostics (log once per buffer to avoid spam)
            if (!buffer._fugsLoggedPitchError) {
              buffer._fugsLoggedPitchError = true;
              Logger.debug("updateTrackPitch: failed to set playbackRate; continuing", {
                name: buffer._name,
                targetPitch,
              });
            }
          }
        }
        buffer._pitch = targetPitch;
      } else {
        buffer.pitch = targetPitch;
      }
    },

    updateProximityVolume() {
      console.warn("[FugsAudio] updateProximityVolume requires FugsAudio3Spatial");
      return false;
    },
    cleanupTrack(key) {
      // Cancel all active fades for this track
      FadeManager.cancelFade(`${key}_volume`);
      FadeManager.cancelFade(`${key}_pan`);
      FadeManager.cancelFade(`${key}_pitch`);
      FadeManager.cancelFade(`${key}_effectWet`);

      // Cleanup sidechain connections involving this track
      if (key.startsWith("bgm_") && this.sidechainConnections) {
        const trackId = key.substring(4);
        for (const [connKey, conn] of this.sidechainConnections.entries()) {
          const [src, tgt] = connKey.split("_to_");
          if (src === trackId || tgt === trackId) {
            this._disposeSidechainConnection(connKey, conn, { restoreTarget: true });
            Logger.info(`Cleaned up sidechain connection ${connKey} for ${key}`);
          }
        }
      }

      // Cancel any pending timeouts for this track
      if (this.activeTimeouts.has(key)) {
        const timeoutIds = this.activeTimeouts.get(key);
        timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
        this.activeTimeouts.delete(key);
        Logger.info(`Cancelled ${timeoutIds.length} pending timeout(s) for ${key}`);
      }

      // Disconnect and cleanup effect chains (reuse _disposeEffectChain for proper
      // node nullification, buffer clearing, and reference cleanup on older Chromium)
      const effectChain = this.effectChains.get(key);
      if (effectChain) {
        this._disposeEffectChain(key, effectChain, null, { restoreRouting: false });
        this.effectChains.delete(key);
      }

      // Remove from other tracking maps
      if (this.panSweeps) {
        this.panSweeps.delete(key);
      }
      this.proximityData.delete(key);
      this.pausedTracks.delete(key);
      this.pausedSnapshots.delete(key);

      // Clear proximity error tracking for this key
      // Create new Set excluding matching keys to avoid iterator invalidation
      const prefix = `${key}_`;
      const filteredErrors = new Set();
      for (const errorKey of this.proximityErrors) {
        if (!errorKey.startsWith(prefix)) {
          filteredErrors.add(errorKey);
        }
      }
      this.proximityErrors = filteredErrors;
    
      // Satellite cleanup (Effects / Spatial / Dynamics).
      this._runHooks(this._teardownHooks, key);
},

    /**
     * Release heavy WebAudio resources from a buffer object so the decoded
     * PCM AudioBuffer (multi-MB) and the WebAudio nodes can be GC'd
     * immediately instead of waiting for the entire object to be collected.
     * Safe to call multiple times or on already-released buffers.
     */
    // B09: stop a buffer's playback without throwing if it's already stopped or
    // lacks a stop() method (some stub/compat buffers). Used before releasing
    // orphaned tracks so audio actually stops instead of just losing its map ref.
    _stopBufferSafely(buffer) {
      if (!buffer) return;
      try {
        if (typeof buffer.stop === "function") {
          buffer.stop();
        }
      } catch (_e) {
        /* already stopped / not startable — safe to ignore */
      }
    },

    _releaseBuffer(buffer) {
      if (!buffer) return;
      // Null the decoded PCM data (the big memory consumer)
      buffer._buffer = null;
      // Disconnect and null WebAudio nodes
      if (buffer._sourceNode) {
        try {
          buffer._sourceNode.disconnect();
        } catch (_e) {
          /* ok */
        }
        buffer._sourceNode = null;
      }
      if (buffer._gainNode) {
        try {
          buffer._gainNode.disconnect();
        } catch (_e) {
          /* ok */
        }
        buffer._gainNode = null;
      }
      if (buffer._pannerNode) {
        try {
          buffer._pannerNode.disconnect();
        } catch (_e) {
          /* ok */
        }
        buffer._pannerNode = null;
      }
      if (buffer._pumpGainNode) {
        try {
          buffer._pumpGainNode.disconnect();
        } catch (_e) {
          /* ok */
        }
        buffer._pumpGainNode = null;
      }
    },

    // Save/Resume system
    captureTrackState(key, buffer) {
      // Returns state object without storing it.
      // IMPORTANT: If a track is paused, the underlying WebAudio buffer is stopped,
      // and `seek()` may return 0. In that case we must use the paused snapshot.
      const pausedSnapshot = this.pausedSnapshots ? this.pausedSnapshots.get(key) : null;
      const isPaused = (this.pausedTracks && this.pausedTracks.has(key)) || !!pausedSnapshot;

      const safeSeek = () => {
        if (!buffer || typeof buffer.seek !== "function") return 0;
        try {
          return buffer.seek();
        } catch (_e) {
          return 0;
        }
      };

      const currentTime = isPaused
        ? this.toNum(
            pausedSnapshot && pausedSnapshot.pos != null ? pausedSnapshot.pos : buffer._pausedPos,
            0
          )
        : this.toNum(safeSeek(), 0);

      const volume = isPaused
        ? pausedSnapshot && pausedSnapshot.volume != null
          ? pausedSnapshot.volume
          : buffer._pausedVolume != null
            ? buffer._pausedVolume
            : buffer.volume
        : buffer.volume;

      const pan = isPaused
        ? pausedSnapshot && pausedSnapshot.pan != null
          ? pausedSnapshot.pan
          : buffer._pausedPan != null
            ? buffer._pausedPan
            : buffer.pan
        : buffer.pan;

      const pitch = isPaused
        ? pausedSnapshot && pausedSnapshot.pitch != null
          ? pausedSnapshot.pitch
          : buffer._pausedPitch != null
            ? buffer._pausedPitch
            : buffer._basePitch || buffer.pitch
        : buffer._basePitch || buffer.pitch; // Save base pitch, not combined pitch

      const persistence =
        pausedSnapshot && pausedSnapshot.persistence != null
          ? pausedSnapshot.persistence
          : buffer._persistence;
      const pauseMode =
        pausedSnapshot && pausedSnapshot.pauseMode != null
          ? pausedSnapshot.pauseMode
          : buffer._pauseMode;
      const effect =
        pausedSnapshot && pausedSnapshot.effect !== undefined
          ? pausedSnapshot.effect
          : buffer._effect;

      let isPlaying = false;
      if (!isPaused && buffer && typeof buffer.isPlaying === "function") {
        try {
          isPlaying = buffer.isPlaying();
        } catch (_e) {
          isPlaying = false;
        }
      }

      return {
        name: buffer._name,
        volume: volume,
        pan: pan,
        pitch: pitch,
        persistence: persistence,
        pauseMode: pauseMode,
        effect: effect,
        currentTime: currentTime,
        isPlaying: isPlaying,
        isPaused: isPaused,
        loopMode: isPaused
          ? pausedSnapshot && pausedSnapshot.loopMode != null
            ? pausedSnapshot.loopMode
            : buffer._fugsLoopMode || null
          : buffer._fugsLoopMode || null,
        loopRepeatsRemaining: isPaused
          ? pausedSnapshot && pausedSnapshot.loopRepeatsRemaining != null
            ? pausedSnapshot.loopRepeatsRemaining
            : buffer._fugsLoopRepeatsRemaining || 0
          : buffer._fugsLoopRepeatsRemaining || 0,
        // B06: satellite state (proximity, etc.) so save/load doesn't drop it.
        ext: this._runCaptureHooks(key),
      };
    },

    saveAllStates(stateName = "auto") {
      const snapshot = new Map();

      for (const [key, buffer] of this.tracks.entries()) {
        const state = this.captureTrackState(key, buffer);
        snapshot.set(key, state);
        Logger.info(`Captured state for ${key}`, state);
      }

      this.namedSnapshots.set(stateName, snapshot);
      Logger.success(`Saved snapshot '${stateName}' with ${snapshot.size} tracks`);
    },

    loadTrackState(key, state) {
      if (!state) return false;

      const [type, trackId] = key.split("_");

      const options = {
        type,
        trackId,
        name: state.name,
        volume: state.volume * 100,
        fadein: 0,
        pan: state.pan * 100,
        pitch: state.pitch * 100,
        persistence: state.persistence,
        pauseMode: state.pauseMode,
        effect: state.effect,
        startTime: state.currentTime,
        // For repeat mode, pass remaining count as number so normalizeLoop
        // creates the correct {mode:"repeat", repeatCount:N} and schedules
        // the end-action timer. For forever/never, pass the mode string.
        loop:
          state.loopMode === "repeat"
            ? state.loopRepeatsRemaining || 0
            : state.loopMode || undefined,
      };

      if (this.playAudio(options)) {
        // If the track was paused when saved, re-pause after restoring.
        if (state.isPaused) {
          this._restorePausedTrack(key, type, trackId, state);
        }
        // B06: let satellites (proximity/spatial) re-bind their saved state now
        // that the track exists again.
        this._runRestoreHooks(key, state.ext);
        Logger.info(`Restored state for ${key}${state.isPaused ? " (paused)" : ""}`);
        return true;
      }

      return false;
    },

    // B12: load-aware paused restore. playAudio() starts the track (possibly on a
    // cold/undecoded buffer where seek() returns 0), so pausing immediately can
    // both lose the saved position and briefly play audio. Wait for the buffer to
    // be ready before stopping, then overwrite the paused snapshot's position with
    // the authoritative saved value.
    _restorePausedTrack(key, type, trackId, state) {
      const buffer = this.tracks.get(key);
      const savedPos = this.toNum(state.currentTime, 0);

      const finalizePause = () => {
        // Guard: track may have been replaced/stopped during the load wait.
        if (this.tracks.get(key) !== buffer) return;
        this.pauseAudio(type, trackId, [0]); // no fadeout — stop immediately

        // Force the authoritative saved position (seek() on a cold buffer is 0).
        const snap = this.pausedSnapshots.get(key);
        if (snap) snap.pos = savedPos;
        if (buffer) buffer._pausedPos = savedPos;
      };

      const supportsReady = buffer && typeof buffer.isReady === "function";
      const isReady = supportsReady ? buffer.isReady() : true;
      const canWait = buffer && typeof buffer.addLoadListener === "function";

      if (supportsReady && !isReady && canWait) {
        // Defer the stop until the buffer is decoded so the position is correct
        // and no audio plays before we stop it.
        buffer.addLoadListener(finalizePause);
      } else {
        finalizePause();
      }
    },

    loadAllStates(stateName = "auto") {
      const snapshot = this.namedSnapshots.get(stateName);
      if (!snapshot) {
        Logger.warn(`No saved snapshot found: ${stateName}`);
        return false;
      }

      let count = 0;
      for (const [key, state] of snapshot.entries()) {
        if (this.loadTrackState(key, state)) count++;
      }

      // B06: second restore pass after all tracks exist so peer-dependent
      // satellite state (sidechain links) can bind. Hooks are idempotent —
      // proximity re-sets, panSweep restarts via stop+start, sidechain skips
      // if the connection is already active.
      for (const [key, state] of snapshot.entries()) {
        if (this.tracks.has(key)) this._runRestoreHooks(key, state && state.ext);
      }

      // Global satellite state (pump, etc.) restored once tracks are up.
      if (this._savedGlobalMeta) {
        this._runGlobalRestoreHooks(this._savedGlobalMeta);
        this._savedGlobalMeta = null;
      }

      Logger.success(`Restored ${count} tracks from snapshot '${stateName}'`);
      return count;
    },

    // Save/load integration for RPG Maker save files
    getSaveData() {
      // Convert named snapshots Map to plain object for JSON serialization
      const data = {};
      for (const [name, snapshot] of this.namedSnapshots.entries()) {
        const snapshotObj = {};
        for (const [key, state] of snapshot.entries()) {
          snapshotObj[key] = state;
        }
        data[name] = snapshotObj;
      }
      // Reserved key — never a named snapshot. Holds global satellite state.
      const meta = this._runGlobalCaptureHooks();
      if (meta && Object.keys(meta).length > 0) {
        data.__fugsMeta = meta;
      }
      return data;
    },

    applySaveData(data) {
      if (!data) return;

      // Restore snapshots from plain object
      this.namedSnapshots.clear();
      this._savedGlobalMeta = null;
      for (const [name, snapshotObj] of Object.entries(data)) {
        // Reserved global-meta key (pump / future hub-level state)
        if (name === "__fugsMeta") {
          this._savedGlobalMeta = snapshotObj;
          continue;
        }
        const snapshot = new Map();
        for (const [key, state] of Object.entries(snapshotObj)) {
          snapshot.set(key, state);
        }
        this.namedSnapshots.set(name, snapshot);
      }

      Logger.info(`Restored ${this.namedSnapshots.size} audio snapshots from save data`);
    },

    // Command parsing entrypoint (currently classic positional syntax)
    parseCommand(command, args) {
      return this.parseClassicSyntax(command, args);
    },

    parseClassicSyntax(command, args) {
      // Validate inputs
      if (!command || typeof command !== "string") {
        Logger.error("Invalid command provided to parseClassicSyntax", {
          command,
          args,
        });
        return null;
      }

      command = command.toLowerCase();

      if (!Array.isArray(args)) {
        Logger.error("Args is not an array in parseClassicSyntax", {
          command,
          args,
        });
        args = [];
      }

      const switchMatch = args.find((arg) => {
        return typeof arg === "string" && arg.match(/^switch:\d+$/i);
      });

      let switchId = null;
      if (switchMatch) {
        const match = switchMatch.match(/^switch:(\d+)$/i);
        switchId = parseInt(match[1]);

        args = args.filter((arg) => arg !== switchMatch);
      }

      let action, type, trackId;

      // Handle global commands first
      if (command.startsWith("fadeall-")) {
        // "fadeall-" is 8 chars
        const target = command.substring(8);
        action = "fadeall-" + target;
        type = target;
        trackId = "1";
      } else if (command.startsWith("duckall-")) {
        // "duckall-" is 8 chars, but "sidechain" needs special handling
        const target = command.substring(8);
        if (target === "sidechain") {
          action = "duckall-sidechain";
          type = "all"; // Pass validation
        } else {
          action = "duckall-" + target;
          type = target;
        }
        trackId = "1";
      } else if (command.startsWith("pitchbendall-")) {
        // "pitchbendall-" is 13 chars
        const target = command.substring(13);
        action = "pitchbendall-" + target;
        type = target;
        trackId = "1";
      } else if (command.startsWith("listall-")) {
        // "listall-" is 8 chars
        const target = command.substring(8);
        action = "listall-" + target;
        type = target;
        trackId = "1";
      } else {
        // Standard command parsing: action-type[trackId]
        const regex = /^([a-zA-Z]+)-([a-zA-Z]+)(\d*)$/;
        const matches = command.match(regex);

        if (matches) {
          action = matches[1];
          type = matches[2];
          trackId = String(matches[3] || "1");
        } else {
          // Dashless command — treat as global (type "all")
          action = command;
          type = "all";
          trackId = "1";
        }
      }

      // Validate that we got valid values
      if (!action) {
        Logger.warn(`No action parsed from command: ${command}`);
        return null;
      }

      if (!type) {
        Logger.warn(`No type parsed from command: ${command}`);
        return null;
      }

      // Validate audio type for non-global commands
      if (!type.startsWith("all") && !["bgm", "bgs", "me", "se"].includes(type)) {
        Logger.warn(`Invalid audio type: ${type}`);
        return null;
      }

      // Parse persistence and pause modes with safety checks
      let currentArgs = args;
      const { args: argsAfterPersistence, persistence } = this.checkPersistence(currentArgs);
      const { args: argsAfterPauseMode, pauseMode } = this.checkPauseMode(argsAfterPersistence);
      const { args: argsAfterStart, startTime } = this.checkStartTime(argsAfterPauseMode);
      const { args: argsAfterLoop, loop } = this.checkLoop(argsAfterStart);
      const { args: finalArgs, curve } = this.checkCurve(argsAfterLoop);

      const result = {
        action: action,
        type: type,
        trackId: String(trackId),
        args: finalArgs || [], // Ensure args is always an array
        persistence,
        pauseMode,
        loop,
        switchId,
        curve,
        startTime,
      };

      return result;
    },

    consumeParenTag(args, tagName, parseValue, isValid) {
      let value;
      let foundIndex = -1;
      const re = new RegExp(`\\(${tagName}:([^\\)]+)\\)`, "i");

      for (let i = 0; i < args.length; i++) {
        if (typeof args[i] !== "string") continue;
        const match = args[i].match(re);
        if (!match) continue;

        const raw = match[1];
        const parsed = parseValue(raw);
        if (!isValid(parsed)) continue;

        value = parsed;
        foundIndex = i;
        break;
      }

      if (foundIndex !== -1) {
        args = args.filter((_, idx) => idx !== foundIndex);
      }

      return { args, value };
    },
    checkStartTime(args) {
      const parsed = this.consumeParenTag(
        args,
        "start",
        (raw) => Number(raw),
        (n) => typeof n === "number" && !isNaN(n) && n >= 0
      );
      return { args: parsed.args, startTime: parsed.value != null ? parsed.value : 0 };
    },
    checkLoop(args) {
      const parsed = this.consumeParenTag(
        args,
        "loop",
        (raw) => {
          const v = String(raw).trim().toLowerCase();
          if (v === "forever" || v === "true" || v === "loop" || v === "infinite") return "forever";
          if (v === "never" || v === "false" || v === "once" || v === "0") return "never";
          const n = Number(v);
          if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
          return undefined;
        },
        (val) => typeof val === "string" || typeof val === "number"
      );
      return { args: parsed.args, loop: parsed.value };
    },
    checkCurve(args) {
      const allowed = new Set([
        "linear",
        "exponential",
        "logarithmic",
        "smooth",
        "sharp",
        "gentle",
        "ease-in",
        "ease-out",
        "ease-in-out",
      ]);

      const parsed = this.consumeParenTag(
        args,
        "curve",
        (raw) => String(raw).trim().toLowerCase(),
        (val) => allowed.has(val)
      );

      return { args: parsed.args, curve: parsed.value != null ? parsed.value : "smooth" };
    },
    checkPersistence(args) {
      const allowed = new Set(["always", "battle", "scene", "none"]);
      const parsed = this.consumeParenTag(
        args,
        "p",
        (raw) => String(raw).trim().toLowerCase(),
        (val) => allowed.has(val)
      );

      return {
        args: parsed.args,
        persistence: parsed.value != null ? parsed.value : DefaultPersistenceMode,
      };
    },

    checkPauseMode(args) {
      const allowed = new Set(["never", "menu", "battle", "scene"]);
      const parsed = this.consumeParenTag(
        args,
        "pause",
        (raw) => String(raw).trim().toLowerCase(),
        (val) => allowed.has(val)
      );

      return {
        args: parsed.args,
        pauseMode: parsed.value != null ? parsed.value : DefaultPauseMode,
      };
    },

    parseArguments(argsString) {
      const args = [];
      const regex = /"([^"]+)"|'([^']+)'|(\S+)/g;
      let match;
      while ((match = regex.exec(argsString)) !== null) {
        args.push(match[1] || match[2] || match[3]);
      }
      return args;
    },

    // Scene transition handling
    handleSceneTransition(transitionType, fadeoutDuration = SceneFadeoutTime) {
      Logger.info(`Handling ${transitionType} transition with ${fadeoutDuration}s fadeout`);

      // Clear any tracks from previous scenes that might be lingering
      this.cleanupOrphanedTracks();

      // Collect entries first to avoid iterator invalidation
      // (stopAudio deletes from this.tracks when fadeout=0 for ME/SE)
      const entries = Array.from(this.tracks.entries());

      for (const [key, buffer] of entries) {
        const persistenceMode = buffer._persistence || DefaultPersistenceMode;
        const pauseMode = buffer._pauseMode || DefaultPauseMode;

        let shouldStop = false;
        let shouldPause = false;

        switch (persistenceMode) {
          case "always":
            shouldStop = false;
            break;
          case "battle":
            shouldStop = transitionType === "scene";
            break;
          case "scene":
            shouldStop = transitionType === "battle";
            break;
          case "none":
            shouldStop = true;
            break;
        }

        switch (pauseMode) {
          case "never":
            shouldPause = false;
            break;
          case "menu":
            shouldPause = transitionType === "menu";
            break;
          case "battle":
            shouldPause = transitionType === "battle";
            break;
          case "scene":
            shouldPause = transitionType === "scene";
            break;
        }

        Logger.info(
          `Track ${key}: persistence=${persistenceMode}, pauseMode=${pauseMode}, shouldStop=${shouldStop}, shouldPause=${shouldPause}`
        );

        // Pause takes priority over stop - if pause mode says to pause, do that instead
        if (shouldPause) {
          const [type, trackId] = key.split("_");
          this.pauseAudio(type, trackId, [fadeoutDuration]);
        } else if (shouldStop) {
          const [type, trackId] = key.split("_");

          // BGM/BGS fade, ME/SE hard cut
          const effectiveFade = type === "bgm" || type === "bgs" ? fadeoutDuration : 0;

          this.stopAudio(type, trackId, effectiveFade, true);
        }
      }
    },

    cleanupOrphanedTracks() {
      // Remove any tracks that might be from previous scenes or corrupted
      const validTracks = new Map();
      for (const [key, buffer] of this.tracks.entries()) {
        try {
          // Safer check: buffer exists and either has no isPlaying method (assume valid)
          // or isPlaying returns true, or track is paused
          const isPaused = this.pausedTracks.has(key) || this.pausedSnapshots.has(key);
          const isPlayingCheck =
            buffer &&
            (typeof buffer.isPlaying !== "function" || // No method = assume valid
              buffer.isPlaying() ||
              isPaused);

          if (buffer && isPlayingCheck) {
            validTracks.set(key, buffer);
          } else {
            // Track is dead, clean it up.
            // B09: stop + release the buffer before dropping the reference.
            // cleanupTrack() only tears down maps/fades/effects, so without this
            // a still-playing (or spuriously not-playing) buffer would keep its
            // decoded PCM/WebAudio nodes alive until GC — a leak on every scene
            // transition. Order: stop, cleanupTrack (fades/hooks), release nodes.
            this._stopBufferSafely(buffer);
            this.cleanupTrack(key);
            this._releaseBuffer(buffer);
            Logger.info(`Cleaned up orphaned track: ${key}`);
          }
        } catch (_error) {
          // Track is corrupted, remove it
          this._stopBufferSafely(buffer);
          this.cleanupTrack(key);
          this._releaseBuffer(buffer);
          Logger.warn(`Removed corrupted track: ${key}`);
        }
      }
      this.tracks = validTracks;
    },

    // Utility functions for compatibility
    stopAllOfType(type, fadeout = 0) {
      // Collect keys first to avoid iterator invalidation
      // (stopAudio deletes from this.tracks when fadeout=0)
      const keys = Array.from(this.tracks.keys()).filter((key) => key.startsWith(type));
      let count = 0;

      for (const key of keys) {
        Logger.info(`Stopping track: ${key}`);
        const trackId = key.split("_")[1];
        this.stopAudio(type, trackId, fadeout);
        count++;
      }
      Logger.success(`Stopped ${count} ${type.toUpperCase()} tracks`);
      return count;
    },

    stopAll(fadeout = 0) {
      // Collect keys first to avoid iterator invalidation
      // (stopAudio deletes from this.tracks when fadeout=0)
      const keys = Array.from(this.tracks.keys());
      let count = 0;

      for (const key of keys) {
        Logger.info(`Stopping track: ${key}`);
        const [type, trackId] = key.split("_");
        this.stopAudio(type, trackId, fadeout);
        count++;
      }
      Logger.success(`Stopped all ${count} tracks`);
      return count;
    },

    crossFade(
      fromType,
      fromTrackId,
      toType,
      toTrackId,
      name,
      duration = 2,
      curve = "smooth",
      volume = 90,
      persistence = DefaultPersistenceMode,
      pauseMode = DefaultPauseMode
    ) {
      const fromKey = `${fromType}_${fromTrackId}`;
      const toKey = `${toType}_${toTrackId}`;

      Logger.info(
        `Crossfade: ${fromKey} -> ${toKey} (${name}) ${duration}s ${curve} (p:${persistence})`
      );

      // Special case: crossfading a track to itself (same key)
      // Just play the new track with fade-in, no crossfade needed
      if (fromKey === toKey) {
        Logger.info(`Crossfade to self detected, using simple fade-in instead`);
        return this.playAudio({
          type: toType,
          trackId: toTrackId,
          name: name,
          volume: volume,
          fadein: duration,
          pan: 0,
          pitch: 100,
          persistence,
          pauseMode,
        });
      }

      // Get reference to old buffer BEFORE starting new one
      const fromBuffer = this.tracks.get(fromKey);

      // Start new track at 0 volume
      if (
        !this.playAudio({
          type: toType,
          trackId: toTrackId,
          name: name,
          volume: 0,
          fadein: 0,
          pan: 0,
          pitch: 100,
          persistence,
          pauseMode,
          startTime: 0,
        })
      ) {
        return false;
      }

      const toBuffer = this.tracks.get(toKey);

      if (!toBuffer) return false;

      // Set the intended final volume for proximity audio compatibility
      // playAudio set these to 0 for the fade-in, but we need to track the target
      toBuffer._originalVolume = volume / 100;

      // Fade out old track (if it exists)
      if (fromBuffer) {
        // Start the fadeout
        this.fadeAudio(fromType, fromTrackId, {
          volume: 0,
          duration: duration,
          curve: curve,
        });

        // Schedule old buffer stop via setTimeout to ensure it happens even if fade is cancelled
        const timeoutId = setTimeout(() => {
          // Stop old track, but only if it wasn't replaced
          if (this.tracks.get(fromKey) === fromBuffer) {
            this.stopAudio(fromType, fromTrackId, 0);
            Logger.info(`Crossfade stop complete for ${fromKey}`);
          } else {
            Logger.info(`Crossfade stop skipped - ${fromKey} was replaced during fade`);
          }

          // Remove timeout from tracking
          if (this.activeTimeouts.has(fromKey)) {
            const timeouts = this.activeTimeouts.get(fromKey);
            const index = timeouts.indexOf(timeoutId);
            if (index > -1) timeouts.splice(index, 1);
            if (timeouts.length === 0) this.activeTimeouts.delete(fromKey);
          }
        }, duration * 1000);

        // Track this timeout for cleanup
        if (!this.activeTimeouts.has(fromKey)) {
          this.activeTimeouts.set(fromKey, []);
        }
        this.activeTimeouts.get(fromKey).push(timeoutId);
      }

      // Fade in new track - wait for buffer to be ready first
      const startCrossfadeFadeIn = () => {
        if (this.tracks.get(toKey) !== toBuffer) {
          Logger.warn(`Crossfade fade-in cancelled - ${toKey} was replaced during load`);
          return;
        }

        this.fadeAudio(toType, toTrackId, {
          volume: volume,
          duration: duration,
          curve: curve,
        });
      };

      // Wait for buffer to be ready before starting fade-in
      if (
        typeof toBuffer.isReady === "function" &&
        !toBuffer.isReady() &&
        typeof toBuffer.addLoadListener === "function"
      ) {
        Logger.info(`Crossfade: Waiting for ${toKey} to load before starting fade-in`);
        toBuffer.addLoadListener(startCrossfadeFadeIn);
      } else {
        startCrossfadeFadeIn();
      }

      return true;
    },
    executeChain(type, trackId, chainString) {
      if (!chainString) {
        Logger.warn(`No chain commands provided for ${type}${trackId}`);
        return false;
      }

      const key = `${type}_${trackId}`;

      Logger.info(`Starting command chain for ${key}: ${chainString}`);

      // Parse the chain string: "fade 50 2; wait 3; fade 90 2; wait 5; stop 2"
      const commands = chainString.split(";").map((cmd) => cmd.trim());
      let currentDelay = 0;

      // Capture the specific buffer instance to prevent race conditions
      // If the track is replaced (e.g. play-bgm1 called again) before the chain finishes,
      // we want to stop executing the chain on the new track.
      const originalBuffer = this.tracks.get(key);

      commands.forEach((command, _index) => {
        const parts = command.split(" ").map((part) => part.trim());
        const action = parts[0];

        if (action === "wait") {
          const waitTime = Number(parts[1]) || 0;
          currentDelay += waitTime * 1000; // Convert to milliseconds
          Logger.info(`Chain wait: ${waitTime}s (total delay: ${currentDelay}ms)`);
          return;
        }

        // Schedule the command execution
        const timeoutId = setTimeout(() => {
          // Check if track still exists AND is the same instance before executing chain command
          const currentBuffer = this.tracks.get(key);
          if (!currentBuffer || currentBuffer !== originalBuffer) {
            Logger.warn(`Chain command cancelled - track ${key} no longer exists or was replaced`);
            return;
          }

          Logger.info(`Executing chain command: ${action} for ${key}`);

          const commandObj = {
            type,
            trackId,
            action,
            args: parts.slice(1), // Everything after the action
            persistence: "always",
            pauseMode: "never",
            switchId: null,
          };

          this.executeCommand(commandObj);

          // Remove timeout from tracking
          if (this.activeTimeouts.has(key)) {
            const timeouts = this.activeTimeouts.get(key);
            const idx = timeouts.indexOf(timeoutId);
            if (idx > -1) timeouts.splice(idx, 1);
            if (timeouts.length === 0) this.activeTimeouts.delete(key);
          }
        }, currentDelay);

        // Track this timeout for cleanup
        if (!this.activeTimeouts.has(key)) {
          this.activeTimeouts.set(key, []);
        }
        this.activeTimeouts.get(key).push(timeoutId);
      });

      return true;
    },
    // For manual logging
    // Replace your listall method with this debug version:

    listall(type = "all") {
      const trackList = [];

      Logger.info(`Listing tracks for type: ${type}`);

      for (const [key, buffer] of this.tracks.entries()) {
        if (type === "all" || key.startsWith(type)) {
          // Check for active effect
          const effectChain = this.effectChains.get(key);
          let effectInfo = "none";
          if (effectChain) {
            effectInfo = buffer._effect || "custom";
          }

          // Check for proximity config
          const proximityConfig = this.proximityData.get(key);
          let proximityInfo = "none";
          if (proximityConfig) {
            if (proximityConfig.eventId) {
              proximityInfo = `event:${proximityConfig.eventId}`;
            } else if (proximityConfig.followPlayer) {
              proximityInfo = "player";
            } else {
              proximityInfo = `pos:${proximityConfig.x},${proximityConfig.y}`;
            }
          }

          const trackInfo = {
            key,
            name: buffer._name || "Unnamed",
            volume: Math.round(buffer.volume * 100),
            pan: Math.round(buffer.pan * 100),
            pitch: Math.round(buffer.pitch * 100),
            isPlaying: buffer.isPlaying ? buffer.isPlaying() : false,
            isPaused: this.pausedTracks.has(key),
            effect: effectInfo,
            proximity: proximityInfo,
            persistence: buffer._persistence || "default",
          };
          trackList.push(trackInfo);
        }
      }

      Logger.success(`Found ${trackList.length} tracks`);
      console.table(trackList);
      return trackList;
    },

    // For testing in the console - accepts single string like real plugin commands
    // Usage: FugsAudio.testCommand('play-bgm1 Battle1 90')
    //        FugsAudio.testCommand('crossfade-bgm1 bgm2 Battle2 3 smooth 90')
    testCommand(commandString) {
      // Parse the command string like a real plugin command
      const parts = this.parseArguments(commandString);
      if (parts.length === 0) {
        Logger.error("No command provided");
        return false;
      }

      const command = parts[0];
      const args = parts.slice(1);

      const parsed = this.parseCommand(command, args);
      if (parsed) {
        const commandObj = {
          type: parsed.type,
          trackId: parsed.trackId,
          action: parsed.action,
          args: parsed.args,
          persistence: parsed.persistence,
          pauseMode: parsed.pauseMode,
          loop: parsed.loop,
          switchId: parsed.switchId,
          curve: parsed.curve,
          startTime: parsed.startTime,
        };
        return this.executeCommand(commandObj);
      }
    },

    //---------------------------------------------------------------------------------------------------
    // SCRIPT CALL API - Clean functions for event Script calls
    //---------------------------------------------------------------------------------------------------
    // Usage: FugsAudio.play('bgm', 1, 'Theme', { volume: 80, fadein: 2 })
    //        FugsAudio.stop('bgm', 1, 2)
    //        FugsAudio.fade('bgm', 1, { volume: 50, duration: 3 })
    //---------------------------------------------------------------------------------------------------

    /**
     * Play audio on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number (default 1)
     * @param {string} name - Audio filename (without extension)
     * @param {object} options - Optional parameters
     * @param {number} options.volume - Volume 0-100 (default 90)
     * @param {number} options.fadein - Fade-in duration in seconds (default 0)
     * @param {number} options.pan - Pan -100 to 100 (default 0)
     * @param {number} options.pitch - Pitch 10-400 (default 100)
     * @param {boolean|string|number} options.loop - Loop mode:
     *   - true / 'forever'  => loop indefinitely
     *   - false / 'never'   => play once
     *   - N (number)        => repeat N times after the first play (e.g. 1 = play twice)
     * @param {string} options.persistence - 'none', 'scene', 'battle', 'always' (default 'scene')
     * @param {string} options.pauseMode - 'never', 'menu', 'battle', 'scene' (default 'battle')
     * @param {number} options.startTime - Start position in seconds (default 0)
     * @param {string} options.effect - Effect preset to apply
     * @returns {boolean} Success
     */
    play(type, trackId = 1, name, options = {}) {
      const opts = options || {};
      return this.playAudio({
        type,
        trackId: String(trackId),
        name,
        volume: opts.volume != null ? opts.volume : 90,
        fadein: opts.fadein != null ? opts.fadein : 0,
        pan: opts.pan != null ? opts.pan : 0,
        pitch: opts.pitch != null ? opts.pitch : 100,
        loop: typeof opts.loop !== "undefined" ? opts.loop : undefined,
        persistence: opts.persistence != null ? opts.persistence : DefaultPersistenceMode,
        pauseMode: opts.pauseMode != null ? opts.pauseMode : DefaultPauseMode,
        startTime: opts.startTime != null ? opts.startTime : 0,
        effect: typeof opts.effect !== "undefined" ? opts.effect : null,
      });
    },

    /**
     * Stop audio on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number (default 1)
     * @param {number} fadeout - Fadeout duration in seconds (default 0)
     * @returns {boolean} Success
     */
    stop(type, trackId = 1, fadeout = 0) {
      return this.stopAudio(type, String(trackId), fadeout);
    },

    /**
     * Fade audio parameters on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number (default 1)
     * @param {object} options - Fade parameters
     * @param {number} options.volume - Target volume 0-100
     * @param {number} options.duration - Fade duration in seconds (default 1)
     * @param {number} options.pan - Target pan -100 to 100
     * @param {number} options.pitch - Target pitch 10-400
     * @param {string} options.curve - Fade curve (default 'smooth')
     * @param {function} onComplete - Callback when fade completes
     * @returns {boolean} Success
     */
    fade(type, trackId = 1, options = {}, onComplete) {
      const opts = options || {};
      return this.fadeAudio(
        type,
        String(trackId),
        {
          volume: opts.volume,
          duration: opts.duration != null ? opts.duration : 1,
          pan: opts.pan,
          pitch: opts.pitch,
          curve: opts.curve != null ? opts.curve : "smooth",
        },
        onComplete
      );
    },

    /**
     * Crossfade from one track to another.
     * @param {string} fromType - Source track type
     * @param {number|string} fromTrackId - Source track ID
     * @param {string} toType - Destination track type
     * @param {number|string} toTrackId - Destination track ID
     * @param {string} name - New audio filename
     * @param {object} options - Crossfade options
     * @param {number} options.duration - Crossfade duration (default 2)
     * @param {string} options.curve - Fade curve (default 'smooth')
     * @param {number} options.volume - New track volume (default 90)
     * @param {string} options.persistence - Persistence mode
     * @param {string} options.pauseMode - Pause mode
     * @returns {boolean} Success
     */
    crossfade(fromType, fromTrackId, toType, toTrackId, name, options = {}) {
      const opts = options || {};
      return this.crossFade(
        fromType,
        String(fromTrackId),
        toType,
        String(toTrackId),
        name,
        opts.duration != null ? opts.duration : 2,
        opts.curve != null ? opts.curve : "smooth",
        opts.volume != null ? opts.volume : 90,
        opts.persistence != null ? opts.persistence : DefaultPersistenceMode,
        opts.pauseMode != null ? opts.pauseMode : DefaultPauseMode
      );
    },

    /**
     * Duck volume on a specific track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {object} options - Duck options
     * @param {number} options.level - Duck level 0-1 (default 0.5)
     * @param {number} options.fadeTime - Time to reach duck level (default 1)
     * @param {number} options.holdTime - Time to hold before restoring (default 0 = manual)
     * @param {number} options.switchId - Game switch to control ducking
     * @returns {boolean} Success
     */
    duck(_type, _trackId, _options) {
      console.warn("[FugsAudio] duck requires FugsAudio4Dynamics");
      return false;
    },
    /**
     * Duck all tracks or tracks of a specific type.
     * @param {object} options - Duck options
     * @param {number} options.level - Duck level 0-1 (default 0.5)
     * @param {number} options.fadeTime - Time to reach duck level (default 1)
     * @param {number} options.holdTime - Time to hold before restoring (default 0)
     * @param {string} options.type - Type to duck ('all', 'bgm', 'bgs', etc.) (default 'all')
     * @param {number} options.switchId - Game switch to control ducking
     * @returns {boolean} Success
     */
    duckAll(_options) {
      console.warn("[FugsAudio] duckAll requires FugsAudio4Dynamics");
      return false;
    },
    /**
     * Start rhythmic volume pumping.
     * @param {object} options - Pump options
     * @param {number} options.bpm - Beats per minute (default 120)
     * @param {number} options.depth - Pump depth 0-1 (default 0.5)
     * @param {string} options.shape - 'sine', 'square', 'saw', 'heartbeat' (default 'sine')
     * @param {string} options.tracks - 'all', 'bgm', 'bgs', or specific like 'bgm1' (default 'all')
     * @returns {boolean} Success
     */
    startPump(_options) {
      console.warn("[FugsAudio] startPump requires FugsAudio4Dynamics");
      return false;
    },
    /**
     * Stop rhythmic volume pumping.
     * @returns {boolean} Success
     */
    stopPump() {
      console.warn("[FugsAudio] stopPump requires FugsAudio4Dynamics");
      return false;
    },
    /**
     * Set up proximity-based audio for a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {object} options - Proximity options
     * @param {number} options.event - Event ID to track distance from
     * @param {number} options.x - Fixed X position (alternative to event)
     * @param {number} options.y - Fixed Y position (alternative to event)
     * @param {number} options.maxDistance - Maximum audible distance in tiles (default 10)
     * @param {number} options.minVolume - Minimum volume at max distance (default 0)
     * @param {string} options.curve - Distance curve: 'linear', 'exponential', 'logarithmic', 'smooth', 'sharp', 'gentle' (default 'linear')
     * @param {boolean} options.pan - Enable stereo panning based on direction (default false)
     * @param {boolean} options.doppler - Enable doppler effect (default false)
     * @param {number} options.dopplerScale - Doppler intensity (default 1.0)
     * @param {number} options.dopplerSmoothing - Doppler response smoothing 0-0.99 (default 0.8, higher = slower)
     * @param {array} options.points - Custom curve points for 'custom' curve
     * @returns {boolean} Success
     */
    setProximity(_type, _trackId, _options) {
      console.warn("[FugsAudio] setProximity requires FugsAudio3Spatial");
      return false;
    },
    /**
     * Clear proximity settings for a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @returns {boolean} Success
     */
    clearProximity(_type, _trackId) {
      console.warn("[FugsAudio] clearProximity requires FugsAudio3Spatial");
      return false;
    },
    /**
     * Apply an effect preset to a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {string} preset - Effect preset name (e.g., 'underwater', 'cave', 'phone')
     * @param {array} params - Additional effect parameters
     * @returns {boolean} Success
     */
    setEffect(type, trackId = 1, preset, params = []) {
      const key = `${type}_${trackId}`;
      return this.applyEffectIfPresent(key, preset, params);
    },

    /**
     * Fade in an effect on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {string} preset - Effect preset name
     * @param {number} duration - Fade-in duration in seconds (default 2)
     * @param {array} params - Additional effect parameters
     * @returns {boolean} Success
     */
    fadeInEffect(type, trackId = 1, preset, duration = 2, params = []) {
      const key = `${type}_${trackId}`;
      return this.fadeEffect(key, preset, params, duration);
    },

    /**
     * Fade out the current effect on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {number} duration - Fade-out duration in seconds (default 2)
     * @returns {boolean} Success
     */
    fadeOutEffectOnTrack(type, trackId = 1, duration = 2) {
      const key = `${type}_${trackId}`;
      return this.fadeOutEffect(key, duration);
    },

    /**
     * Crossfade between effects on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {string} fromPreset - Current effect preset
     * @param {string} toPreset - Target effect preset
     * @param {number} duration - Crossfade duration in seconds (default 3)
     * @param {array} params - Parameters for new effect
     * @returns {boolean} Success
     */
    crossfadeEffects(type, trackId = 1, fromPreset, toPreset, duration = 3, params = []) {
      const key = `${type}_${trackId}`;
      return this.crossFadeEffect(key, fromPreset, toPreset, duration, "smooth", params);
    },

    /**
     * Clear all effects from a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @returns {boolean} Success
     */
    removeEffect(type, trackId = 1) {
      const key = `${type}_${trackId}`;
      return this.clearEffect(key, { keepConfig: false });
    },

    /**
     * Play multiple tracks in sync (for stem mixing).
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {array} names - Array of audio filenames
     * @param {array} volumes - Array of volumes (default: first at 90, rest at 0)
     * @returns {boolean} Success
     */
    sync(type, names, volumes = []) {
      const args = [...names, ...volumes];
      return this.syncPlay(type, args);
    },

    /**
     * Execute a chain of commands with timing.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {string} chainString - Chain commands separated by semicolons
     *                               e.g., "fade 50 2; wait 3; fade 90 2; stop 2"
     * @returns {boolean} Success
     */
    chain(type, trackId = 1, chainString) {
      return this.executeChain(type, String(trackId), chainString);
    },

    /**
     * Pause a specific track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {object} options - Pause options
     * @param {number} options.fadeout - Fadeout before pause (default 0)
     * @returns {boolean} Success
     */
    pause(type, trackId = 1, options = {}) {
      const opts = options || {};
      return this.pauseAudio(type, String(trackId), [opts.fadeout != null ? opts.fadeout : 0]);
    },

    /**
     * Resume a specific track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {object} options - Resume options
     * @param {number} options.volume - Resume volume
     * @param {number} options.fadein - Fade-in duration (default 0)
     * @returns {boolean} Success
     */
    resume(type, trackId = 1, options = {}) {
      const opts = options || {};
      return this.resumeAudio(type, String(trackId), [
        opts.volume,
        opts.fadein != null ? opts.fadein : 0,
      ]);
    },

    /**
     * Start a pan sweep on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {object} options - Pan sweep options
     * @param {number} options.minPan - Minimum pan -100 to 100 (default -100)
     * @param {number} options.maxPan - Maximum pan -100 to 100 (default 100)
     * @param {number} options.duration - Full sweep cycle duration in seconds (default 3)
     * @param {number} options.loops - Number of loops, 0 for infinite (default 0)
     * @param {string} options.curve - Sweep curve (default 'smooth')
     * @returns {boolean} Success
     */
    sweepPan(_type, _trackId, _options) {
      console.warn("[FugsAudio] sweepPan requires FugsAudio3Spatial");
      return false;
    },
    /**
     * Stop pan sweep on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @returns {boolean} Success
     */
    stopSweepPan(_type, _trackId) {
      console.warn("[FugsAudio] stopSweepPan requires FugsAudio3Spatial");
      return false;
    },
    /**
     * Save current audio state.
     * @param {string} name - Snapshot name (default 'auto')
     * @returns {boolean} Success
     */
    save(name = "auto") {
      this.saveAllStates(name);
      return true;
    },

    /**
     * Load a saved audio state.
     * @param {string} name - Snapshot name (default 'auto')
     * @returns {number} Number of tracks restored
     */
    load(name = "auto") {
      return this.loadAllStates(name);
    },

    /**
     * List all active tracks (for debugging).
     * @param {string} type - Filter by type, or 'all' (default 'all')
     * @returns {array} Track info objects
     */
    list(type = "all") {
      return this.listall(type);
    },
  };

  // Initialize the system
  FugsMultiTrackAudioEX.init();

  // Expose internal systems for debugging
  // Expose the system globally
  window.FugsAudio = FugsMultiTrackAudioEX;
  window.FugsMultiTrackAudioEX = FugsMultiTrackAudioEX;
  window.FadeManager = FadeManager;
  // Soft DistanceCurves until FugsAudio3Spatial loads; AudioEffects from FugsAudio2Effects
  window.DistanceCurves = DistanceCurves;
  FugsMultiTrackAudioEX.Logger = Logger;
  FugsMultiTrackAudioEX.AUDIO_CONSTANTS = AUDIO_CONSTANTS;
  FugsMultiTrackAudioEX.FadeManager = FadeManager;
  // SwitchManager / SwitchBuffer exported by FugsAudio5Switch when loaded
  FugsMultiTrackAudioEX.SwitchManager = null;
  FugsMultiTrackAudioEX.SwitchBuffer = null;
  FugsMultiTrackAudioEX.DistanceCurves = DistanceCurves;

  // Scene Hooks - Only hook once to prevent duplicate handlers on plugin reload
  if (window._fugsAudioHooked) {
    Logger.warn(
      "FugsMultiTrackAudioEX already hooked - skipping scene hooks to prevent duplicates"
    );
  } else {
    window._fugsAudioHooked = true;

    // Scene Hooks
    const _Scene_Title_start = Scene_Title.prototype.start;
    Scene_Title.prototype.start = function () {
      _Scene_Title_start.call(this);
      FugsMultiTrackAudioEX.stopAll(SceneFadeoutTime);
    };

    const _DataManager_loadGame = DataManager.loadGame;
    DataManager.loadGame = function (savefileId) {
      const result = _DataManager_loadGame.call(this, savefileId);
      if (result) {
        FugsMultiTrackAudioEX.handleSceneTransition("scene", SceneFadeoutTime);
        // Use fallback delay for load game (scene may not be fully initialized yet)
        setTimeout(() => {
          FugsMultiTrackAudioEX.loadAllStates("auto");
        }, sceneTransitionDelayMS);
      }
      return result;
    };

    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function () {
      _DataManager_setupNewGame.call(this);
      FugsMultiTrackAudioEX.handleSceneTransition("scene", SceneFadeoutTime);
    };

    const _Scene_Map_create = Scene_Map.prototype.create;
    Scene_Map.prototype.create = function () {
      _Scene_Map_create.call(this);
      // Clear proximity errors and debug dedup when entering a new map
      FugsMultiTrackAudioEX.proximityErrors.clear();
      Logger._debugOnce.clear();
      // Reset position trackers to force proximity update on first frame
      FugsMultiTrackAudioEX.lastPlayerX = null;
      FugsMultiTrackAudioEX.lastPlayerY = null;
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
      _Scene_Map_update.call(this);
      // Satellites register proximity/pump via onUpdate (Phase 2+).
      if (typeof FugsMultiTrackAudioEX.runUpdateHooks === "function") {
        FugsMultiTrackAudioEX.runUpdateHooks();
      }
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
      _Scene_Map_terminate.call(this);
      if (SceneManager.isNextScene(Scene_Battle)) {
        FugsMultiTrackAudioEX.handleSceneTransition("battle", SceneFadeoutTime);
      } else if (SceneManager.isNextScene(Scene_Map)) {
        FugsMultiTrackAudioEX.handleSceneTransition("scene", SceneFadeoutTime);
      }
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function () {
      _Scene_Battle_terminate.call(this);
      if (SceneManager.isNextScene(Scene_Map)) {
        // Mirror menu terminate: resume tracks that auto-paused for battle
        // (handleSceneTransition does not resume pausedTracks).
        const battlePausedTracks = Array.from(FugsMultiTrackAudioEX.pausedTracks).filter(
          (key) => {
            const buffer = FugsMultiTrackAudioEX.tracks.get(key);
            return buffer && buffer._pauseMode === "battle";
          }
        );
        battlePausedTracks.forEach((key) => {
          const [type, trackId] = key.split("_");
          FugsMultiTrackAudioEX.resumeAudio(type, trackId, []);
          Logger.info(`Resumed ${key} after battle exit`);
        });
        FugsMultiTrackAudioEX.handleSceneTransition("scene", SceneFadeoutTime);
      }
    };

    const _Scene_Menu_start = Scene_Menu.prototype.start;
    Scene_Menu.prototype.start = function () {
      _Scene_Menu_start.call(this);
      for (const [key, buffer] of FugsMultiTrackAudioEX.tracks.entries()) {
        if (buffer._pauseMode === "menu" && !FugsMultiTrackAudioEX.pausedTracks.has(key)) {
          const [type, trackId] = key.split("_");
          FugsMultiTrackAudioEX.pauseAudio(type, trackId, []);
        }
      }
    };

    const _Scene_Menu_terminate = Scene_Menu.prototype.terminate;
    Scene_Menu.prototype.terminate = function () {
      _Scene_Menu_terminate.call(this);
      // Collect keys FIRST into array to avoid iterator invalidation
      // (resumeAudio modifies pausedTracks Set during iteration)
      const menuPausedTracks = Array.from(FugsMultiTrackAudioEX.pausedTracks).filter((key) => {
        const buffer = FugsMultiTrackAudioEX.tracks.get(key);
        return buffer && buffer._pauseMode === "menu";
      });

      menuPausedTracks.forEach((key) => {
        const [type, trackId] = key.split("_");
        FugsMultiTrackAudioEX.resumeAudio(type, trackId, []);
        Logger.info(`Resumed ${key} after menu exit`);
      });
    };

    // Note: Proximity audio update is handled in Scene_Map.prototype.update
    // to avoid duplicate calls per frame

    // DataManager hooks for save/load integration
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function () {
      const contents = _DataManager_makeSaveContents.call(this);

      // Auto-save current state as "auto" before saving
      FugsMultiTrackAudioEX.saveAllStates("auto");

      // Store audio snapshots in save file
      contents.fugsAudio = FugsMultiTrackAudioEX.getSaveData();
      Logger.info("Saved audio state to save file");

      return contents;
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
      _DataManager_extractSaveContents.call(this, contents);

      // Restore audio snapshots from save file
      if (contents.fugsAudio) {
        FugsMultiTrackAudioEX.applySaveData(contents.fugsAudio);
        Logger.success("Loaded audio state from save file");
      }
    };

    // Plugin Command Handler
    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function (command, args) {
      _Game_Interpreter_pluginCommand.call(this, command, args);

      // For FugsMultiTrackAudioEX commands, re-parse from raw params to handle quotes
      if (this._params && this._params[0]) {
        const rawCommand = this._params[0];
        const allParts = FugsMultiTrackAudioEX.parseArguments(rawCommand);
        if (allParts.length > 0) {
          const cmdName = allParts[0].toLowerCase();
          // Re-parse dashed Fugs commands for proper quote handling (registry-aware)
          if (FugsMultiTrackAudioEX.isKnownPluginCommand(cmdName)) {
            command = allParts[0];
            args = allParts.slice(1);
          }
        }
      }

      const parsed = FugsMultiTrackAudioEX.parseCommand(command, args);
      if (!parsed) return;

      const commandObj = {
        type: parsed.type,
        trackId: parsed.trackId,
        action: parsed.action,
        args: parsed.args,
        loop: parsed.loop,
        effect: parsed.effect,
        persistence: parsed.persistence,
        pauseMode: parsed.pauseMode,
        switchId: parsed.switchId,
        curve: parsed.curve,
        startTime: parsed.startTime,
      };

      if (parsed.switchId) {
        // Switch plugin (or Core SwitchBuffer) via onSwitchGatedCommand
        const handlers = FugsMultiTrackAudioEX._switchGatedHandlers || [];
        let handled = false;
        for (let i = 0; i < handlers.length; i++) {
          try {
            if (handlers[i].call(FugsMultiTrackAudioEX, parsed.switchId, commandObj)) {
              handled = true;
              break;
            }
          } catch (e) {
            Logger.error("onSwitchGatedCommand failed", {
              error: e && e.message ? e.message : e,
            });
          }
        }
        if (!handled) {
          Logger.warn(
            "switch:" +
              parsed.switchId +
              " present but no switch handler — executing immediately"
          );
          FugsMultiTrackAudioEX.executeCommand(commandObj);
        }
        return;
      }
      FugsMultiTrackAudioEX.executeCommand(commandObj);
    };

    // TestRunner extracted to FugsAudio8Test.js (Phase 1)
  } // end _fugsAudioHooked else

  // OcRam patch extracted to FugsAudio7Compat.js (Phase 5)
})();


/* ---- FugsAudio2Effects.js ---- */

(() => {
  const TAG = "[FugsAudio2Effects]";

  if (!window.FugsAudio) {
    console.error(
      TAG +
        " FugsMultiTrackAudioEX (or FugsAudio1Core) must be ON and ABOVE this plugin in Plugin Manager."
    );
    return;
  }

  const hub = window.FugsAudio;
  const Logger =
    hub.Logger || {
      info: (...a) => console.log("[FugsAudio]", ...a),
      warn: (...a) => console.warn("[FugsAudio]", ...a),
      error: (...a) => console.error("[FugsAudio]", ...a),
      success: (...a) => console.log("[FugsAudio]", ...a),
      effect: (...a) => console.log("[FugsAudio:effect]", ...a),
      debug: () => {},
      debugOnce: () => {},
      switch: () => {},
    };
  const FadeManager = hub.FadeManager || window.FadeManager;
  if (!FadeManager) {
    console.error(TAG + " FadeManager missing on FugsAudio — aborting Effects load.");
    return;
  }
  const AUDIO_CONSTANTS = hub.AUDIO_CONSTANTS;
  if (!AUDIO_CONSTANTS) {
    console.error(TAG + " AUDIO_CONSTANTS missing on FugsAudio — aborting Effects load.");
    return;
  }

  // Audio Effects System with immutable presets
  // IMPORTANT: This system relies on RPG Maker MV's internal WebAudio implementation
  // Specifically: WebAudio._context, buffer._sourceNode, buffer._gainNode
  // These are private APIs and may break if modified by other plugins
  const AudioEffects = {
    context: null,
    curveCache: {},
    curveCacheOrder: [], // Track insertion order for LRU eviction
    CURVE_CACHE_MAX_SIZE: AUDIO_CONSTANTS.CURVE_CACHE_MAX_SIZE, // Limit cache to prevent memory leaks
    reverbCache: {},
    reverbCacheOrder: [], // LRU order for reverb buffer eviction
    REVERB_CACHE_MAX_SIZE: AUDIO_CONSTANTS.REVERB_CACHE_MAX_SIZE,

    init() {
      if (WebAudio._context) {
        this.context = WebAudio._context;
        Logger.success("Audio Effects System initialized");
      } else {
        Logger.error("Failed to initialize Audio Effects System: No WebAudio context found");
      }
    },

    toNum(val, def) {
      // Treat undefined/null/empty-string/whitespace as missing -> fallback
      if (val === undefined || val === null) return def;
      if (typeof val === "string" && val.trim() === "") return def;
      const num = Number(val);
      // Use Number.isNaN (not global isNaN) for proper type checking
      return Number.isNaN(num) || !Number.isFinite(num) ? def : num;
    },

    // Validate buffer has required WebAudio internals for effect processing
    validateBuffer(buffer, _key) {
      if (!buffer) {
        return { valid: false, reason: "Buffer is null/undefined" };
      }
      if (!buffer._sourceNode) {
        return { valid: false, reason: "Missing _sourceNode (WebAudio internal)" };
      }
      if (!buffer._gainNode) {
        return { valid: false, reason: "Missing _gainNode (WebAudio internal)" };
      }
      if (!buffer._sourceNode.context) {
        return { valid: false, reason: "SourceNode has no AudioContext" };
      }
      if (buffer._sourceNode.context.state === "closed") {
        return { valid: false, reason: "AudioContext is closed" };
      }
      return { valid: true };
    },

    createReverbBuffer(
      duration = AUDIO_CONSTANTS.DEFAULT_REVERB_DURATION,
      decay = AUDIO_CONSTANTS.DEFAULT_REVERB_DECAY
    ) {
      if (!this.context) return null;

      // Cache reverb buffers keyed on duration+decay to avoid repeated large allocations
      const cacheKey = `${duration.toFixed(2)}_${decay.toFixed(3)}`;
      if (this.reverbCache[cacheKey]) return this.reverbCache[cacheKey];

      const sampleRate = this.context.sampleRate;
      const length = sampleRate * duration;
      const buffer = this.context.createBuffer(2, length, sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
      }

      // LRU eviction for reverb cache
      while (this.reverbCacheOrder.length >= this.REVERB_CACHE_MAX_SIZE) {
        const oldestKey = this.reverbCacheOrder.shift();
        delete this.reverbCache[oldestKey];
      }
      this.reverbCache[cacheKey] = buffer;
      this.reverbCacheOrder.push(cacheKey);

      return buffer;
    },

    createEffectChain(effects) {
      if (!this.context) return null;

      // Wrap entire chain construction in try/catch — the many .connect() and
      // .start() calls can throw DOMException if the AudioContext is closed,
      // suspended, or has exhausted its node budget (common on Chromium 65).
      try {
        const chain = {
          input: this.context.createGain(),
          output: this.context.createGain(),
          nodes: [],
          oscillators: [], // Track LFOs for cleanup
          wetGain: this.context.createGain(),
          dryGain: this.context.createGain(),
        };

        // Set initial wet/dry mix
        chain.wetGain.gain.value = 0;
        chain.dryGain.gain.value = 1;

        let currentNode = chain.input;

        effects.forEach((effect) => {
          let node;

          switch (effect.type) {
            case "reverb":
              node = this.context.createConvolver();
              node.buffer = this.createReverbBuffer(
                effect.duration || AUDIO_CONSTANTS.DEFAULT_REVERB_DURATION,
                effect.decay || AUDIO_CONSTANTS.DEFAULT_REVERB_DECAY
              );
              break;

            case "lowpass":
              node = this.context.createBiquadFilter();
              node.type = "lowpass";
              node.frequency.value = effect.frequency || AUDIO_CONSTANTS.DEFAULT_LOWPASS_FREQ;
              node.Q.value = effect.resonance || AUDIO_CONSTANTS.DEFAULT_RESONANCE;
              break;

            case "highpass":
              node = this.context.createBiquadFilter();
              node.type = "highpass";
              node.frequency.value = effect.frequency || AUDIO_CONSTANTS.DEFAULT_HIGHPASS_FREQ;
              node.Q.value = effect.resonance || AUDIO_CONSTANTS.DEFAULT_RESONANCE;
              break;

            case "bandpass":
              node = this.context.createBiquadFilter();
              node.type = "bandpass";
              node.frequency.value = effect.frequency || AUDIO_CONSTANTS.DEFAULT_BANDPASS_FREQ;
              node.Q.value = effect.resonance || AUDIO_CONSTANTS.DEFAULT_RESONANCE;
              break;

            case "distortion":
              node = this.context.createWaveShaper();
              node.curve = this.createDistortionCurve(
                effect.amount || AUDIO_CONSTANTS.DEFAULT_DISTORTION_AMOUNT
              );
              node.oversample = "4x";
              break;

            case "overdrive":
              // Simple gain boost + waveshaper for "rage mode"
              {
                const drive =
                  effect.drive || effect.amount || AUDIO_CONSTANTS.OVERDRIVE_DRIVE_DEFAULT;
                const output = effect.output || AUDIO_CONSTANTS.OVERDRIVE_OUTPUT_DEFAULT;
                const preGain = this.context.createGain();
                preGain.gain.value = Math.max(
                  AUDIO_CONSTANTS.OVERDRIVE_DRIVE_MIN,
                  drive / AUDIO_CONSTANTS.OVERDRIVE_DRIVE_SCALE
                );

                const shaper = this.context.createWaveShaper();
                shaper.curve = this.createDistortionCurve(drive);
                shaper.oversample = "4x";

                const postGain = this.context.createGain();
                postGain.gain.value = output;

                currentNode.connect(preGain);
                preGain.connect(shaper);
                shaper.connect(postGain);
                currentNode = postGain;
                node = null;
                chain.nodes.push(preGain, shaper, postGain);
              }
              break;

            case "bitcrusher":
              node = this.context.createWaveShaper();
              node.curve = this.createBitcrusherCurve(
                effect.bits || AUDIO_CONSTANTS.DEFAULT_BITCRUSHER_BITS,
                effect.normfreq || AUDIO_CONSTANTS.DEFAULT_BITCRUSHER_NORMFREQ
              );
              node.oversample = "none"; // Don't oversample for lo-fi effect
              break;

            case "compressor":
              node = this.context.createDynamicsCompressor();
              node.threshold.value =
                effect.threshold !== undefined
                  ? effect.threshold
                  : AUDIO_CONSTANTS.DEFAULT_COMPRESSOR_THRESHOLD;
              node.knee.value =
                effect.knee !== undefined ? effect.knee : AUDIO_CONSTANTS.DEFAULT_COMPRESSOR_KNEE;
              node.ratio.value =
                effect.ratio !== undefined
                  ? effect.ratio
                  : AUDIO_CONSTANTS.DEFAULT_COMPRESSOR_RATIO;
              node.attack.value =
                effect.attack !== undefined
                  ? effect.attack
                  : AUDIO_CONSTANTS.DEFAULT_COMPRESSOR_ATTACK;
              node.release.value =
                effect.release !== undefined
                  ? effect.release
                  : AUDIO_CONSTANTS.DEFAULT_COMPRESSOR_RELEASE;
              break;

            case "delay": {
              node = this.context.createDelay(effect.maxDelay || AUDIO_CONSTANTS.DEFAULT_DELAY_MAX);
              node.delayTime.value = effect.delay || AUDIO_CONSTANTS.DEFAULT_DELAY_TIME;
              const delayFeedback = this.context.createGain();
              delayFeedback.gain.value = effect.feedback || AUDIO_CONSTANTS.DEFAULT_FEEDBACK;
              const delayWet = this.context.createGain();
              // Use 1.0 here - let global wetGain control the overall wet/dry mix
              // This avoids double-attenuation (per-effect wet * global wet)
              delayWet.gain.value = 1.0;
              // Feed audio into the delay
              currentNode.connect(node);
              // Set up feedback loop
              node.connect(delayFeedback);
              delayFeedback.connect(node);
              // Connect to wet path
              node.connect(delayWet);
              delayWet.connect(chain.wetGain);
              // Track all nodes for cleanup
              chain.nodes.push(node, delayFeedback, delayWet);
              node = null; // Parallel send - don't advance currentNode
              break;
            }

            case "multitap":
              // Multiple parallel delays with optional feedback and pan
              {
                const taps =
                  Array.isArray(effect.taps) && effect.taps.length > 0
                    ? effect.taps
                    : [
                        {
                          delay: this.toNum(effect.tap1, AUDIO_CONSTANTS.MULTITAP_DEFAULT_DELAY_1),
                          feedback: this.toNum(
                            effect.tap2,
                            AUDIO_CONSTANTS.MULTITAP_DEFAULT_FEEDBACK_1
                          ),
                          pan: AUDIO_CONSTANTS.MULTITAP_DEFAULT_PAN_1,
                        },
                        {
                          delay: this.toNum(effect.tap3, AUDIO_CONSTANTS.MULTITAP_DEFAULT_DELAY_2),
                          feedback: this.toNum(
                            effect.tap4,
                            AUDIO_CONSTANTS.MULTITAP_DEFAULT_FEEDBACK_2
                          ),
                          pan: AUDIO_CONSTANTS.MULTITAP_DEFAULT_PAN_2,
                        },
                        {
                          delay: this.toNum(effect.tap5, AUDIO_CONSTANTS.MULTITAP_DEFAULT_DELAY_3),
                          feedback: this.toNum(
                            effect.tap6,
                            AUDIO_CONSTANTS.MULTITAP_DEFAULT_FEEDBACK_3
                          ),
                          pan: AUDIO_CONSTANTS.MULTITAP_DEFAULT_PAN_3,
                        },
                      ].filter((t) => t.delay !== null && !isNaN(t.delay));

                const maxDelay = effect.maxDelay || 1;

                taps.forEach((tap) => {
                  const tapDelay = this.context.createDelay(maxDelay);
                  tapDelay.delayTime.value =
                    tap.delay || AUDIO_CONSTANTS.MULTITAP_TAP_DELAY_FALLBACK;

                  const tapFeedback = this.context.createGain();
                  tapFeedback.gain.value =
                    tap.feedback !== undefined ? tap.feedback : AUDIO_CONSTANTS.DEFAULT_FEEDBACK;

                  let tapPanNode = null;
                  if (tap.pan !== undefined && tap.pan !== null) {
                    tapPanNode = this.context.createStereoPanner();
                    tapPanNode.pan.value = Math.max(
                      AUDIO_CONSTANTS.AUTOPAN_PAN_MIN,
                      Math.min(AUDIO_CONSTANTS.AUTOPAN_PAN_MAX, tap.pan)
                    );
                  }

                  const tapWet = this.context.createGain();
                  tapWet.gain.value =
                    tap.wet !== undefined ? tap.wet : AUDIO_CONSTANTS.MULTITAP_DEFAULT_WET;

                  // wire: current -> delay -> feedback -> delay (loop)
                  currentNode.connect(tapDelay);
                  tapDelay.connect(tapFeedback);
                  tapFeedback.connect(tapDelay);

                  // to wet path (with optional pan)
                  if (tapPanNode) {
                    tapDelay.connect(tapPanNode);
                    tapPanNode.connect(tapWet);
                  } else {
                    tapDelay.connect(tapWet);
                  }
                  tapWet.connect(chain.wetGain);

                  chain.nodes.push(tapDelay, tapFeedback, tapWet);
                  if (tapPanNode) chain.nodes.push(tapPanNode);
                });

                node = null; // Parallel send - don't advance currentNode
              }
              break;

            case "tremolo": {
              // Volume LFO effect - heartbeat, danger throb, etc.
              node = this.context.createGain();
              const tremoloOsc = this.context.createOscillator();
              const tremoloDepthGain = this.context.createGain();

              tremoloOsc.type = effect.shape || "sine";
              tremoloOsc.frequency.setTargetAtTime(
                effect.rate || AUDIO_CONSTANTS.DEFAULT_TREMOLO_RATE,
                0,
                0.001
              );
              tremoloDepthGain.gain.value = effect.depth || AUDIO_CONSTANTS.DEFAULT_TREMOLO_DEPTH; // 0-1

              // Connect LFO: oscillator -> depth -> target gain
              tremoloOsc.connect(tremoloDepthGain);
              tremoloDepthGain.connect(node.gain);
              tremoloOsc.start();

              // Store oscillator and depth gain for cleanup
              chain.oscillators.push(tremoloOsc);
              chain.nodes.push(tremoloDepthGain);
              break;
            }

            case "vibrato": {
              // Pitch LFO effect - subtle warble, ethereal, dream-like
              // Implemented via modulated delay for classic vibrato sound
              const vibratoDelay = this.context.createDelay(0.02);
              const vibratoOsc = this.context.createOscillator();
              const vibratoDepthGain = this.context.createGain();

              vibratoOsc.type = effect.shape || "sine";
              vibratoOsc.frequency.setTargetAtTime(
                effect.rate || AUDIO_CONSTANTS.DEFAULT_VIBRATO_RATE,
                0,
                0.001
              );

              // Convert depth from cents to delay time
              // Depth of 50 cents = ~3ms delay modulation
              const depthInSeconds =
                ((effect.depth || AUDIO_CONSTANTS.DEFAULT_VIBRATO_DEPTH) /
                  AUDIO_CONSTANTS.VIBRATO_CENTS_TO_RATIO) *
                AUDIO_CONSTANTS.VIBRATO_DELAY_SCALE;
              vibratoDepthGain.gain.value = depthInSeconds;

              vibratoDelay.delayTime.value = AUDIO_CONSTANTS.VIBRATO_BASE_DELAY; // Base delay

              // Connect LFO to modulate delay time
              vibratoOsc.connect(vibratoDepthGain);
              vibratoDepthGain.connect(vibratoDelay.delayTime);
              vibratoOsc.start();

              node = vibratoDelay;

              // Store oscillator and depth gain for cleanup
              chain.oscillators.push(vibratoOsc);
              chain.nodes.push(vibratoDepthGain);
              break;
            }

            case "chorus":
              // 3-voice chorus with staggered delays
              // Use 1.0 gain - let global wetGain control wet/dry mix
              for (let i = 0; i < AUDIO_CONSTANTS.CHORUS_VOICE_COUNT; i++) {
                const delay = this.context.createDelay(AUDIO_CONSTANTS.CHORUS_MAX_DELAY);
                delay.delayTime.value =
                  AUDIO_CONSTANTS.CHORUS_DELAY_BASE + i * AUDIO_CONSTANTS.CHORUS_DELAY_INCREMENT;
                const gain = this.context.createGain();
                gain.gain.value = AUDIO_CONSTANTS.CHORUS_MIX_FACTOR; // Equal mix of 3 voices, total = 1.0
                currentNode.connect(delay);
                delay.connect(gain);
                gain.connect(chain.wetGain);
                // Track nodes for cleanup
                chain.nodes.push(delay, gain);
              }
              node = null;
              break;

            case "phaser": {
              const stages = effect.stages || AUDIO_CONSTANTS.DEFAULT_PHASER_STAGES;
              const phaserBase = effect.frequency || AUDIO_CONSTANTS.DEFAULT_PHASER_BASE_FREQ;
              const phaserDepth = effect.depth || AUDIO_CONSTANTS.DEFAULT_PHASER_DEPTH;
              const phaserRate = effect.rate || AUDIO_CONSTANTS.DEFAULT_PHASER_RATE;

              const phaserOsc = this.context.createOscillator();
              phaserOsc.type = effect.shape || "sine";
              phaserOsc.frequency.setTargetAtTime(phaserRate, 0, 0.001);

              const phaserGain = this.context.createGain();
              phaserGain.gain.value = phaserDepth;
              phaserOsc.connect(phaserGain);
              phaserOsc.start();
              chain.oscillators.push(phaserOsc);
              chain.nodes.push(phaserGain);

              let filterInput = this.context.createBiquadFilter();
              filterInput.type = "allpass";
              filterInput.frequency.value = phaserBase;
              phaserGain.connect(filterInput.frequency);
              chain.nodes.push(filterInput);

              let lastFilter = filterInput;
              for (let stage = 1; stage < stages; stage += 1) {
                const filter = this.context.createBiquadFilter();
                filter.type = "allpass";
                filter.frequency.value = phaserBase;
                phaserGain.connect(filter.frequency);
                lastFilter.connect(filter);
                lastFilter = filter;
                chain.nodes.push(filter);
              }

              currentNode.connect(filterInput);
              currentNode = lastFilter;
              node = null;
              break;
            }

            case "flanger": {
              const flangerDelay = this.context.createDelay(AUDIO_CONSTANTS.FLANGER_MAX_DELAY);
              flangerDelay.delayTime.value = AUDIO_CONSTANTS.DEFAULT_FLANGER_DELAY;

              const flangerFeedback = this.context.createGain();
              flangerFeedback.gain.value = Math.min(
                effect.feedback || AUDIO_CONSTANTS.DEFAULT_FLANGER_FEEDBACK,
                AUDIO_CONSTANTS.FLANGER_FEEDBACK_MAX
              );

              const flangerOsc = this.context.createOscillator();
              flangerOsc.type = effect.shape || "sine";
              flangerOsc.frequency.setTargetAtTime(
                effect.rate || AUDIO_CONSTANTS.DEFAULT_FLANGER_RATE,
                0,
                0.001
              );

              const flangerDepth = this.context.createGain();
              flangerDepth.gain.value = effect.depth || AUDIO_CONSTANTS.DEFAULT_FLANGER_DEPTH;

              flangerOsc.connect(flangerDepth);
              flangerDepth.connect(flangerDelay.delayTime);
              flangerOsc.start();
              chain.oscillators.push(flangerOsc);

              const flangerInput = this.context.createGain();

              currentNode.connect(flangerInput);
              flangerInput.connect(flangerDelay);
              flangerDelay.connect(flangerFeedback);
              flangerFeedback.connect(flangerInput);

              currentNode = flangerDelay;
              node = null;
              chain.nodes.push(flangerInput, flangerDelay, flangerFeedback, flangerDepth);
              break;
            }

            case "widener": {
              // Stereo widening via Haas effect (delayed channel)
              // Typical values: 5-50ms. Max safe: 1 second.
              const rawWidth =
                (effect.width !== undefined ? effect.width : effect.amount) ||
                AUDIO_CONSTANTS.DEFAULT_WIDENER_WIDTH;
              const maxDelay = AUDIO_CONSTANTS.WIDENER_MAX_DELAY;
              const widthDelay = Math.min(Math.max(0, rawWidth), maxDelay); // Clamp to safe range

              const splitter = this.context.createChannelSplitter(2);
              splitter.channelCount = 2; // Stereo output
              splitter.channelCountMode = "explicit"; // Force up-mix for mono sources
              const merger = this.context.createChannelMerger(2);
              const delayNode = this.context.createDelay(maxDelay);
              delayNode.delayTime.value = widthDelay;

              // Left -> Merger L
              splitter.connect(merger, 0, 0);

              // Right -> Delay -> Merger R
              splitter.connect(delayNode, 1);
              delayNode.connect(merger, 0, 1);

              currentNode.connect(splitter);
              currentNode = merger;
              node = null;
              chain.nodes.push(splitter, merger, delayNode);
              break;
            }

            case "eq3": {
              const low = this.context.createBiquadFilter();
              low.type = "lowshelf";
              low.frequency.value = AUDIO_CONSTANTS.DEFAULT_EQ_LOW_FREQ;
              low.gain.value = effect.low || 0;

              const mid = this.context.createBiquadFilter();
              mid.type = "peaking";
              mid.frequency.value = effect.midFreq || AUDIO_CONSTANTS.DEFAULT_EQ_MID_FREQ;
              mid.gain.value = effect.mid || 0;

              const high = this.context.createBiquadFilter();
              high.type = "highshelf";
              high.frequency.value = AUDIO_CONSTANTS.DEFAULT_EQ_HIGH_FREQ;
              high.gain.value = effect.high || 0;

              currentNode.connect(low);
              low.connect(mid);
              mid.connect(high);

              currentNode = high;
              node = null;
              chain.nodes.push(low, mid, high);
              break;
            }

            case "ringmod": {
              // Ring Modulator (Amplitude Modulation)
              // Multiplies signal by an oscillator
              const ringOsc = this.context.createOscillator();
              ringOsc.type = "sine";
              ringOsc.frequency.setTargetAtTime(
                effect.speed !== undefined
                  ? effect.speed
                  : effect.frequency !== undefined
                    ? effect.frequency
                    : AUDIO_CONSTANTS.DEFAULT_RINGMOD_SPEED,
                0,
                0.001
              );

              const ringGain = this.context.createGain();
              ringGain.gain.value = 0; // Base gain 0 for pure ring mod

              // Mix control for ring modulation intensity
              // For ring mod, "mix" controls how much the carrier oscillator modulates the signal
              // Dry/Wet is still handled by chain.wetGain/dryGain for overall effect blend
              const ringDepth = this.context.createGain();
              ringDepth.gain.value =
                effect.mix !== undefined ? effect.mix : AUDIO_CONSTANTS.DEFAULT_RINGMOD_MIX;

              // Connect: Osc -> Depth -> RingGain.gain
              // Signal -> RingGain -> Output
              ringOsc.connect(ringDepth);
              ringDepth.connect(ringGain.gain);
              ringOsc.start();
              chain.oscillators.push(ringOsc);
              chain.nodes.push(ringDepth);

              node = ringGain;
              chain.nodes.push(ringGain);
              break;
            }

            case "autopan": {
              // Auto-Pan / Rotary Speaker
              const panner = this.context.createStereoPanner();
              const panOsc = this.context.createOscillator();
              const panDepth = this.context.createGain();

              panOsc.type = "sine";
              panOsc.frequency.value =
                effect.speed !== undefined
                  ? effect.speed
                  : effect.rate !== undefined
                    ? effect.rate
                    : AUDIO_CONSTANTS.DEFAULT_AUTOPAN_SPEED;

              panDepth.gain.value = effect.depth || AUDIO_CONSTANTS.DEFAULT_AUTOPAN_DEPTH; // 0 to 1

              panOsc.connect(panDepth);
              panDepth.connect(panner.pan);

              panOsc.start();
              chain.oscillators.push(panOsc);

              node = panner;
              chain.nodes.push(panner, panDepth);
              break;
            }
          }

          if (node) {
            currentNode.connect(node);
            currentNode = node;
            chain.nodes.push(node);
          }
        });

        // Connect wet/dry paths
        chain.input.connect(chain.dryGain);
        chain.dryGain.connect(chain.output);

        if (currentNode !== chain.input) {
          currentNode.connect(chain.wetGain);
        }
        chain.wetGain.connect(chain.output);

        return chain;
      } catch (e) {
        Logger.error(`createEffectChain failed: ${e.message}`);
        return null;
      }
    },

    createDistortionCurve(amount) {
      // Validate amount and choose defaults
      const safeAmount = this.toNum(amount, AUDIO_CONSTANTS.DEFAULT_DISTORTION_AMOUNT);
      // Clamp to a sane operational range to avoid extreme math
      const clampedAmount = Math.max(
        AUDIO_CONSTANTS.DISTORTION_AMOUNT_MIN,
        Math.min(AUDIO_CONSTANTS.DISTORTION_AMOUNT_MAX, safeAmount)
      );

      // Use runtime audio context sampleRate when available, fallback to 44100
      const defaultSamples = AUDIO_CONSTANTS.MIN_SAMPLE_RATE;
      const ctxRate =
        this.context && Number.isFinite(this.context.sampleRate)
          ? Math.round(this.context.sampleRate)
          : defaultSamples;
      // Bound the sample buffer used for curve generation to avoid huge allocations
      const samples = Math.max(
        AUDIO_CONSTANTS.MIN_CURVE_SAMPLES,
        Math.min(AUDIO_CONSTANTS.MAX_CURVE_SAMPLES, ctxRate)
      );

      const roundedKey = Number.parseFloat(clampedAmount).toFixed(
        AUDIO_CONSTANTS.CACHE_KEY_DECIMALS
      );
      const cacheKey = `dist_${roundedKey}_${samples}`;
      if (this.curveCache[cacheKey]) {
        return this.curveCache[cacheKey];
      }

      const curve = new Float32Array(samples);
      const deg = AUDIO_CONSTANTS.DISTORTION_DEG_TO_RAD;

      for (let i = 0; i < samples; i++) {
        const x =
          (i * AUDIO_CONSTANTS.DISTORTION_INPUT_SCALE) / samples -
          AUDIO_CONSTANTS.DISTORTION_INPUT_OFFSET;
        // Use clampedAmount for math to avoid NaNs / runaway values
        let v =
          ((AUDIO_CONSTANTS.DISTORTION_AMP_MULTIPLIER + clampedAmount) *
            x *
            AUDIO_CONSTANTS.DISTORTION_X_SCALER *
            deg) /
          (Math.PI + clampedAmount * Math.abs(x));

        // Ensure finite value and clamp into [-1, 1]
        if (!Number.isFinite(v) || Number.isNaN(v)) v = 0;
        curve[i] = Math.max(
          AUDIO_CONSTANTS.DISTORTION_OUTPUT_CLAMP_MIN,
          Math.min(AUDIO_CONSTANTS.DISTORTION_OUTPUT_CLAMP_MAX, v)
        );
      }

      // sanity-check result and cache it with LRU eviction
      this._addToCache(cacheKey, curve);
      return curve;
    },

    // LRU cache helper - evicts oldest entries when cache is full
    _addToCache(key, value) {
      if (this.curveCache[key]) {
        // Already cached, just return
        return;
      }
      // Evict oldest entries if cache is full
      while (this.curveCacheOrder.length >= this.CURVE_CACHE_MAX_SIZE) {
        const oldestKey = this.curveCacheOrder.shift();
        delete this.curveCache[oldestKey];
      }
      this.curveCache[key] = value;
      this.curveCacheOrder.push(key);
    },

    createBitcrusherCurve(bits, normfreq) {
      // Bitcrusher using WaveShaper with quantization
      const safeBits = Math.max(
        AUDIO_CONSTANTS.BITCRUSHER_BITS_MIN,
        Math.min(
          AUDIO_CONSTANTS.BITCRUSHER_BITS_MAX,
          Math.round(this.toNum(bits, AUDIO_CONSTANTS.DEFAULT_BITCRUSHER_BITS))
        )
      );
      const rawNorm = this.toNum(normfreq, AUDIO_CONSTANTS.DEFAULT_BITCRUSHER_NORMFREQ);
      const safeNormfreq = Math.max(
        AUDIO_CONSTANTS.NORMFREQ_MIN,
        Math.min(AUDIO_CONSTANTS.NORMFREQ_MAX, rawNorm)
      );

      // Use runtime audio context sampleRate when available, fallback to 44100
      const defaultSamples = AUDIO_CONSTANTS.MIN_SAMPLE_RATE;
      const ctxRate =
        this.context && Number.isFinite(this.context.sampleRate)
          ? Math.round(this.context.sampleRate)
          : defaultSamples;
      const samples = Math.max(
        AUDIO_CONSTANTS.MIN_CURVE_SAMPLES,
        Math.min(AUDIO_CONSTANTS.MAX_CURVE_SAMPLES, ctxRate)
      );

      // Use rounded normfreq for stable cache keys
      const normKey = safeNormfreq.toFixed(AUDIO_CONSTANTS.CACHE_KEY_DECIMALS);
      const cacheKey = `bit_${safeBits}_${normKey}_${samples}`;
      if (this.curveCache[cacheKey]) {
        return this.curveCache[cacheKey];
      }
      const curve = new Float32Array(samples);

      // Calculate number of quantization levels from bit depth
      const levels = Math.pow(AUDIO_CONSTANTS.BITCRUSHER_LEVELS_BASE, safeBits);
      const step = AUDIO_CONSTANTS.BITCRUSHER_STEP_BASE / levels; // Range is -1 to 1

      for (let i = 0; i < samples; i++) {
        const x =
          (i * AUDIO_CONSTANTS.BITCRUSHER_INDEX_SCALE) / samples -
          AUDIO_CONSTANTS.BITCRUSHER_INPUT_OFFSET; // Input range -1 to 1

        // Quantize to discrete levels based on bit depth
        const quantized = Math.round(x / step) * step;

        // Apply normfreq as a sample-rate reduction approximation
        // Higher normfreq = more aggressive stepping
        const stepped = Math.floor(i * safeNormfreq) / (samples * safeNormfreq);
        const index = Math.floor(stepped * samples);
        const steppedValue =
          index < samples
            ? Math.round(
                (((index * AUDIO_CONSTANTS.BITCRUSHER_INDEX_SCALE) / samples -
                  AUDIO_CONSTANTS.BITCRUSHER_STEPPED_OFFSET) /
                  step) *
                  step
              )
            : quantized;

        // Blend between normal quantization and stepped for smoother normfreq effect
        let val =
          quantized *
            (AUDIO_CONSTANTS.BITCRUSHER_BLEND_NORMAL -
              safeNormfreq * AUDIO_CONSTANTS.BITCRUSHER_BLEND_FACTOR) +
          steppedValue * (safeNormfreq * AUDIO_CONSTANTS.BITCRUSHER_BLEND_FACTOR);
        if (!Number.isFinite(val) || Number.isNaN(val)) val = 0;
        curve[i] = Math.max(
          AUDIO_CONSTANTS.BITCRUSHER_RANGE_MIN,
          Math.min(AUDIO_CONSTANTS.BITCRUSHER_RANGE_MAX, val)
        );
      }

      // Store in cache with LRU eviction and return
      this._addToCache(cacheKey, curve);
      return curve;
    },

    // Preset categories - organized by use case
    presets: {
      environment: {
        underwater: [
          { type: "lowpass", frequency: 800, resonance: 2 },
          { type: "reverb", duration: 3, decay: 0.9, wet: 0.7 },
          { type: "ringmod", speed: 0.8, mix: 0.15 },
        ],
        cave: [
          { type: "reverb", duration: 4, decay: 0.8, wet: 0.8 },
          {
            type: "multitap",
            maxDelay: 1,
            taps: [
              { delay: 0.24, feedback: 0.35, pan: -0.6, wet: 0.35 },
              { delay: 0.36, feedback: 0.32, pan: 0.6, wet: 0.35 },
            ],
          },
          { type: "lowpass", frequency: 2500, resonance: 1 },
        ],
        city: [
          { type: "reverb", duration: 1.5, decay: 0.6, wet: 0.4 },
          { type: "highpass", frequency: 200, resonance: 1 },
        ],
        dungeon: [
          { type: "reverb", duration: 3.5, decay: 0.9, wet: 0.9 },
          { type: "lowpass", frequency: 1200, resonance: 1.5 },
        ],
        forest: [
          { type: "reverb", duration: 2, decay: 0.7, wet: 0.5 },
          { type: "chorus", wet: 0.3 },
        ],
        space: [
          { type: "reverb", duration: 5, decay: 0.95, wet: 0.9 },
          { type: "delay", delay: 0.5, feedback: 0.5, wet: 0.4 },
          { type: "autopan", speed: 0.2, depth: 0.6 },
        ],
        abyss: [
          { type: "lowpass", frequency: 200, resonance: 2 },
          { type: "reverb", duration: 7, decay: 0.98, wet: 0.85 },
          { type: "compressor", threshold: -30, ratio: 12, attack: 0.01, release: 0.3 },
        ],
        tavernRoom: [
          { type: "lowpass", frequency: 3200, resonance: 0.6 },
          { type: "widener", width: 0.015 },
          { type: "reverb", duration: 1.4, decay: 0.55, wet: 0.35 },
        ],
        mistyForest: [
          { type: "highpass", frequency: 250, resonance: 0.9 },
          { type: "reverb", duration: 3.8, decay: 0.85, wet: 0.5 },
          { type: "chorus", rate: 0.7, depth: 0.35 },
        ],
        shimmer: [
          { type: "chorus", wet: 0.35 },
          { type: "delay", delay: 0.45, feedback: 0.6, wet: 0.35 },
          { type: "reverb", duration: 5, decay: 0.85, wet: 0.6 },
          { type: "highpass", frequency: 250, resonance: 1 },
        ],
        mechanicalHum: [
          { type: "ringmod", speed: 60, mix: 0.3 },
          { type: "bandpass", frequency: 200, resonance: 3 },
          { type: "tremolo", rate: 5, depth: 0.25, shape: "sine" },
          { type: "reverb", duration: 2, decay: 0.6, wet: 0.3 },
        ],
      },

      mood: {
        ethereal: [
          { type: "vibrato", rate: 4, depth: 15, shape: "sine" },
          { type: "widener", width: 0.025 },
          { type: "reverb", duration: 4, decay: 0.85, wet: 0.6 },
        ],
        frozen: [
          { type: "tremolo", rate: 0.8, depth: 0.3, shape: "sine" },
          { type: "reverb", duration: 4.5, decay: 0.9, wet: 0.7 },
          { type: "highpass", frequency: 500, resonance: 1 },
        ],
        memory: [
          { type: "lowpass", frequency: 1200, resonance: 1 },
          { type: "vibrato", rate: 2, depth: 10, shape: "sine" },
          { type: "reverb", duration: 3, decay: 0.7, wet: 0.5 },
        ],
        tapeEcho: [
          { type: "delay", delay: 0.28, feedback: 0.45, wet: 0.55, maxDelay: 1 },
          { type: "lowpass", frequency: 3800, resonance: 0.7 },
          { type: "reverb", duration: 1.8, decay: 0.65, wet: 0.35 },
        ],
      },

      weather: {
        stormyWeather: [
          { type: "highpass", frequency: 300, resonance: 1.2 },
          { type: "autopan", speed: 0.6, depth: 0.8 },
          { type: "reverb", duration: 4, decay: 0.85, wet: 0.5 },
        ],
        heavyRain: [
          { type: "highpass", frequency: 150, resonance: 0.8 },
          { type: "bandpass", frequency: 4000, resonance: 2 },
          { type: "reverb", duration: 3.5, decay: 0.8, wet: 0.45 },
        ],
        snowStorm: [
          { type: "lowpass", frequency: 2000, resonance: 0.7 },
          { type: "tremolo", rate: 0.3, depth: 0.2, shape: "sine" },
          { type: "widener", width: 0.02 },
          { type: "reverb", duration: 4.5, decay: 0.9, wet: 0.6 },
        ],
        thunderAftershock: [
          { type: "highpass", frequency: 2500, resonance: 6 },
          { type: "reverb", duration: 5, decay: 0.95, wet: 0.75 },
          { type: "tremolo", rate: 0.8, depth: 0.3, shape: "sine" },
        ],
        windHowl: [
          { type: "highpass", frequency: 500, resonance: 0.9 },
          { type: "flanger", rate: 0.4, depth: 0.004, feedback: 0.5 },
          { type: "autopan", speed: 0.7, depth: 0.6 },
          { type: "reverb", duration: 3.5, decay: 0.8, wet: 0.5 },
        ],
        hailOnTin: [
          { type: "highpass", frequency: 1200, resonance: 1.6 },
          { type: "bandpass", frequency: 5200, resonance: 3.5 },
          { type: "distortion", amount: 12 },
          { type: "reverb", duration: 1.4, decay: 0.55, wet: 0.25 },
        ],
        insideCabinRain: [
          { type: "lowpass", frequency: 2600, resonance: 0.8 },
          { type: "reverb", duration: 1.8, decay: 0.6, wet: 0.35 },
          { type: "chorus", wet: 0.18 },
        ],
        monsoonWall: [
          { type: "bandpass", frequency: 3600, resonance: 2.2 },
          { type: "compressor", threshold: -28, knee: 8, ratio: 10, attack: 0.005, release: 0.15 },
          { type: "widener", width: 0.02 },
          { type: "reverb", duration: 3.2, decay: 0.78, wet: 0.4 },
        ],
        desertWind: [
          { type: "highpass", frequency: 900, resonance: 1.1 },
          { type: "autopan", speed: 0.45, depth: 0.7 },
          { type: "flanger", rate: 0.25, depth: 0.003, feedback: 0.35 },
          { type: "reverb", duration: 2.8, decay: 0.75, wet: 0.35 },
        ],
        blizzardWhiteout: [
          { type: "lowpass", frequency: 1400, resonance: 0.7 },
          { type: "widener", width: 0.02 },
          { type: "tremolo", rate: 0.25, depth: 0.25, shape: "sine" },
          { type: "reverb", duration: 5.2, decay: 0.92, wet: 0.7 },
        ],
        lightningZap: [
          { type: "highpass", frequency: 3200, resonance: 5 },
          { type: "distortion", amount: 28 },
          { type: "delay", delay: 0.07, feedback: 0.2, wet: 0.15 },
          { type: "reverb", duration: 0.9, decay: 0.35, wet: 0.12 },
        ],
      },

      combat: {
        explosionAftershock: [
          { type: "highpass", frequency: 3000, resonance: 7 },
          { type: "reverb", duration: 6, decay: 0.95, wet: 0.8 },
          { type: "tremolo", rate: 2, depth: 0.4, shape: "sine" },
        ],
        impactThud: [
          { type: "lowpass", frequency: 800, resonance: 1.5 },
          { type: "compressor", threshold: -25, ratio: 12, attack: 0.003, release: 0.2 },
          { type: "reverb", duration: 1.5, decay: 0.5, wet: 0.25 },
        ],
        charging: [
          { type: "tremolo", rate: 3, depth: 0.4, shape: "sine" },
          { type: "highpass", frequency: 1000, resonance: 2 },
          { type: "distortion", amount: 15 },
          { type: "reverb", duration: 2, decay: 0.6, wet: 0.2 },
        ],
        swordClash: [
          { type: "highpass", frequency: 2000, resonance: 3 },
          { type: "bandpass", frequency: 4500, resonance: 4 },
          { type: "distortion", amount: 25 },
          { type: "reverb", duration: 1.2, decay: 0.4, wet: 0.2 },
        ],
        magicCast: [
          { type: "highpass", frequency: 800, resonance: 1 },
          { type: "ringmod", speed: 20, mix: 0.2 },
          { type: "reverb", duration: 2.5, decay: 0.7, wet: 0.45 },
          { type: "chorus", wet: 0.3 },
        ],
        powerUp: [
          { type: "highpass", frequency: 600, resonance: 1.5 },
          { type: "eq3", low: -3, mid: 2, high: 4, midFreq: 2000 },
          { type: "tremolo", rate: 6, depth: 0.35, shape: "triangle" },
          { type: "reverb", duration: 1.5, decay: 0.5, wet: 0.2 },
        ],
        defeatMoment: [
          { type: "lowpass", frequency: 600, resonance: 2 },
          { type: "eq3", low: 3, mid: -4, high: -6, midFreq: 1500 },
          { type: "tremolo", rate: 1.5, depth: 0.2, shape: "sine" },
          { type: "reverb", duration: 3, decay: 0.85, wet: 0.5 },
        ],
        victoryTone: [
          { type: "eq3", low: 2, mid: 1, high: 3, midFreq: 2500 },
          { type: "reverb", duration: 2, decay: 0.6, wet: 0.3 },
          { type: "compressor", threshold: -18, ratio: 4, attack: 0.01, release: 0.15 },
        ],
        bloodlust: [
          { type: "distortion", amount: 30 },
          { type: "tremolo", rate: 8, depth: 0.5, shape: "square" },
          { type: "compressor", threshold: -20, ratio: 8, attack: 0.005, release: 0.1 },
          { type: "reverb", duration: 1, decay: 0.3, wet: 0.15 },
        ],
        adrenaline: [
          { type: "compressor", threshold: -22, knee: 6, ratio: 5, attack: 0.008, release: 0.12 },
          { type: "eq3", low: -2, mid: 2, high: 3, midFreq: 2400 },
          { type: "tremolo", rate: 5.5, depth: 0.18, shape: "sine" },
        ],
        slowMo: [
          { type: "lowpass", frequency: 900, resonance: 1.2 },
          { type: "reverb", duration: 6.5, decay: 0.95, wet: 0.75 },
          { type: "autopan", speed: 0.12, depth: 0.45 },
        ],
        berserk: [
          { type: "distortion", amount: 42 },
          { type: "ringmod", speed: 18, mix: 0.25 },
          { type: "compressor", threshold: -18, knee: 4, ratio: 8, attack: 0.003, release: 0.08 },
        ],
        bossAura: [
          { type: "bandpass", frequency: 900, resonance: 4 },
          { type: "phaser", rate: 0.22, depth: 700, frequency: 550, stages: 6 },
          { type: "reverb", duration: 5.5, decay: 0.93, wet: 0.65 },
        ],
        criticalHitSting: [
          { type: "highpass", frequency: 1800, resonance: 2 },
          { type: "eq3", low: -3, mid: 2, high: 5, midFreq: 3000 },
          { type: "delay", delay: 0.12, feedback: 0.35, wet: 0.18 },
          { type: "reverb", duration: 1.1, decay: 0.45, wet: 0.16 },
        ],
        nearDeath: [
          { type: "lowpass", frequency: 650, resonance: 2 },
          { type: "tremolo", rate: 1.35, depth: 0.35, shape: "sine" },
          { type: "reverb", duration: 2.8, decay: 0.8, wet: 0.35 },
        ],
      },

      horror: {
        nightmare: [
          { type: "vibrato", rate: 3, depth: 30, shape: "sine" },
          { type: "lowpass", frequency: 800, resonance: 2 },
          { type: "reverb", duration: 5, decay: 0.9, wet: 0.7 },
        ],
        nightmareAugmented: [
          { type: "ringmod", speed: 8, mix: 0.7 },
          { type: "reverb", duration: 6, decay: 0.95, wet: 0.8 },
          { type: "tremolo", rate: 0.5, depth: 0.5, shape: "sine" },
          { type: "lowpass", frequency: 1000, resonance: 3 },
        ],
        hauntedHall: [
          { type: "highpass", frequency: 180, resonance: 0.7 },
          { type: "reverb", duration: 5, decay: 0.92, wet: 0.7 },
          { type: "tremolo", rate: 0.8, depth: 0.25, shape: "sine" },
        ],
        cursedChapel: [
          { type: "bandpass", frequency: 850, resonance: 8 },
          { type: "reverb", duration: 6, decay: 0.94, wet: 0.65 },
          { type: "autopan", speed: 0.4, depth: 0.4 },
        ],
        dungeonDepths: [
          { type: "lowpass", frequency: 900, resonance: 1.2 },
          { type: "reverb", duration: 3.5, decay: 0.85, wet: 0.5 },
          { type: "tremolo", rate: 0.6, depth: 0.18, shape: "sine" },
        ],
        ghostWhisper: [
          { type: "highpass", frequency: 400, resonance: 0.8 },
          { type: "widener", width: 0.025 },
          { type: "autopan", speed: 0.7, depth: 0.6 },
          { type: "reverb", duration: 4, decay: 0.9, wet: 0.55 },
        ],
        madness: [
          { type: "lowpass", frequency: 700, resonance: 1.4 },
          { type: "bitcrusher", bits: 10, normfreq: 0.55 },
          { type: "ringmod", speed: 12 },
          { type: "reverb", duration: 2.5, decay: 0.75, wet: 0.45 },
        ],
        eldritchVoid: [
          { type: "highpass", frequency: 220, resonance: 1 },
          { type: "phaser", rate: 0.6, depth: 0.7 },
          { type: "reverb", duration: 6.5, decay: 0.96, wet: 0.7 },
        ],
        flangedSpirit: [
          { type: "flanger", rate: 0.35, depth: 0.003, feedback: 0.6 },
          { type: "reverb", duration: 3.2, decay: 0.85, wet: 0.45 },
          { type: "highpass", frequency: 260, resonance: 0.9 },
        ],
        poltergeist: [
          { type: "autopan", speed: 1.0, depth: 0.9 },
          { type: "widener", width: 0.02 },
          { type: "reverb", duration: 4.2, decay: 0.9, wet: 0.55 },
        ],
        possessedRadio: [
          { type: "bandpass", frequency: 1600, resonance: 4 },
          { type: "bitcrusher", bits: 7, normfreq: 0.55 },
          { type: "tremolo", rate: 9, depth: 0.55, shape: "square" },
          { type: "distortion", amount: 18 },
        ],
        ritualChant: [
          { type: "chorus", wet: 0.28 },
          { type: "eq3", low: 2, mid: 1.5, high: -2, midFreq: 1200 },
          { type: "reverb", duration: 5, decay: 0.9, wet: 0.6 },
        ],
        mirrorRealm: [
          { type: "phaser", rate: 0.35, depth: 900, frequency: 800, stages: 6 },
          { type: "delay", delay: 0.32, feedback: 0.5, wet: 0.3 },
          { type: "highpass", frequency: 350, resonance: 0.8 },
          { type: "reverb", duration: 4.6, decay: 0.88, wet: 0.55 },
        ],
      },

      communication: {
        phone: [
          { type: "bandpass", frequency: 1000, resonance: 5 },
          { type: "distortion", amount: 20 },
          { type: "compressor", threshold: -20, knee: 10, ratio: 6, attack: 0.01, release: 0.1 },
        ],
        radio: [
          { type: "bandpass", frequency: 2000, resonance: 3 },
          { type: "bitcrusher", bits: 12, normfreq: 0.2 },
          { type: "distortion", amount: 10 },
        ],
        radioDistress: [
          { type: "highpass", frequency: 450, resonance: 0.8 },
          { type: "bandpass", frequency: 1400, resonance: 6 },
          { type: "distortion", amount: 45 },
          { type: "compressor", threshold: -20, ratio: 6, attack: 0.01, release: 0.3 },
          { type: "reverb", duration: 1.2, decay: 0.4, wet: 0.25 },
        ],
      },

      lofi: {
        retro: [
          { type: "bitcrusher", bits: 8, normfreq: 0.3 },
          { type: "lowpass", frequency: 4000, resonance: 1 },
        ],
        corrupted: [
          { type: "bitcrusher", bits: 4, normfreq: 0.7 },
          { type: "ringmod", speed: 15, mix: 0.6 },
        ],
        damaged: [
          { type: "bitcrusher", bits: 6, normfreq: 0.6 },
          { type: "tremolo", rate: 8, depth: 0.4, shape: "square" },
        ],
      },

      dynamics: {
        gentle: [
          { type: "compressor", threshold: -18, knee: 6, ratio: 3, attack: 0.01, release: 0.1 },
        ],
        squashed: [
          { type: "compressor", threshold: -30, knee: 10, ratio: 8, attack: 0.001, release: 0.05 },
        ],
        broadcast: [
          { type: "compressor", threshold: -20, knee: 15, ratio: 6, attack: 0.005, release: 0.2 },
          { type: "eq3", low: -2, mid: 2, high: 3, midFreq: 2000 },
        ],
        limiter: [
          { type: "compressor", threshold: -6, knee: 1, ratio: 20, attack: 0.001, release: 0.1 },
        ],
        bassChamber: [
          { type: "compressor", threshold: -18, ratio: 8, attack: 0.005, release: 0.25 },
          { type: "eq3", low: 4, mid: -2, high: -1, midFreq: 600 },
          { type: "reverb", duration: 2.4, decay: 0.75, wet: 0.4 },
        ],
      },

      spatial: {
        scifi: [
          { type: "phaser", rate: 0.5, depth: 800, frequency: 500, stages: 8 },
          { type: "reverb", duration: 3, decay: 0.5, wet: 0.4 },
        ],
        jet: [{ type: "flanger", rate: 0.2, depth: 0.005, feedback: 0.7 }],
        wide: [{ type: "widener", width: 0.02 }],
        psychotic: [
          { type: "flanger", rate: 1.5, depth: 0.008, feedback: 0.8 },
          { type: "tremolo", rate: 7, depth: 0.6, shape: "triangle" },
        ],
        stutter: [
          { type: "bitcrusher", bits: 8, normfreq: 0.4 },
          { type: "tremolo", rate: 10, depth: 0.75, shape: "square" },
        ],
        dizzy: [
          { type: "autopan", speed: 0.8, depth: 1.0 },
          { type: "phaser", rate: 0.3, depth: 400, frequency: 800, stages: 4 },
        ],
      },

      locations: {
        tinyBathroom: [
          { type: "highpass", frequency: 220, resonance: 1 },
          { type: "delay", delay: 0.08, feedback: 0.25, wet: 0.18 },
          { type: "reverb", duration: 1.2, decay: 0.45, wet: 0.35 },
        ],
        warehouse: [
          {
            type: "multitap",
            maxDelay: 1,
            taps: [
              { delay: 0.14, feedback: 0.25, pan: -0.3, wet: 0.25 },
              { delay: 0.22, feedback: 0.22, pan: 0.3, wet: 0.25 },
            ],
          },
          { type: "reverb", duration: 3.8, decay: 0.86, wet: 0.55 },
          { type: "highpass", frequency: 180, resonance: 0.7 },
        ],
        stoneCorridor: [
          { type: "bandpass", frequency: 1200, resonance: 2.5 },
          {
            type: "multitap",
            maxDelay: 1,
            taps: [
              { delay: 0.18, feedback: 0.3, pan: -0.5, wet: 0.25 },
              { delay: 0.26, feedback: 0.28, pan: 0.5, wet: 0.25 },
            ],
          },
          { type: "reverb", duration: 2.6, decay: 0.8, wet: 0.45 },
        ],
        openField: [
          { type: "highpass", frequency: 180, resonance: 0.7 },
          { type: "reverb", duration: 1.9, decay: 0.55, wet: 0.18 },
        ],
      },

      extreme: {
        overdrive: [{ type: "overdrive", drive: 25, output: 1.2 }],
        glitchApocalypse: [
          { type: "bitcrusher", bits: 3, normfreq: 0.8 },
          { type: "ringmod", speed: 45, mix: 0.9 },
          { type: "tremolo", rate: 15, depth: 0.8, shape: "square" },
          { type: "distortion", amount: 80 },
          { type: "reverb", duration: 1.5, decay: 0.5, wet: 0.3 },
        ],
        totalCrushed: [
          {
            type: "compressor",
            threshold: -50,
            knee: 0.5,
            ratio: 20,
            attack: 0.0001,
            release: 0.05,
          },
          { type: "limiter", threshold: -3, knee: 0, ratio: Infinity, attack: 0.001, release: 0.1 },
          { type: "distortion", amount: 50 },
        ],
        voidReverb: [
          { type: "reverb", duration: 8, decay: 0.98, wet: 0.95 },
          { type: "lowpass", frequency: 2000, resonance: 0.5 },
        ],
        tinnySpeaker: [
          { type: "highpass", frequency: 3500, resonance: 8 },
          { type: "distortion", amount: 35 },
          { type: "compressor", threshold: -25, ratio: 10, attack: 0.005, release: 0.15 },
        ],
        boomy: [
          { type: "lowpass", frequency: 250, resonance: 6 },
          { type: "tremolo", rate: 2, depth: 0.4, shape: "sine" },
          { type: "reverb", duration: 4, decay: 0.9, wet: 0.6 },
        ],
        chaosModulation: [
          { type: "flanger", rate: 1.8, depth: 0.008, feedback: 0.85 },
          { type: "phaser", rate: 0.4, depth: 1000, frequency: 400, stages: 6 },
          { type: "vibrato", rate: 7, depth: 40, shape: "triangle" },
          { type: "autopan", speed: 1.2, depth: 1.0 },
        ],
        blown: [
          { type: "overdrive", drive: 40, output: 2.0 },
          { type: "distortion", amount: 70 },
          { type: "bitcrusher", bits: 8, normfreq: 0.5 },
          { type: "compressor", threshold: -15, ratio: 15, attack: 0.002, release: 0.08 },
        ],
      },

      character: {
        robot: [
          { type: "ringmod", speed: 30, mix: 1.0 },
          { type: "delay", delay: 0.15, feedback: 0.3, wet: 0.2 },
        ],
        tiny: [
          { type: "highpass", frequency: 1200, resonance: 1.5 },
          { type: "widener", width: 0.02 },
          { type: "vibrato", rate: 5, depth: 10, shape: "triangle" },
          { type: "reverb", duration: 1.5, decay: 0.6, wet: 0.4 },
        ],
        giant: [
          { type: "lowpass", frequency: 400, resonance: 1.5 },
          { type: "tremolo", rate: 1, depth: 0.2, shape: "sine" },
          { type: "reverb", duration: 5.5, decay: 0.95, wet: 0.65 },
        ],
        overdrivenLute: [
          { type: "overdrive", drive: 18, output: 1.1 },
          { type: "eq3", low: -1.5, mid: 1.5, high: 2.5, midFreq: 1800 },
          { type: "reverb", duration: 1.6, decay: 0.6, wet: 0.3 },
        ],
      },

      tonal: {
        muffled: [{ type: "eq3", low: 5, mid: -10, high: -20 }],
        nextroom: [
          { type: "eq3", low: 2, mid: -5, high: -30 },
          { type: "reverb", duration: 1.5, decay: 0.5, wet: 0.2 },
        ],
      },

      // Aliases point to other presets
      _aliases: {
        angelic: "environment.shimmer",
      },
    },

    // Get a preset by name, supporting nested paths and aliases
    getPreset(name) {
      if (!name || typeof name !== "string") return null;

      // Check aliases first
      if (this.presets._aliases && this.presets._aliases[name]) {
        name = this.presets._aliases[name];
      }

      // Handle "category.preset" format
      if (name.includes(".")) {
        const segments = name.split(".");
        if (segments.length !== 2) return null;
        const category = segments[0];
        const presetName = segments[1];
        if (!category || !presetName) return null;
        const cat = this.presets[category];
        if (cat && cat[presetName]) return cat[presetName];
        return null;
      }

      // Search all categories for the preset name
      for (const categoryName of Object.keys(this.presets)) {
        if (categoryName.startsWith("_")) continue; // Skip _aliases etc.
        const category = this.presets[categoryName];
        if (category && typeof category === "object" && category[name]) {
          return category[name];
        }
      }

      return null;
    },

    // List all preset names (for tests and debugging)
    listPresets() {
      const result = {};
      for (const categoryName of Object.keys(this.presets)) {
        if (categoryName.startsWith("_")) continue;
        const category = this.presets[categoryName];
        if (category && typeof category === "object") {
          result[categoryName] = Object.keys(category);
        }
      }
      return result;
    },

    // Get flat list of all preset names
    getAllPresetNames() {
      const names = [];
      for (const categoryName of Object.keys(this.presets)) {
        if (categoryName.startsWith("_")) continue;
        const category = this.presets[categoryName];
        if (category && typeof category === "object") {
          names.push(...Object.keys(category));
        }
      }
      // Add aliases
      if (this.presets._aliases) {
        names.push(...Object.keys(this.presets._aliases));
      }
      return names.sort();
    },
  };

  // --- Track-level effect integration (lives on hub) ---
  hub.connectEffectChain = function(key, buffer) {
      const chain = this.effectChains.get(key);
      if (!chain) return false;

      // Validate buffer has required WebAudio internals
      const validation = AudioEffects.validateBuffer(buffer, key);
      if (!validation.valid) {
        Logger.warn(`Cannot connect effects for ${key}: ${validation.reason}`);
        Logger.warn("This may indicate plugin conflicts or WebAudio internals changed");
        return false;
      }

      try {
        // Disconnect old connections before reconnecting
        // Wrap in try/catch - nodes may already be disconnected
        try {
          buffer._sourceNode.disconnect();
        } catch (_) {
          Logger.effect(`_reconnectEffectChain: sourceNode already disconnected (expected)`);
        }
        try {
          chain.output.disconnect();
        } catch (_) {
          Logger.effect(`_reconnectEffectChain: chain output already disconnected (expected)`);
        }

        // Connect the new buffer
        buffer._sourceNode.connect(chain.input);
        chain.output.connect(buffer._gainNode);
        Logger.effect(`Connected effect chain for ${key}`);
        return true;
      } catch (error) {
        Logger.error(`Failed to connect effect chain for ${key}: ${error.message}`);
        return false;
      }
  };

  hub._disposeEffectChain = function(key, chain, buffer, options = {}) {
      if (!chain) return;
      const restoreRouting = options.restoreRouting !== false;

      // Best-effort disconnect: WebAudio disconnect() can throw if already disconnected.
      try {
        if (buffer && restoreRouting && buffer._sourceNode && buffer._gainNode) {
          try {
            buffer._sourceNode.disconnect(chain.input);
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: disconnect old routing (source->chain) failed",
              {},
              "disposeEffectChain.disconnectOldRouting.source"
            );
          }
          try {
            chain.output.disconnect(buffer._gainNode);
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: disconnect old routing (chain->gain) failed",
              {},
              "disposeEffectChain.disconnectOldRouting.output"
            );
          }
        }
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: disconnect old routing outer failed",
          {},
          "disposeEffectChain.disconnectOldRouting.outer"
        );
      }

      // Disconnect chain internals.
      try {
        if (chain.input && chain.input.disconnect) chain.input.disconnect();
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: disconnect input failed",
          {},
          "disposeEffectChain.disconnectInput"
        );
      }
      try {
        if (chain.output && chain.output.disconnect) chain.output.disconnect();
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: disconnect output failed",
          {},
          "disposeEffectChain.disconnectOutput"
        );
      }
      try {
        if (chain.wetGain && chain.wetGain.disconnect) chain.wetGain.disconnect();
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: disconnect wetGain failed",
          {},
          "disposeEffectChain.disconnectWetGain"
        );
      }
      try {
        if (chain.dryGain && chain.dryGain.disconnect) chain.dryGain.disconnect();
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: disconnect dryGain failed",
          {},
          "disposeEffectChain.disconnectDryGain"
        );
      }

      if (Array.isArray(chain.nodes)) {
        chain.nodes.forEach((node) => {
          try {
            if (node && node.disconnect) node.disconnect();
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: disconnect node failed",
              {},
              "disposeEffectChain.disconnectNode"
            );
          }
          // Release ConvolverNode internal buffer copy
          try {
            if (node && node.buffer !== undefined) node.buffer = null;
          } catch (_e) {
            // Some nodes don't allow setting buffer to null
          }
        });
        chain.nodes.length = 0;
      }

      if (Array.isArray(chain.oscillators)) {
        chain.oscillators.forEach((osc) => {
          try {
            if (osc && osc.stop) osc.stop();
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: oscillator stop failed",
              {},
              "disposeEffectChain.stopOsc"
            );
          }
          try {
            if (osc && osc.disconnect) osc.disconnect();
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: oscillator disconnect failed",
              {},
              "disposeEffectChain.disconnectOsc"
            );
          }
        });
        // Clear array to help GC and prevent accidental reuse
        chain.oscillators.length = 0;
      }

      // Null out all node references to help GC on older Chromium
      chain.input = null;
      chain.output = null;
      chain.wetGain = null;
      chain.dryGain = null;

      // Restore default routing (source -> gain) if the track is still live.
      try {
        if (buffer && restoreRouting && buffer._sourceNode && buffer._gainNode) {
          try {
            buffer._sourceNode.disconnect();
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: restore routing disconnect failed",
              {},
              "disposeEffectChain.restoreRouting.disconnect"
            );
          }
          try {
            buffer._sourceNode.connect(buffer._gainNode);
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: restore routing connect failed",
              {},
              "disposeEffectChain.restoreRouting.connect"
            );
          }
        }
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: restore routing outer failed",
          {},
          "disposeEffectChain.restoreRouting.outer"
        );
      }

      Logger.effect(`Disposed effect chain nodes for ${key}`);
  };

  hub._setEffectWetMix = function(chain, wetMix) {
      if (!chain || !chain.wetGain || !chain.dryGain) return false;
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      const mix = clamp01(typeof wetMix === "number" && isFinite(wetMix) ? wetMix : 0);

      // Equal-power (sqrt) crossfade to avoid loudness dips at mid-mix.
      // mix=0.5 => wet≈0.707, dry≈0.707 (instead of 0.5/0.5 which often sounds quieter)
      chain._wetMix = mix;
      chain.wetGain.gain.value = Math.sqrt(mix);
      chain.dryGain.gain.value = Math.sqrt(1 - mix);
      return true;
  };

  hub.applyEffect = function(key, effectConfig, params) {
      // Lazy-init: grab context on-demand if init() was called too early
      if (!AudioEffects.context && WebAudio._context) {
        AudioEffects.context = WebAudio._context;
        Logger.info("AudioEffects: Late-initialized context");
      }
      if (!AudioEffects.context) {
        Logger.warn(`Cannot apply effect to ${key}: WebAudio context not ready`);
        return false;
      }

      // B10: any direct effect application supersedes a pending crossfade for
      // this key, so bump the generation token to abort its mid-point timeout.
      if (!this._effectCrossfadeGen) this._effectCrossfadeGen = new Map();
      this._effectCrossfadeGen.set(key, (this._effectCrossfadeGen.get(key) || 0) + 1);

      // Clean up existing effect chain if present
      if (this.effectChains.has(key)) {
        this.clearEffect(key);
      }

      let effects;
      // Strip 'preset:' prefix if present to support documented syntax
      let lookupKey = effectConfig;
      if (typeof effectConfig === "string" && effectConfig.startsWith("preset:")) {
        lookupKey = effectConfig.substring(7); // Remove 'preset:' prefix
      }

      // Look up preset using getPreset() which handles nested categories and aliases
      const presetEffects =
        typeof lookupKey === "string" ? AudioEffects.getPreset(lookupKey) : null;
      if (presetEffects) {
        effects = presetEffects;
        Logger.effect(`Applying preset '${lookupKey}' to ${key}`);
      } else if (Array.isArray(effectConfig)) {
        effects = effectConfig;
      } else {
        const knownEffectTypes = {
          reverb: true,
          lowpass: true,
          highpass: true,
          bandpass: true,
          distortion: true,
          overdrive: true,
          bitcrusher: true,
          compressor: true,
          delay: true,
          multitap: true,
          tremolo: true,
          vibrato: true,
          chorus: true,
          phaser: true,
          flanger: true,
          widener: true,
          eq3: true,
          ringmod: true,
          autopan: true,
        };

        if (typeof effectConfig === "string" && !knownEffectTypes[effectConfig]) {
          Logger.warn(`Unknown effect preset/type '${effectConfig}' for ${key}`);
          return false;
        }

        // Single effect with parameters
        const effect = { type: effectConfig };

        // Parameter mapping per effect type
        const paramMaps = {
          reverb: ["duration", "decay", "wet"],
          lowpass: ["frequency", "resonance"],
          highpass: ["frequency", "resonance"],
          bandpass: ["frequency", "resonance"],
          distortion: ["amount"],
          bitcrusher: ["bits", "normfreq"],
          compressor: ["threshold", "knee", "ratio", "attack", "release"],
          delay: ["delay", "feedback", "wet"],
          chorus: ["wet"],
          tremolo: ["rate", "depth", "shape"],
          vibrato: ["rate", "depth", "shape"],
          phaser: ["rate", "depth", "stages", "frequency"],
          flanger: ["rate", "depth", "feedback"],
          widener: ["width"],
          eq3: ["low", "mid", "high", "midFreq"],
          ringmod: ["speed", "mix"],
          autopan: ["speed", "depth"],
          convolver: ["url"],
          multitap: ["tap1", "tap2", "tap3", "tap4", "tap5", "tap6"],
          overdrive: ["drive", "output"],
        };

        const paramNames = paramMaps[effectConfig] || [];

        // Safely process parameters
        if (Array.isArray(params)) {
          params.forEach((param, idx) => {
            if (paramNames[idx] && param !== undefined && param !== null) {
              // Special handling for string parameters
              if (paramNames[idx] === "shape") {
                effect[paramNames[idx]] = String(param);
              } else {
                const numValue = Number(param);
                if (!isNaN(numValue)) {
                  effect[paramNames[idx]] = numValue;
                }
              }
            }
          });
        }
        effects = [effect];
      }

      // Determine wet/dry mix from effect metadata (optional)
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      let wetMix = 0.35; // sensible default

      // Priority: explicit wetMix on any effect, else first numeric "wet"
      const mixSource = effects.find((e) => e && typeof e === "object" && e.wetMix !== undefined);
      if (mixSource && typeof mixSource.wetMix === "number" && !isNaN(mixSource.wetMix)) {
        wetMix = mixSource.wetMix;
      } else {
        const wetSource = effects.find((e) => e && typeof e === "object" && e.wet !== undefined);
        if (wetSource && typeof wetSource.wet === "number" && !isNaN(wetSource.wet)) {
          wetMix = wetSource.wet;
        }
      }
      wetMix = clamp01(wetMix);

      const chain = AudioEffects.createEffectChain(effects);
      if (chain) {
        chain._targetWetMix = wetMix;
        this._setEffectWetMix(chain, wetMix);
        this.effectChains.set(key, chain);

        const buffer = this.tracks.get(key);
        if (buffer) {
          this.connectEffectChain(key, buffer);
          // Persist the chosen effect on the buffer so save/resume/listall stay accurate.
          const effectKeyToStore =
            typeof effectConfig === "string"
              ? effectConfig
              : typeof lookupKey === "string"
                ? lookupKey
                : effectConfig;
          buffer._effect = effectKeyToStore;
          // Keep paused snapshot (if any) in sync to avoid stale reloads.
          if (this.pausedSnapshots && this.pausedSnapshots.has(key)) {
            const snap = this.pausedSnapshots.get(key);
            if (snap) snap.effect = effectKeyToStore;
          }
        }

        Logger.effect(`Applied effects to ${key}`, effects);
        return true;
      }

      return false;
  };

  hub.fadeEffect = function(key, effectConfig, params, fadeInDuration) {
      // Validate parameters
      if (!params) params = [];
      if (!fadeInDuration || isNaN(fadeInDuration)) fadeInDuration = 2;

      // Don't slice params - caller already extracted duration separately
      if (!this.applyEffect(key, effectConfig, params)) {
        return false;
      }

      const chain = this.effectChains.get(key);
      if (!chain) return false;

      // Start with no effect (full dry)
      const targetWetMix =
        typeof chain._targetWetMix === "number" && isFinite(chain._targetWetMix)
          ? chain._targetWetMix
          : 1;
      this._setEffectWetMix(chain, 0);

      Logger.info(`Starting effect fade-in for ${key}: ${effectConfig} over ${fadeInDuration}s`);

      // Fade in the effect
      FadeManager.startFade(
        `${key}_effectWet`,
        0,
        targetWetMix,
        fadeInDuration,
        (value) => {
          this._setEffectWetMix(chain, value);
        },
        () => {
          Logger.success(`Effect fade-in complete for ${key}: ${effectConfig}`);
        }
      );

      return true;
  };

  hub.fadeOutEffect = function(key, fadeOutDuration) {
      const chain = this.effectChains.get(key);
      if (!chain) return false;

      // Store reference to identify this specific chain later
      const originalChain = chain;

      Logger.info(`Starting effect fade-out for ${key} over ${fadeOutDuration}s`);

      FadeManager.startFade(
        `${key}_effectWet`,
        typeof chain._wetMix === "number" && isFinite(chain._wetMix)
          ? chain._wetMix
          : chain.wetGain && chain.wetGain.gain
            ? Math.max(0, Math.min(1, chain.wetGain.gain.value * chain.wetGain.gain.value))
            : 1,
        0,
        fadeOutDuration,
        (value) => {
          const currentChain = this.effectChains.get(key);
          // Only update if this is still the same chain we started fading
          if (!currentChain || currentChain !== originalChain) return;
          this._setEffectWetMix(currentChain, value);
        }
      );

      // Use setTimeout for critical cleanup instead of fade callback
      // This ensures cleanup happens even if fade is cancelled by another operation
      const timeoutId = setTimeout(() => {
        const currentChain = this.effectChains.get(key);
        // Only cleanup if this is still the same chain we started fading
        if (!currentChain || currentChain !== originalChain) {
          Logger.info(`Effect fade-out cleanup skipped - effect was replaced for ${key}`);
          return;
        }

        const buffer = this.tracks.get(key);
        this._disposeEffectChain(key, currentChain, buffer);
        this.effectChains.delete(key);
        Logger.success(`Effect fade-out complete for ${key}`);

        // Remove timeout from tracking
        if (this.activeTimeouts.has(key)) {
          const timeouts = this.activeTimeouts.get(key);
          const index = timeouts.indexOf(timeoutId);
          if (index > -1) timeouts.splice(index, 1);
          if (timeouts.length === 0) this.activeTimeouts.delete(key);
        }
      }, fadeOutDuration * 1000);

      // Track this timeout for cleanup
      if (!this.activeTimeouts.has(key)) {
        this.activeTimeouts.set(key, []);
      }
      this.activeTimeouts.get(key).push(timeoutId);

      return true;
  };

  hub.crossFadeEffect = function(key, oldEffect, newEffect, duration, curve = "smooth", newEffectParams = []) {
      Logger.info(
        `Starting effect cross-fade for ${key}: ${oldEffect} -> ${newEffect} over ${duration}s with curve ${curve}`
      );

      // B10: generation token per key. Each crossfade (or effect swap) bumps the
      // token so a superseded crossfade's mid-point timeout aborts instead of
      // clobbering the newer effect chain. fadeOutEffect's own guard already
      // covers the intra-crossfade ordering; this covers *interleaved* commands.
      if (!this._effectCrossfadeGen) this._effectCrossfadeGen = new Map();
      const gen = (this._effectCrossfadeGen.get(key) || 0) + 1;
      this._effectCrossfadeGen.set(key, gen);

      // Start fade out of old effect
      this.fadeOutEffect(key, duration / 2);

      // After half duration, start new effect
      const timeoutId = setTimeout(
        () => {
          // B10: bail if a newer crossfade/effect superseded this one.
          if (this._effectCrossfadeGen.get(key) !== gen) {
            Logger.info(`Effect cross-fade for ${key} superseded — skipping new effect apply`);
            if (this.activeTimeouts.has(key)) {
              const timeouts = this.activeTimeouts.get(key);
              const idx = timeouts.indexOf(timeoutId);
              if (idx > -1) timeouts.splice(idx, 1);
              if (timeouts.length === 0) this.activeTimeouts.delete(key);
            }
            return;
          }

          // Check if track still exists before applying new effect
          if (!this.tracks.has(key)) {
            Logger.warn(`Effect cross-fade cancelled - track ${key} no longer exists`);
            return;
          }

          // applyEffect (via fadeEffect) clears any lingering chain internally, and
          // fadeOutEffect's cleanup timeout guards on chain identity, so applying
          // the new effect here is safe regardless of which timer fired first.
          this.fadeEffect(key, newEffect, newEffectParams, duration / 2);
          Logger.success(`Effect cross-fade complete for ${key}: ${oldEffect} -> ${newEffect}`);

          // Remove timeout from tracking
          if (this.activeTimeouts.has(key)) {
            const timeouts = this.activeTimeouts.get(key);
            const index = timeouts.indexOf(timeoutId);
            if (index > -1) timeouts.splice(index, 1);
            if (timeouts.length === 0) this.activeTimeouts.delete(key);
          }
        },
        (duration / 2) * 1000
      );

      // Track this timeout for cleanup
      if (!this.activeTimeouts.has(key)) {
        this.activeTimeouts.set(key, []);
      }
      this.activeTimeouts.get(key).push(timeoutId);

      return true;
  };

  hub.clearEffect = function(key, options = {}) {
      if (!this.effectChains.has(key)) return false;

      const chain = this.effectChains.get(key);
      const buffer = this.tracks.get(key);

      this._disposeEffectChain(key, chain, buffer);
      this.effectChains.delete(key);
      FadeManager.cancelFade(`${key}_effectWet`);

      // Optionally clear the persisted effect config for resume/save.
      const keepConfig = options.keepConfig !== false;
      if (!keepConfig) {
        if (buffer) buffer._effect = null;
        const snapshot = this.pausedSnapshots.get(key);
        if (snapshot) snapshot.effect = null;
      }

      Logger.effect(`Cleared effects from ${key}`);
      return true;
  };

  // --- Public script API ---
    /**
     * Apply an effect preset to a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {string} preset - Effect preset name (e.g., 'underwater', 'cave', 'phone')
     * @param {array} params - Additional effect parameters
     * @returns {boolean} Success
     */
  hub.setEffect = function(type, trackId = 1, preset, params = []) {
      const key = `${type}_${trackId}`;
      return this.applyEffect(key, preset, params);
  };

    /**
     * Fade in an effect on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {string} preset - Effect preset name
     * @param {number} duration - Fade-in duration in seconds (default 2)
     * @param {array} params - Additional effect parameters
     * @returns {boolean} Success
     */
  hub.fadeInEffect = function(type, trackId = 1, preset, duration = 2, params = []) {
      const key = `${type}_${trackId}`;
      return this.fadeEffect(key, preset, params, duration);
  };

    /**
     * Fade out the current effect on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {number} duration - Fade-out duration in seconds (default 2)
     * @returns {boolean} Success
     */
  hub.fadeOutEffectOnTrack = function(type, trackId = 1, duration = 2) {
      const key = `${type}_${trackId}`;
      return this.fadeOutEffect(key, duration);
  };

    /**
     * Crossfade between effects on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {string} fromPreset - Current effect preset
     * @param {string} toPreset - Target effect preset
     * @param {number} duration - Crossfade duration in seconds (default 3)
     * @param {array} params - Parameters for new effect
     * @returns {boolean} Success
     */
  hub.crossfadeEffects = function(type, trackId = 1, fromPreset, toPreset, duration = 3, params = []) {
      const key = `${type}_${trackId}`;
      return this.crossFadeEffect(key, fromPreset, toPreset, duration, "smooth", params);
  };

    /**
     * Clear all effects from a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @returns {boolean} Success
     */
  hub.removeEffect = function(type, trackId = 1) {
      const key = `${type}_${trackId}`;
      return this.clearEffect(key, { keepConfig: false });
  };

  // Register command handlers (overwrite Core's soft stubs)
  hub.registerHandler("effect", function (cmd) {
    return this.applyEffect(`${cmd.type}_${cmd.trackId}`, cmd.args[0], cmd.args.slice(1));
  });
  hub.registerHandler("fadeeffect", function (cmd) {
    const args = cmd.args;
    if (args.length === 0) {
      Logger.warn("No effect specified for fadeeffect command");
      return false;
    }
    let fadeEffectParams, fadeInDuration;
    if (args.length === 1) {
      fadeEffectParams = [];
      fadeInDuration = 2;
    } else {
      fadeEffectParams = args.slice(1, -1);
      fadeInDuration = Number(args[args.length - 1]);
      if (isNaN(fadeInDuration)) {
        fadeEffectParams = args.slice(1);
        fadeInDuration = 2;
      }
    }
    return this.fadeEffect(`${cmd.type}_${cmd.trackId}`, args[0], fadeEffectParams, fadeInDuration);
  });
  hub.registerHandler("fadeouteffect", function (cmd) {
    return this.fadeOutEffect(`${cmd.type}_${cmd.trackId}`, this.toNum(cmd.args[0], 2));
  });
  hub.registerHandler("cleareffect", function (cmd) {
    return this.clearEffect(`${cmd.type}_${cmd.trackId}`, { keepConfig: false });
  });
  hub.registerHandler("crossfadeeffect", function (cmd) {
    const args = cmd.args;
    return this.crossFadeEffect(
      `${cmd.type}_${cmd.trackId}`,
      args[0],
      args[1],
      this.toNum(args[2], 3),
      "smooth",
      args.slice(3)
    );
  });

  // Teardown: dispose effect graph when Core cleans a track
  hub.onTeardown(function (key) {
    const chain = this.effectChains && this.effectChains.get(key);
    if (!chain) return;
    if (typeof this._disposeEffectChain === "function") {
      this._disposeEffectChain(key, chain, this.tracks.get(key), { restoreRouting: false });
    }
    this.effectChains.delete(key);
    FadeManager.cancelFade(`${key}_effectWet`);
  });

  // Init engine (Core may have already run init before this plugin loaded)
  AudioEffects.init();
  window.AudioEffects = AudioEffects;
  hub.AudioEffects = AudioEffects;

  Logger.success(TAG + " loaded — effect commands and AudioEffects ready");
})();


/* ---- FugsAudio3Spatial.js ---- */

(() => {
  const TAG = "[FugsAudio3Spatial]";
  if (!window.FugsAudio) {
    console.error(TAG + " FugsMultiTrackAudioEX (or FugsAudio1Core) must be ON and ABOVE this plugin.");
    return;
  }
  const hub = window.FugsAudio;
  const Logger = hub.Logger || {
    info: (...a) => console.log("[FugsAudio]", ...a),
    warn: (...a) => console.warn("[FugsAudio]", ...a),
    error: (...a) => console.error("[FugsAudio]", ...a),
    success: (...a) => console.log("[FugsAudio]", ...a),
    effect: (...a) => console.log("[FugsAudio:effect]", ...a),
    debug: () => {},
    debugOnce: () => {},
    switch: () => {},
  };
  const FadeManager = hub.FadeManager || window.FadeManager;
  if (!FadeManager) {
    console.error(TAG + " FadeManager missing — aborting.");
    return;
  }
  const AUDIO_CONSTANTS = hub.AUDIO_CONSTANTS;
  if (!AUDIO_CONSTANTS) {
    console.error(TAG + " AUDIO_CONSTANTS missing — aborting.");
    return;
  }
  const DefaultDopplerScale =
    hub.config && hub.config.defaultDopplerScale != null ? hub.config.defaultDopplerScale : 1.0;

  // Distance Curve Functions
  const DistanceCurves = {
    linear(distance, maxDistance) {
      if (maxDistance <= 0) return 0; // Prevent division by zero
      // Volume drops at a constant rate until it hits 0
      return Math.max(0, 1 - distance / maxDistance);
    },

    exponential(distance, maxDistance) {
      if (maxDistance <= 0) return 0; // Prevent division by zero
      // Normalizes distance, then squares 1 - normalized, giving a gentle start (almost 1) and a steeper drop near the far edge-classic "quadratic falloff".
      const normalized = distance / maxDistance;
      return Math.max(0, Math.pow(1 - normalized, 2));
    },

    logarithmic(distance, maxDistance) {
      if (maxDistance <= 0) return 0; // Prevent division by zero
      //  Uses 1 - sqrt(normalized); that creates a quick early drop that levels off near the end (the inverse of exponential).
      const normalized = distance / maxDistance;
      return Math.max(0, 1 - Math.sqrt(normalized));
    },

    smooth(distance, maxDistance) {
      if (maxDistance <= 0) return 0; // Prevent division by zero
      // Clamps the normalized value to [0,1], then applies the smoothstep polynomial 3x^2 - 2x^3 (inverted by subtracting from 1). That produces a fade that eases in/out symmetrically with zero slope at both ends.
      const normalized = Math.min(distance / maxDistance, 1);
      return Math.max(
        0,
        1 -
          (AUDIO_CONSTANTS.SMOOTHSTEP_A * normalized * normalized -
            AUDIO_CONSTANTS.SMOOTHSTEP_B * normalized * normalized * normalized)
      );
    },

    sharp(distance, maxDistance) {
      if (maxDistance <= 0) return 0; // Prevent division by zero
      // Same as exponential but cubed: Math.pow(1 - normalized, 3) so it stays near 1 longer and then falls off very quickly near the end.
      const normalized = distance / maxDistance;
      return Math.max(0, Math.pow(1 - normalized, 3));
    },

    gentle(distance, maxDistance) {
      if (maxDistance <= 0) return 0;
      const n = distance / maxDistance;
      // Soft initial drop, gradual tail
      return Math.max(0, 1 - Math.pow(n, 0.25));
    },

    custom(distance, maxDistance, points) {
      // Accept either a flat array [x,y,x,y,...] or an array of pairs [[x,y],...]
      if (!Array.isArray(points) || points.length < 4) {
        return this.linear(distance, maxDistance);
      }

      if (maxDistance <= 0 || !isFinite(distance)) return 0;

      // Collect numeric pairs and coerce strings/numbers into Number
      const pairs = [];
      if (Array.isArray(points[0])) {
        for (const p of points) {
          if (!Array.isArray(p) || p.length < 2) continue;
          const x = Number(p[0]);
          const y = Number(p[1]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          pairs.push([x, y]);
        }
      } else {
        for (let i = 0; i + 1 < points.length; i += 2) {
          const x = Number(points[i]);
          const y = Number(points[i + 1]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          pairs.push([x, y]);
        }
      }

      if (pairs.length < 2) return this.linear(distance, maxDistance);

      // If points were given in absolute distances (x > 1), normalize them
      const normalizedPairs = pairs.map(([x, y]) => {
        let nx = Number(x);
        if (nx > 1) nx = nx / maxDistance; // treat as raw distance
        nx = Math.max(0, Math.min(1, nx));
        let ny = Number(y);
        ny = Math.max(0, Math.min(1, ny));
        return [nx, ny];
      });

      // Sort by x
      normalizedPairs.sort((a, b) => a[0] - b[0]);

      const normalized = Math.min(Math.max(distance / maxDistance, 0), 1);

      // Clamp to end points if outside range
      if (normalized <= normalizedPairs[0][0]) return normalizedPairs[0][1];
      if (normalized >= normalizedPairs[normalizedPairs.length - 1][0])
        return normalizedPairs[normalizedPairs.length - 1][1];

      for (let i = 0; i < normalizedPairs.length - 1; i++) {
        const [x1, y1] = normalizedPairs[i];
        const [x2, y2] = normalizedPairs[i + 1];
        if (normalized >= x1 && normalized <= x2) {
          if (x2 === x1) return y1; // avoid div/0
          const t = (normalized - x1) / (x2 - x1);
          return y1 + (y2 - y1) * t;
        }
      }

      // fallback
      return 0;
    },
  };

  if (!hub.proximityData) hub.proximityData = new Map();
  if (!hub.panSweeps) hub.panSweeps = new Map();
  if (!hub.proximityErrors) hub.proximityErrors = new Set();

  hub.parseProximityConfig = function(str) {
      // Flexible parser that supports nested arrays/objects and quoted strings.
      const trimmed = String(str || "").trim();

      if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
        throw new Error("Config must be wrapped in braces: {key:value, ...}");
      }

      const inner = trimmed.slice(1, -1).trim();
      if (!inner) {
        // Allow empty object -> empty config
        return {};
      }

      // Split top-level tokens respecting nested braces/brackets and quoted strings
      function splitTopLevel(s, delim) {
        const parts = [];
        let depth = 0;
        let inSingle = false;
        let inDouble = false;
        let start = 0;
        for (let i = 0; i < s.length; i++) {
          const ch = s[i];
          if (ch === "'" && !inDouble) inSingle = !inSingle;
          if (ch === '"' && !inSingle) inDouble = !inDouble;
          if (!inSingle && !inDouble) {
            if (ch === "{" || ch === "[") depth++;
            else if (ch === "}" || ch === "]") depth--;
            else if (ch === delim && depth === 0) {
              parts.push(s.slice(start, i).trim());
              start = i + 1;
            }
          }
        }
        parts.push(s.slice(start).trim());
        return parts.filter(Boolean);
      }

      function parseValue(v) {
        if (typeof v !== "string") return v;
        const s = v.trim();
        if (!s) return s;
        // Quoted string
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
          return s.slice(1, -1);
        }
        // Array
        if (s.startsWith("[") && s.endsWith("]")) {
          const innerArr = s.slice(1, -1).trim();
          if (!innerArr) return [];
          const items = splitTopLevel(innerArr, ",");
          return items.map(parseValue);
        }
        // Object
        if (s.startsWith("{") && s.endsWith("}")) {
          const out = {};
          const innerObj = s.slice(1, -1).trim();
          if (!innerObj) return out;
          const pairs = splitTopLevel(innerObj, ",");
          for (const p of pairs) {
            const kv = splitTopLevel(p, ":");
            if (kv.length < 2) continue;
            const key = kv.shift().trim();
            const val = kv.join(":").trim();
            if (!key) continue;
            out[key] = parseValue(val);
          }
          return out;
        }
        // Boolean
        if (s === "true") return true;
        if (s === "false") return false;
        // Number
        if (/^-?\d+(?:\.\d+)?$/.test(s)) {
          const num = Number(s);
          return Number.isNaN(num) ? s : num;
        }
        // Unquoted token fallback
        return s;
      }

      const config = {};
      const pairs = splitTopLevel(inner, ",");
      for (const pair of pairs) {
        const kv = splitTopLevel(pair, ":");
        if (kv.length < 2) {
          throw new Error(`Invalid key:value pair: "${pair}"`);
        }
        const key = kv.shift().trim();
        const valStr = kv.join(":").trim();
        if (!key) throw new Error(`Empty key in pair: "${pair}"`);
        config[key] = parseValue(valStr);
      }

      return config;
    };

  hub.setupProximitySource = function(key, config) {
      if (!config || typeof config !== "object") {
        Logger.error(`Invalid proximity config for ${key}: config must be an object`);
        return false;
      }

      // Safely parse custom points if provided as string
      let customPoints = config.points;
      if (typeof config.points === "string") {
        try {
          customPoints = JSON.parse(config.points);
        } catch (e) {
          Logger.warn(`Invalid JSON for proximity points: ${config.points}`, e);
          customPoints = undefined;
        }
      }

      const proximityConfig = {
        x: config.x,
        y: config.y,
        eventId: config.event != null ? parseInt(config.event, 10) : undefined,
        followPlayer: config.player,
        maxDistance:
          config.maxDistance !== undefined && config.maxDistance !== null
            ? config.maxDistance
            : AUDIO_CONSTANTS.DEFAULT_PROXIMITY_MAX_DISTANCE,
        minVolume:
          config.minVolume !== undefined && config.minVolume !== null
            ? config.minVolume
            : AUDIO_CONSTANTS.DEFAULT_PROXIMITY_MIN_VOLUME,
        curve: config.curve || "linear",
        customPoints: customPoints,
        enablePan: config.pan === true,
        doppler: config.doppler === true,
        dopplerScale:
          config.dopplerScale !== undefined && config.dopplerScale !== null
            ? config.dopplerScale
            : DefaultDopplerScale,
        // Doppler smoothing: 0 = instant response, 1 = very slow response (default 0.8)
        dopplerSmoothing:
          config.dopplerSmoothing !== undefined && config.dopplerSmoothing !== null
            ? Math.max(
                AUDIO_CONSTANTS.DOPPLER_SMOOTHING_MIN,
                Math.min(AUDIO_CONSTANTS.DOPPLER_SMOOTHING_MAX, config.dopplerSmoothing)
              )
            : AUDIO_CONSTANTS.DEFAULT_DOPPLER_SMOOTHING,
        lastDistance: null, // For doppler calculation
      };

      this.proximityData.set(key, proximityConfig);
      Logger.info(`Setup proximity source for ${key}`, proximityConfig);
      return true;
    };

  hub.updateProximityVolume = function() {
      // Safety checks — use typeof so missing globals don't throw ReferenceError
      if (typeof $gamePlayer === "undefined" || !$gamePlayer) return;
      if (typeof $dataMap === "undefined" || !$dataMap) return;
      if (typeof $gameMap === "undefined" || !$gameMap) return;

      const playerX = $gamePlayer.x;
      const playerY = $gamePlayer.y;

      for (const [key, config] of this.proximityData.entries()) {
        const buffer = this.tracks.get(key);
        if (!buffer) continue;

        let sourceX, sourceY;

        if (config.followPlayer) {
          sourceX = playerX;
          sourceY = playerY;
        } else if (config.eventId) {
          try {
            // Validate event ID
            if (!Number.isInteger(config.eventId) || config.eventId < 1) {
              // Log once per key to avoid spam in update loop
              const errorKey = `${key}_invalid_id`;
              if (!this.proximityErrors.has(errorKey)) {
                Logger.warn(`Proximity audio ${key}: Invalid event ID ${config.eventId}`);
                this.proximityErrors.add(errorKey);
              }
              continue;
            }

            const event = $dataMap.events[config.eventId];
            if (event) {
              const gameEvent = $gameMap.event(config.eventId);
              if (gameEvent) {
                sourceX = gameEvent._realX; // Use real coordinates for smooth updates
                sourceY = gameEvent._realY;
              } else {
                // Log once per key
                const errorKey = `${key}_no_game_event`;
                if (!this.proximityErrors.has(errorKey)) {
                  Logger.warn(`Proximity audio ${key}: Event ${config.eventId} not found on map`);
                  this.proximityErrors.add(errorKey);
                }
                continue;
              }
            } else {
              // Log once per key
              const errorKey = `${key}_no_data_event`;
              if (!this.proximityErrors.has(errorKey)) {
                Logger.warn(`Proximity audio ${key}: Event ${config.eventId} not in map data`);
                this.proximityErrors.add(errorKey);
              }
              continue;
            }
          } catch (error) {
            // Log once per key
            const errorKey = `${key}_exception`;
            if (!this.proximityErrors.has(errorKey)) {
              Logger.error(`Proximity audio ${key}: ${error.message}`);
              this.proximityErrors.add(errorKey);
            }
            continue;
          }
        } else {
          sourceX = config.x || 0;
          sourceY = config.y || 0;
        }

        // Use player's real coordinates for smooth updates
        const targetX = $gamePlayer._realX;
        const targetY = $gamePlayer._realY;

        // Optimization: Skip if positions unchanged (and not using doppler)
        if (
          !config.doppler &&
          config.lastSourceX === sourceX &&
          config.lastSourceY === sourceY &&
          config.lastTargetX === targetX &&
          config.lastTargetY === targetY
        ) {
          continue;
        }

        config.lastSourceX = sourceX;
        config.lastSourceY = sourceY;
        config.lastTargetX = targetX;
        config.lastTargetY = targetY;

        const distance = Math.sqrt(Math.pow(targetX - sourceX, 2) + Math.pow(targetY - sourceY, 2));

        // Doppler Effect
        if (config.doppler) {
          if (typeof config.lastDistance === "number" && !isNaN(config.lastDistance)) {
            // Calculate rate of change (velocity relative to listener)
            const deltaDistance = distance - config.lastDistance;

            // Validate deltaDistance isn't NaN or Infinity
            if (!isNaN(deltaDistance) && isFinite(deltaDistance)) {
              // Apply smoothing to the delta to avoid jitter
              // If we just started (lastDistance was null), delta is 0

              // Scale factor:
              // deltaDistance is units per frame.
              // Walking speed is approx 0.1-0.2 units/frame.
              // We want a noticeable pitch shift.
              // Approaching (negative delta) -> Higher pitch (> 1.0)
              // Receding (positive delta) -> Lower pitch (< 1.0)

              const rawPitchShift = deltaDistance * config.dopplerScale * -1.0;

              // Target doppler pitch
              const targetDoppler = 1.0 + rawPitchShift;

              // Smoothly interpolate current doppler pitch towards target
              // This acts as a low-pass filter for the pitch
              // Higher smoothing = slower response (configurable via dopplerSmoothing)
              const smoothing = config.dopplerSmoothing;
              const currentDoppler = buffer._dopplerPitch || 1.0;

              buffer._dopplerPitch = currentDoppler * smoothing + targetDoppler * (1 - smoothing);

              // Clamp to reasonable limits (0.5x to 2.0x)
              buffer._dopplerPitch = Math.max(0.5, Math.min(2.0, buffer._dopplerPitch));
            }
          } else {
            buffer._dopplerPitch = 1.0;
          }

          this.updateTrackPitch(buffer);
          config.lastDistance = distance;
        }

        // Calculate volume using selected curve
        let volumeMultiplier;
        if (config.curve === "custom" && config.customPoints) {
          volumeMultiplier = DistanceCurves.custom(
            distance,
            config.maxDistance,
            config.customPoints
          );
        } else {
          const curveFunc = DistanceCurves[config.curve] || DistanceCurves.linear;
          volumeMultiplier = curveFunc(distance, config.maxDistance);
        }

        // Skip proximity volume control if a fade is in progress for this track
        // This prevents proximity from overriding crossfades and other volume animations
        const volumeFadeKey = `${key}_volume`;
        if (!FadeManager.activeFades.has(volumeFadeKey)) {
          const baseVolumeCandidate =
            buffer._manualVolume !== undefined && buffer._manualVolume !== null
              ? buffer._manualVolume
              : buffer._originalVolume;
          const baseVolume =
            typeof baseVolumeCandidate === "number" && isFinite(baseVolumeCandidate)
              ? baseVolumeCandidate
              : 1;
          const finalVolume = Math.max(
            config.minVolume,
            Math.min(1, volumeMultiplier * baseVolume)
          );
          buffer.volume = finalVolume;
        }

        // Pan based on direction if enabled
        // Skip proximity pan control if a pan fade is in progress
        const panFadeKey = `${key}_pan`;
        if (
          config.enablePan &&
          !config.followPlayer &&
          config.maxDistance > 0 &&
          !FadeManager.activeFades.has(panFadeKey)
        ) {
          const deltaX = sourceX - targetX;
          const panValue = Math.max(-1, Math.min(1, deltaX / config.maxDistance));
          buffer.pan = panValue;
        }
      }
    };

  hub.startPanSweep = function(type, trackId, minPan, maxPan, totalDuration, loops, curve = "smooth") {
      const key = `${type}_${trackId}`;
      const buffer = this.tracks.get(key);

      if (!buffer) {
        Logger.error(`No audio found to pansweep for ${type}${trackId}`);
        return false;
      }

      // Normalize and clamp pans from -100..100 -> -1..1
      const min = Math.max(-1, Math.min(1, (isNaN(minPan) ? -100 : minPan) / 100));
      const max = Math.max(-1, Math.min(1, (isNaN(maxPan) ? 100 : maxPan) / 100));
      const duration = Math.max(0.01, isNaN(totalDuration) ? 4 : totalDuration);
      const halfDuration = duration / 2;
      const remainingHalves = loops && loops > 0 ? loops * 2 : Infinity;

      // Stop any existing sweep on this track
      this.stopPanSweep(type, trackId);

      const sweep = {
        min,
        max,
        halfDuration,
        remainingHalves,
        curve,
        direction: 1,
        hasStarted: false,
      };

      this.panSweeps.set(key, sweep);

      Logger.info(`Starting pan sweep for ${key}`, {
        minPan: minPan,
        maxPan: maxPan,
        totalDuration: duration,
        loops,
        curve,
      });

      const runHalf = () => {
        const s = this.panSweeps.get(key);
        if (!s) return;

        // For first sweep iteration, start from current position to avoid jump
        let from, to;
        if (!s.hasStarted) {
          const buf = this.tracks.get(key);
          const currentPan = buf ? buf.pan : 0;
          from = currentPan;
          to = s.direction > 0 ? s.max : s.min;
          s.hasStarted = true;
        } else {
          from = s.direction > 0 ? s.min : s.max;
          to = s.direction > 0 ? s.max : s.min;
        }

        FadeManager.startFade(
          `${key}_pan`,
          from,
          to,
          s.halfDuration,
          (value) => {
            const buf = this.tracks.get(key);
            if (!buf) return; // track stopped while sweeping
            buf.pan = Math.max(-1, Math.min(1, value));
          },
          () => {
            const s2 = this.panSweeps.get(key);
            if (!s2) return; // sweep was cancelled

            if (s2.remainingHalves !== Infinity) {
              s2.remainingHalves -= 1;
              if (s2.remainingHalves <= 0) {
                this.stopPanSweep(type, trackId);
                return;
              }
            }

            s2.direction *= -1;
            runHalf();
          },
          s.curve || curve
        );
      };

      runHalf();
      return true;
    };

  hub.stopPanSweep = function(type, trackId) {
      const key = `${type}_${trackId}`;
      if (this.panSweeps.has(key)) {
        this.panSweeps.delete(key);
        FadeManager.cancelFade(`${key}_pan`);
        Logger.info(`Stopped pan sweep for ${key}`);
        return true;
      }
      return false;
    };

  hub.setProximity = function(type, trackId = 1, options = {}) {
      const opts = options || {};
      const key = `${type}_${trackId}`;
      const config = {
        event: opts.event,
        x: opts.x,
        y: opts.y,
        maxDistance: opts.maxDistance != null ? opts.maxDistance : 10,
        minVolume: opts.minVolume != null ? opts.minVolume : 0,
        curve: opts.curve != null ? opts.curve : "linear",
        pan: opts.pan != null ? opts.pan : false,
        doppler: opts.doppler != null ? opts.doppler : false,
        dopplerScale: opts.dopplerScale != null ? opts.dopplerScale : DefaultDopplerScale,
        dopplerSmoothing: opts.dopplerSmoothing != null ? opts.dopplerSmoothing : 0.8,
        points: opts.points,
      };
      this.setupProximitySource(key, config);
      return true;
    };

  hub.clearProximity = function(type, trackId = 1) {
      const key = `${type}_${trackId}`;
      this.proximityData.delete(key);
      Logger.info(`Cleared proximity for ${key}`);
      return true;
    };

  hub.sweepPan = function(type, trackId = 1, options = {}) {
      const opts = options || {};
      return this.startPanSweep(
        type,
        String(trackId),
        opts.minPan != null ? opts.minPan : -100,
        opts.maxPan != null ? opts.maxPan : 100,
        opts.duration != null ? opts.duration : 3,
        opts.loops != null ? opts.loops : 0,
        opts.curve != null ? opts.curve : "smooth"
      );
    };

  hub.stopSweepPan = function(type, trackId = 1) {
      return this.stopPanSweep(type, String(trackId));
    };

  if (typeof hub.updateTrackPitch !== "function") hub.updateTrackPitch = function () {};

  hub.registerHandler("proximity", function (cmd) {
    try {
      const config = this.parseProximityConfig(cmd.args.join(" "));
      this.setupProximitySource(cmd.type + "_" + cmd.trackId, config);
      return true;
    } catch (e) {
      Logger.error("Failed to parse proximity config: " + e.message);
      return false;
    }
  });
  hub.registerHandler("doppler", function (cmd) {
    try {
      const dopplerConfig = this.parseProximityConfig(cmd.args.join(" "));
      dopplerConfig.doppler = true;
      this.setupProximitySource(cmd.type + "_" + cmd.trackId, dopplerConfig);
      return true;
    } catch (e) {
      Logger.error("Failed to parse doppler config: " + e.message);
      return false;
    }
  });
  hub.registerHandler("pansweep", function (cmd) {
    const args = cmd.args;
    return this.startPanSweep(
      cmd.type,
      cmd.trackId,
      args[0] !== undefined ? this.toNum(args[0], -100) : -100,
      args[1] !== undefined ? this.toNum(args[1], 100) : 100,
      args[2] !== undefined ? this.toNum(args[2], 3) : 3,
      args[3] !== undefined ? this.toNum(args[3], 0) : 0,
      cmd.curve || args[4] || "smooth"
    );
  });
  hub.registerHandler("stoppansweep", function (cmd) {
    return this.stopPanSweep(cmd.type, cmd.trackId);
  });

  hub.onUpdate(function () {
    // B05/B14: run every frame while proximity is active so event-bound sources
    // update even when the player stands still, and fixed sources track smooth
    // (sub-tile) movement. updateProximityVolume() has a per-key dirty check on
    // _realX/_realY (and always runs when doppler is on), so idle frames are cheap.
    if (this.proximityData && this.proximityData.size > 0 && typeof $gamePlayer !== "undefined" && $gamePlayer) {
      this.updateProximityVolume();
    }
  });

  hub.onTeardown(function (key) {
    if (this.panSweeps && this.panSweeps.has(key)) {
      this.panSweeps.delete(key);
      FadeManager.cancelFade(key + "_pan");
    }
    if (this.proximityData) this.proximityData.delete(key);
    if (this.proximityErrors) {
      const prefix = key + "_";
      const filtered = new Set();
      for (const errorKey of this.proximityErrors) {
        if (!errorKey.startsWith(prefix)) filtered.add(errorKey);
      }
      this.proximityErrors = filtered;
    }
  });

  // B06: persist proximity + pan-sweep config across save/load.
  // proximityConfig / panSweep are flat JSON-serializable objects.
  hub.onCaptureState(function (key) {
    const out = {};
    if (this.proximityData && this.proximityData.has(key)) {
      const cfg = this.proximityData.get(key);
      out.proximity = {
        x: cfg.x,
        y: cfg.y,
        eventId: cfg.eventId,
        followPlayer: cfg.followPlayer,
        maxDistance: cfg.maxDistance,
        minVolume: cfg.minVolume,
        curve: cfg.curve,
        customPoints: cfg.customPoints,
        enablePan: cfg.enablePan,
        doppler: cfg.doppler,
        dopplerScale: cfg.dopplerScale,
        dopplerSmoothing: cfg.dopplerSmoothing,
      };
    }
    if (this.panSweeps && this.panSweeps.has(key)) {
      const s = this.panSweeps.get(key);
      // Convert internal -1..1 / halfDuration back to startPanSweep args.
      out.panSweep = {
        minPan: Math.round((s.min != null ? s.min : -1) * 100),
        maxPan: Math.round((s.max != null ? s.max : 1) * 100),
        duration: (s.halfDuration != null ? s.halfDuration : 2) * 2,
        // 0 = forever (matches startPanSweep: loops<=0 → Infinity halves)
        loops:
          s.remainingHalves === Infinity
            ? 0
            : Math.max(1, Math.ceil((s.remainingHalves || 0) / 2)),
        curve: s.curve || "smooth",
      };
    }
    return Object.keys(out).length ? out : undefined;
  });

  hub.onRestoreState(function (key, ext) {
    if (!ext) return;

    if (ext.proximity) {
      const restored = Object.assign({}, ext.proximity, {
        // Reset transient runtime fields so the first update recomputes cleanly.
        lastDistance: null,
        lastSourceX: undefined,
        lastSourceY: undefined,
        lastTargetX: undefined,
        lastTargetY: undefined,
      });
      this.proximityData.set(key, restored);
      if (typeof this.updateProximityVolume === "function") {
        try {
          this.updateProximityVolume();
        } catch (e) {
          Logger.warn("Proximity restore refresh failed for " + key, {
            error: e && e.message ? e.message : e,
          });
        }
      }
      Logger.info("Restored proximity for " + key, restored);
    }

    if (ext.panSweep && typeof this.startPanSweep === "function" && this.tracks.has(key)) {
      const ps = ext.panSweep;
      const parts = key.split("_");
      const type = parts[0];
      const trackId = parts.slice(1).join("_") || "1";
      try {
        this.startPanSweep(
          type,
          trackId,
          ps.minPan != null ? ps.minPan : -100,
          ps.maxPan != null ? ps.maxPan : 100,
          ps.duration != null ? ps.duration : 4,
          ps.loops != null ? ps.loops : 0,
          ps.curve || "smooth"
        );
        Logger.info("Restored pan sweep for " + key, ps);
      } catch (e) {
        Logger.warn("Pan sweep restore failed for " + key, {
          error: e && e.message ? e.message : e,
        });
      }
    }
  });

  window.DistanceCurves = DistanceCurves;
  hub.DistanceCurves = DistanceCurves;
  Logger.success(TAG + " loaded — proximity / doppler / pansweep ready");
})();


/* ---- FugsAudio4Dynamics.js ---- */

(() => {
  const TAG = "[FugsAudio4Dynamics]";
  if (!window.FugsAudio) {
    console.error(TAG + " FugsMultiTrackAudioEX (or FugsAudio1Core) must be ON and ABOVE this plugin.");
    return;
  }
  const hub = window.FugsAudio;
  const Logger = hub.Logger || {
    info: (...a) => console.log("[FugsAudio]", ...a),
    warn: (...a) => console.warn("[FugsAudio]", ...a),
    error: (...a) => console.error("[FugsAudio]", ...a),
    success: (...a) => console.log("[FugsAudio]", ...a),
    effect: (...a) => console.log("[FugsAudio:effect]", ...a),
    debug: () => {},
    debugOnce: () => {},
    switch: () => {},
  };
  const FadeManager = hub.FadeManager || window.FadeManager;
  if (!FadeManager) {
    console.error(TAG + " FadeManager missing — aborting.");
    return;
  }
  const AUDIO_CONSTANTS = hub.AUDIO_CONSTANTS;
  if (!AUDIO_CONSTANTS) {
    console.error(TAG + " AUDIO_CONSTANTS missing — aborting.");
    return;
  }
  // SwitchBuffer is optional (FugsAudio5Switch may load after Dynamics).
  // Resolve at call time so switch-controlled ducks work once Switch is present.
  function getSwitchBuffer() {
    return hub.SwitchBuffer || window.SwitchBuffer || null;
  }

  if (!hub.sidechainConnections) hub.sidechainConnections = new Map();
  if (!hub.pumpConfig) {
    hub.pumpConfig = { active: false, bpm: 120, depth: 0, shape: "sine", tracks: "all", startTime: 0 };
  }

  hub.ensurePumpNode = function(buffer) {
      if (!buffer || !buffer._gainNode || !buffer._pannerNode) return false;
      if (buffer._pumpGainNode) return true;
      if (!WebAudio._context) return false;

      try {
        // Create pump gain node
        buffer._pumpGainNode = WebAudio._context.createGain();
        buffer._pumpGainNode.gain.value = 1.0;

        // Insert: gainNode -> pumpGainNode -> pannerNode
        // We disconnect gainNode (which connects to pannerNode in standard MV)
        // and insert our node in between.
        try {
          buffer._gainNode.disconnect();
        } catch (_) {
          Logger.debugOnce(
            "ensurePumpNode: gainNode already disconnected",
            {},
            "ensurePumpNode.disconnectGain"
          );
        }
        buffer._gainNode.connect(buffer._pumpGainNode);
        buffer._pumpGainNode.connect(buffer._pannerNode);

        return true;
      } catch (e) {
        Logger.error("Failed to create pump node", e);
        return false;
      }
    };

  hub.updatePump = function() {
      if (!this.pumpConfig.active) return;

      const now = performance.now();
      const elapsed = (now - this.pumpConfig.startTime) / 1000; // seconds
      const beatDuration = 60 / this.pumpConfig.bpm;
      const phase = (elapsed % beatDuration) / beatDuration; // 0 to 1

      let scalar = 1.0;
      const depth = this.pumpConfig.depth;

      if (this.pumpConfig.shape === "heartbeat") {
        // Double pulse: lub-dub
        // Pulse 1: 0.0 - 0.2
        if (phase < 0.2) {
          const p = phase / 0.2;
          // Sine hump 0..PI
          scalar = 1.0 - Math.sin(p * Math.PI) * depth;
        }
        // Pulse 2: 0.3 - 0.5 (smaller)
        else if (phase > 0.3 && phase < 0.5) {
          const p = (phase - 0.3) / 0.2;
          scalar = 1.0 - Math.sin(p * Math.PI) * depth * 0.6;
        }
      } else if (this.pumpConfig.shape === "sine") {
        // Smooth sine duck on the beat
        // cos(0) = 1 (max duck), cos(PI) = -1 (min duck)
        // (cos + 1) / 2 -> 1..0
        const val = (Math.cos(phase * 2 * Math.PI) + 1) / 2;
        scalar = 1.0 - val * depth;
      } else if (this.pumpConfig.shape === "square") {
        // Hard duck for first half
        scalar = phase < 0.5 ? 1.0 - depth : 1.0;
      } else if (this.pumpConfig.shape === "saw") {
        // Ramp up from duck
        scalar = 1.0 - (1.0 - phase) * depth;
      }

      // Apply to tracks
      for (const [key, buffer] of this.tracks.entries()) {
        // Check filter
        const target = (this.pumpConfig.tracks || "all").toLowerCase();
        if (target !== "all") {
          const keyLower = key.toLowerCase();
          const match = target.match(/^(bgm|bgs|me|se)(\d+)?$/);

          if (match) {
            const prefix = match[1] + (match[2] ? `_${match[2]}` : "");
            if (!keyLower.startsWith(prefix)) continue;
          } else if (!keyLower.startsWith(target)) {
            continue;
          }
        }

        if (this.ensurePumpNode(buffer)) {
          buffer._pumpGainNode.gain.value = Math.max(0, Math.min(1, scalar));
        }
      }
    };

  hub.setupSidechain = function(args) {
      try {
        if (!WebAudio._context) {
          Logger.error("Sidechain setup failed: No WebAudio context");
          return false;
        }

        const sourceId = String(args[0]);
        const targetId = String(args[1]);
        const threshold = this.toNum(args[2], 0.5); // RMS threshold (0-1)
        // Clamp ratio >= 1 to prevent division by zero; attack/release >= 0.001 for coefficient math
        const ratio = Math.max(1.0, this.toNum(args[3], 4.0));
        const attack = Math.max(0.001, this.toNum(args[4], 0.01));
        const release = Math.max(0.001, this.toNum(args[5], 0.1));

        const sourceTrack = this.tracks.get(`bgm_${sourceId}`);
        const targetTrack = this.tracks.get(`bgm_${targetId}`);

        if (!sourceTrack || !targetTrack) {
          Logger.warn("Sidechain setup failed: source or target track not found");
          return false;
        }

        // Create analyzer for source (envelope follower)
        const context = WebAudio._context;
        const analyzer = context.createAnalyser();
        analyzer.fftSize = 2048;
        analyzer.smoothingTimeConstant = 0.8;

        // Connect source to analyzer (tap the signal without affecting it)
        if (sourceTrack._gainNode) {
          sourceTrack._gainNode.connect(analyzer);
        }

        // Create analysis buffer
        const bufferLength = analyzer.fftSize;
        const dataArray = new Float32Array(bufferLength);

        // Envelope follower state
        let currentGain = 1.0;
        let lastFrameTime = null; // B11: for real frame-delta envelope timing
        const connectionKey = `${sourceId}_to_${targetId}`;

        // Compute envelope and apply gain reduction
        const processEnvelope = () => {
          try {
            // Get time-domain data (waveform)
            analyzer.getFloatTimeDomainData(dataArray);

            // Calculate RMS (root mean square) energy
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i] * dataArray[i];
            }
            const rms = Math.sqrt(sum / bufferLength);

            // Calculate target gain based on threshold and ratio
            let targetGain = 1.0;
            if (rms > threshold) {
              // Amount over threshold
              const over = rms - threshold;
              // Gain reduction = over / ratio
              const reduction = over / ratio;
              // Target gain = 1 - reduction (but clamped)
              targetGain = Math.max(0.0, 1.0 - reduction);
            }

            // Apply attack/release envelope smoothing.
            // B11: this callback runs once per animation frame (~60 Hz), not per
            // audio sample. Use the real elapsed time between frames (dt) so the
            // attack/release args behave as documented seconds instead of being
            // divided by sampleRate (which made them ~1000x too slow).
            const now = context.currentTime;
            const dt = lastFrameTime != null
              ? Math.max(0.001, Math.min(0.1, now - lastFrameTime))
              : 1 / 60;
            lastFrameTime = now;
            const attackCoeff = Math.exp(-dt / attack);
            const releaseCoeff = Math.exp(-dt / release);

            if (targetGain < currentGain) {
              // Attack (gain reduction)
              currentGain = targetGain + attackCoeff * (currentGain - targetGain);
            } else {
              // Release (gain restoration)
              currentGain = targetGain + releaseCoeff * (currentGain - targetGain);
            }

            // Apply gain to target track
            if (targetTrack._gainNode) {
              const baseVolume =
                targetTrack.volume !== undefined && targetTrack.volume !== null
                  ? targetTrack.volume
                  : 0.9;
              targetTrack._gainNode.gain.setValueAtTime(currentGain * baseVolume, now);
            }

            // Continue processing if still active AND tracks still exist
            const connection = this.sidechainConnections.get(connectionKey);
            const sourceStillExists = this.tracks.has(`bgm_${sourceId}`);
            const targetStillExists = this.tracks.has(`bgm_${targetId}`);

            if (connection && connection.active && sourceStillExists && targetStillExists) {
              connection.frameId = requestAnimationFrame(processEnvelope);
            } else if (connection) {
              // Cleanup: track was removed externally
              this._disposeSidechainConnection(connectionKey, connection, { restoreTarget: true });
              Logger.info(`Sidechain ${connectionKey} auto-stopped: track removed`);
            }
          } catch (e) {
            Logger.error(`Sidechain process error for ${connectionKey}:`, e);
            const connection = this.sidechainConnections.get(connectionKey);
            if (connection) {
              this._disposeSidechainConnection(connectionKey, connection, { restoreTarget: true });
            }
          }
        };

        // B07: dispose any existing connection for this source/target before
        // overwriting the map entry, otherwise the old analyser + RAF loop keep
        // running (leaked node, two envelope followers fighting over target gain).
        const existingConnection = this.sidechainConnections.get(connectionKey);
        if (existingConnection) {
          this._disposeSidechainConnection(connectionKey, existingConnection, { restoreTarget: false });
          Logger.info(`Sidechain ${connectionKey} replaced: disposed previous connection`);
        }

        // Store connection state
        const connection = {
          analyzer: analyzer,
          sourceTrack: sourceTrack,
          targetTrack: targetTrack,
          active: true,
          frameId: null,
          threshold: threshold,
          ratio: ratio,
          attack: attack,
          release: release,
        };
        this.sidechainConnections.set(connectionKey, connection);

        // Start envelope follower
        connection.frameId = requestAnimationFrame(processEnvelope);

        Logger.info(
          `Sidechain active: ${sourceId} -> ${targetId} (threshold: ${threshold}, ratio: ${ratio}:1)`
        );
        return true;
      } catch (error) {
        Logger.error("Error setting up sidechain:", error);
        return false;
      }
    };

  hub._disposeSidechainConnection = function(connectionKey, connection, options = {}) {
      if (!connection) return;
      const restoreTarget = options.restoreTarget !== false;

      connection.active = false;
      if (connection.frameId) {
        try {
          cancelAnimationFrame(connection.frameId);
        } catch (_e) {
          Logger.debugOnce(
            "disposeSidechain: cancelAnimationFrame failed",
            {},
            "disposeSidechain.cancelAnimationFrame"
          );
        }
        connection.frameId = null;
      }

      // Disconnect analyzer tap from source.
      try {
        if (connection.analyzer && connection.sourceTrack && connection.sourceTrack._gainNode) {
          try {
            connection.sourceTrack._gainNode.disconnect(connection.analyzer);
          } catch (_e) {
            Logger.debugOnce(
              "disposeSidechain: disconnect tap failed",
              {},
              "disposeSidechain.disconnectTap"
            );
          }
        }
      } catch (_e) {
        Logger.debugOnce(
          "disposeSidechain: disconnect tap outer failed",
          {},
          "disposeSidechain.disconnectTap.outer"
        );
      }

      // Disconnect analyzer itself.
      try {
        if (connection.analyzer && connection.analyzer.disconnect) {
          connection.analyzer.disconnect();
        }
      } catch (_e) {
        Logger.debugOnce(
          "disposeSidechain: disconnect analyzer failed",
          {},
          "disposeSidechain.disconnectAnalyzer"
        );
      }

      // Restore target volume safely.
      if (restoreTarget) {
        try {
          if (connection.targetTrack && connection.targetTrack._gainNode && WebAudio._context) {
            const baseVolume =
              connection.targetTrack.volume !== undefined && connection.targetTrack.volume !== null
                ? connection.targetTrack.volume
                : 0.9;
            connection.targetTrack._gainNode.gain.setValueAtTime(
              baseVolume,
              WebAudio._context.currentTime
            );
          }
        } catch (_e) {
          Logger.debugOnce(
            "disposeSidechain: restore target volume failed",
            {},
            "disposeSidechain.restoreTarget"
          );
        }
      }

      this.sidechainConnections.delete(connectionKey);
    };

  hub.stopSidechain = function(args) {
      const sourceId = String(args[0]);
      const targetId = String(args[1]);
      const connectionKey = `${sourceId}_to_${targetId}`;

      const connection = this.sidechainConnections.get(connectionKey);
      if (connection) {
        this._disposeSidechainConnection(connectionKey, connection, { restoreTarget: true });
        Logger.info(`Sidechain stopped: ${sourceId} -> ${targetId}`);
        return true;
      }

      Logger.warn(`No sidechain connection found: ${sourceId} -> ${targetId}`);
      return false;
    };

  hub.duckVolume = function(type, trackId, duckLevel, fadeTime, holdTime, switchId) {
      const key = `${type}_${trackId}`;
      const buffer = this.tracks.get(key);

      if (!buffer) {
        Logger.error(`No audio found to duck for ${type}${trackId}`);
        return false;
      }

      // Check if a fade is currently active for this track's volume
      const volumeFadeKey = `${key}_volume`;
      const activeFade = FadeManager.activeFades.get(volumeFadeKey);

      // If a fade is active, restore to its target volume (not mid-fade value)
      // Otherwise, restore to current volume
      const restoreVolume = activeFade ? activeFade.targetValue : buffer.volume;

      if (switchId && holdTime === 0) {
        // Switch-controlled ducking - duck immediately, restore when switch turns off
        Logger.info(
          `Starting switch-controlled duck for ${key}: ${Math.round(
            restoreVolume * 100
          )}% -> ${duckLevel * 100}% (switch ${switchId})`
        );

        this.fadeAudio(type, trackId, {
          volume: duckLevel * 100,
          duration: fadeTime,
        });

        // Store restore command in the switch buffer system
        const restoreCommand = {
          type,
          trackId,
          action: "fade",
          args: [restoreVolume * 100, fadeTime],
          switchId: null, // No switch for restore
        };

        // Add restore command to buffer for when switch turns off
        const SB = getSwitchBuffer();
        if (SB) {
          SB.addRestoreCommand(switchId, restoreCommand);
        } else {
          console.warn(TAG + " switch-controlled duck needs FugsAudio5Switch (SwitchBuffer missing)");
        }

        return true;
      } else {
        // Timed ducking
        Logger.info(
          `Starting timed duck for ${key}: ${Math.round(
            restoreVolume * 100
          )}% -> ${duckLevel * 100}% for ${holdTime}s`
        );

        this.fadeAudio(type, trackId, { volume: duckLevel * 100, duration: fadeTime }, () => {
          if (holdTime > 0) {
            Logger.success(`Duck phase complete for ${key}, holding for ${holdTime}s`);
            const timeoutId = setTimeout(() => {
              // Check if track still exists and wasn't replaced
              const currentBuffer = this.tracks.get(key);
              if (!currentBuffer) {
                Logger.warn(`Duck restore cancelled - track ${key} no longer exists`);
                return;
              }

              if (currentBuffer !== buffer) {
                Logger.warn(`Duck restore cancelled - track ${key} was replaced`);
                return;
              }

              Logger.info(
                `Starting duck restore for ${key}: ${
                  duckLevel * 100
                }% -> ${Math.round(restoreVolume * 100)}%`
              );
              this.fadeAudio(
                type,
                trackId,
                { volume: restoreVolume * 100, duration: fadeTime },
                () => {
                  Logger.success(`Duck restore complete for ${key}`);
                  // Remove timeout from tracking
                  if (this.activeTimeouts.has(key)) {
                    const timeouts = this.activeTimeouts.get(key);
                    const index = timeouts.indexOf(timeoutId);
                    if (index > -1) timeouts.splice(index, 1);
                    if (timeouts.length === 0) this.activeTimeouts.delete(key);
                  }
                }
              );
            }, holdTime * 1000);

            // Track this timeout for cleanup
            if (!this.activeTimeouts.has(key)) {
              this.activeTimeouts.set(key, []);
            }
            this.activeTimeouts.get(key).push(timeoutId);
          }
        });
      }

      return true;
    };

  hub.duckAllOfType = function(type, args, switchId) {
      const duckLevel = this.toNum(args[0], 0.5);
      const fadeTime = this.toNum(args[1], 1);
      const holdTime = this.toNum(args[2], 0);
      let count = 0;

      for (const [key] of this.tracks.entries()) {
        if (key.startsWith(type)) {
          // B13: skip paused tracks (their buffer is stopped; the duck would be
          // lost on resume). Mirrors duckAllAudio's global skip.
          if (this.pausedTracks && this.pausedTracks.has(key)) continue;

          const trackId = key.split("_")[1];
          if (this.duckVolume(type, trackId, duckLevel, fadeTime, holdTime, switchId)) {
            count++;
          }
        }
      }

      Logger.info(`Ducking ${count} ${type.toUpperCase()} tracks`);
      return count;
    };

  hub.duckAllAudio = function(args, switchId) {
      const duckLevel = this.toNum(args[0], 0.5);
      const fadeTime = this.toNum(args[1], 1);
      const holdTime = this.toNum(args[2], 0);
      let count = 0;

      for (const [key] of this.tracks.entries()) {
        // Skip paused tracks - they're not actively playing
        if (this.pausedTracks && this.pausedTracks.has(key)) continue;

        const [type, trackId] = key.split("_");
        if (this.duckVolume(type, trackId, duckLevel, fadeTime, holdTime, switchId)) {
          count++;
        }
      }

      Logger.info(`Ducking ${count} tracks globally`);
      return count;
    };

  hub.sidechainDuck = function(exceptTracks, args, switchId) {
      // Parse exception tracks - format: ["bgm1", "se2", "bgs3"]
      const exceptions = new Set();
      exceptTracks.forEach((track) => {
        const trimmed = track.trim();
        if (trimmed) {
          // Parse "bgm1" -> type:"bgm", trackId:"1"
          const match = trimmed.match(/^(bgm|bgs|me|se)(\d*)$/i);
          if (match) {
            const type = match[1].toLowerCase();
            const trackId = match[2] || "1";
            exceptions.add(`${type}_${trackId}`);
          } else {
            Logger.warn(`Invalid track identifier in sidechain exception: ${trimmed}`);
          }
        }
      });

      const duckLevel = this.toNum(args[0], 0.5);
      const fadeTime = this.toNum(args[1], 1);
      const holdTime = this.toNum(args[2], 0);
      let count = 0;

      for (const [key] of this.tracks.entries()) {
        // Skip tracks in the exception list
        if (exceptions.has(key)) {
          Logger.info(`Skipping sidechain exception: ${key}`);
          continue;
        }

        const [type, trackId] = key.split("_");
        if (this.duckVolume(type, trackId, duckLevel, fadeTime, holdTime, switchId)) {
          count++;
        }
      }

      Logger.info(`Sidechain ducking: ${count} tracks ducked, ${exceptions.size} exceptions`);
      return count;
    };

  hub.pitchBendAll = function(args) {
      const targetPitch = args[0] !== undefined ? this.toNum(args[0]) : undefined;
      const duration = this.toNum(args[1], 0);
      let count = 0;

      for (const [key] of this.tracks.entries()) {
        // B13: skip paused tracks (stopped buffer; change lost on resume).
        if (this.pausedTracks && this.pausedTracks.has(key)) continue;

        const [type, trackId] = key.split("_");
        if (this.fadeAudio(type, trackId, { pitch: targetPitch, duration })) {
          count++;
        }
      }

      Logger.info(`Pitch bending ${count} tracks to ${targetPitch}%`);
      return count;
    };

  hub.pitchBendAllOfType = function(type, args) {
      const targetPitch = args[0] !== undefined ? this.toNum(args[0]) : undefined;
      const duration = this.toNum(args[1], 0);
      let count = 0;

      for (const [key] of this.tracks.entries()) {
        if (key.startsWith(type)) {
          // B13: skip paused tracks (stopped buffer; change lost on resume).
          if (this.pausedTracks && this.pausedTracks.has(key)) continue;

          const trackId = key.split("_")[1];
          if (this.fadeAudio(type, trackId, { pitch: targetPitch, duration })) {
            count++;
          }
        }
      }

      Logger.info(`Pitch bending ${count} ${type.toUpperCase()} tracks to ${targetPitch}%`);
      return count;
    };

  hub.duck = function(type, trackId = 1, options = {}) {
      const opts = options || {};
      return this.duckVolume(
        type,
        String(trackId),
        opts.level != null ? opts.level : 0.5,
        opts.fadeTime != null ? opts.fadeTime : 1,
        opts.holdTime != null ? opts.holdTime : 0,
        opts.switchId != null ? opts.switchId : null
      );
    };

  hub.duckAll = function(options = {}) {
      const opts = options || {};
      const type = opts.type != null ? opts.type : "all";
      const args = [
        opts.level != null ? opts.level : 0.5,
        opts.fadeTime != null ? opts.fadeTime : 1,
        opts.holdTime != null ? opts.holdTime : 0,
      ];
      const switchId = opts.switchId != null ? opts.switchId : null;
      if (type === "all") {
        return this.duckAllAudio(args, switchId);
      } else {
        return this.duckAllOfType(type, args, switchId);
      }
    };

  hub.startPump = function(options = {}) {
      const opts = options || {};
      this.pumpConfig = {
        active: true,
        bpm: opts.bpm != null ? opts.bpm : 120,
        depth: opts.depth != null ? opts.depth : 0.5,
        shape: opts.shape != null ? opts.shape : "sine",
        tracks: opts.tracks != null ? opts.tracks : "all",
        startTime: performance.now(),
      };
      Logger.info(
        `Started rhythmic pump: ${this.pumpConfig.bpm}bpm, ${this.pumpConfig.shape}, depth ${this.pumpConfig.depth} on ${this.pumpConfig.tracks}`
      );
      return true;
    };

  hub.stopPump = function() {
      this.pumpConfig.active = false;
      for (const buffer of this.tracks.values()) {
        if (buffer._pumpGainNode) {
          buffer._pumpGainNode.gain.value = 1.0;
        }
      }
      Logger.info("Stopped rhythmic pump");
      return true;
    };

  hub.registerHandler("duck", function (cmd) {
    const args = cmd.args;
    return this.duckVolume(
      cmd.type,
      cmd.trackId,
      args[0] !== undefined ? this.toNum(args[0], 0.5) : 0.5,
      this.toNum(args[1], 1),
      this.toNum(args[2], 0),
      cmd.switchId
    );
  });
  hub.registerHandler("duckpump", function (cmd) {
    const args = cmd.args;
    const bpm = this.toNum(args[0], AUDIO_CONSTANTS.DEFAULT_PUMP_BPM);
    const depth = this.toNum(args[1], AUDIO_CONSTANTS.DEFAULT_PUMP_DEPTH);
    const shape = args[2] || AUDIO_CONSTANTS.DEFAULT_PUMP_SHAPE;
    const tracks = args[3] || "all";
    this.pumpConfig = { active: true, bpm, depth, shape, tracks, startTime: performance.now() };
    Logger.info("Started rhythmic pump: " + bpm + "bpm, " + shape + ", depth " + depth + " on " + tracks);
    return true;
  });
  hub.registerHandler("stoppump", function () {
    this.pumpConfig.active = false;
    for (const buffer of this.tracks.values()) {
      if (buffer._pumpGainNode) buffer._pumpGainNode.gain.value = 1.0;
    }
    Logger.info("Stopped rhythmic pump");
    return true;
  });
  hub.registerHandler("duckall", function (cmd) {
    return this.duckAllAudio(cmd.args, cmd.switchId);
  });
  hub.registerHandler("duckall-sidechain", function (cmd) {
    const args = cmd.args;
    const exceptTracks = [];
    let idx = 0;
    for (let i = 0; i < args.length; i++) {
      if (/^(bgm|bgs|me|se)\d*$/i.test(args[i])) exceptTracks.push(args[i]);
      else {
        idx = i;
        break;
      }
    }
    return this.sidechainDuck(exceptTracks, args.slice(idx), cmd.switchId);
  });
  const duckallOf = function (cmd) {
    return this.duckAllOfType(cmd.action.split("-")[1], cmd.args, cmd.switchId);
  };
  hub.registerHandler("duckall-bgm", duckallOf);
  hub.registerHandler("duckall-bgs", duckallOf);
  hub.registerHandler("duckall-me", duckallOf);
  hub.registerHandler("duckall-se", duckallOf);
  hub.registerHandler("pitchbendall", function (cmd) {
    return this.pitchBendAll(cmd.args);
  });
  const pitchbendallOf = function (cmd) {
    return this.pitchBendAllOfType(cmd.action.split("-")[1], cmd.args);
  };
  hub.registerHandler("pitchbendall-bgm", pitchbendallOf);
  hub.registerHandler("pitchbendall-bgs", pitchbendallOf);
  hub.registerHandler("pitchbendall-me", pitchbendallOf);
  hub.registerHandler("pitchbendall-se", pitchbendallOf);
  hub.registerHandler("sidechain", function (cmd) {
    return this.setupSidechain(cmd.args);
  });
  hub.registerHandler("stopsidechain", function (cmd) {
    return this.stopSidechain(cmd.args);
  });

  hub.onUpdate(function () {
    if (this.pumpConfig && this.pumpConfig.active) this.updatePump();
  });

  hub.onTeardown(function (key) {
    if (key.startsWith("bgm_") && this.sidechainConnections) {
      const trackId = key.substring(4);
      for (const [connKey, conn] of Array.from(this.sidechainConnections.entries())) {
        const parts = connKey.split("_to_");
        if (parts[0] === trackId || parts[1] === trackId) {
          this._disposeSidechainConnection(connKey, conn, { restoreTarget: true });
          Logger.info("Cleaned up sidechain connection " + connKey + " for " + key);
        }
      }
    }
    const buffer = this.tracks.get(key);
    if (buffer && buffer._pumpGainNode) {
      try {
        buffer._pumpGainNode.disconnect();
      } catch (_e) {}
      buffer._pumpGainNode = null;
    }
  });

  // B06 leftover: persist active sidechain links. Stored on BOTH source and
  // target track state so whichever loads second can bind once peers exist.
  // loadAllStates also runs a second restore pass after all tracks are up.
  hub.onCaptureState(function (key) {
    if (!key.startsWith("bgm_") || !this.sidechainConnections || this.sidechainConnections.size === 0) {
      return undefined;
    }
    const trackId = key.substring(4);
    const links = [];
    for (const [connKey, conn] of this.sidechainConnections.entries()) {
      if (!conn || !conn.active) continue;
      const parts = connKey.split("_to_");
      if (parts.length !== 2) continue;
      if (parts[0] !== trackId && parts[1] !== trackId) continue;
      links.push({
        sourceId: parts[0],
        targetId: parts[1],
        threshold: conn.threshold,
        ratio: conn.ratio,
        attack: conn.attack,
        release: conn.release,
      });
    }
    return links.length ? { sidechains: links } : undefined;
  });

  hub.onRestoreState(function (key, ext) {
    if (!ext || !Array.isArray(ext.sidechains) || !ext.sidechains.length) return;
    if (typeof this.setupSidechain !== "function") return;

    for (let i = 0; i < ext.sidechains.length; i++) {
      const link = ext.sidechains[i];
      if (!link || link.sourceId == null || link.targetId == null) continue;
      const sourceKey = "bgm_" + link.sourceId;
      const targetKey = "bgm_" + link.targetId;
      // Wait until both peers exist (second loadAllStates pass handles the rest).
      if (!this.tracks.has(sourceKey) || !this.tracks.has(targetKey)) continue;

      const connKey = link.sourceId + "_to_" + link.targetId;
      // Skip if an identical active connection is already bound.
      if (this.sidechainConnections && this.sidechainConnections.has(connKey)) continue;

      try {
        this.setupSidechain([
          String(link.sourceId),
          String(link.targetId),
          link.threshold != null ? link.threshold : 0.5,
          link.ratio != null ? link.ratio : 4,
          link.attack != null ? link.attack : 0.01,
          link.release != null ? link.release : 0.1,
        ]);
        Logger.info("Restored sidechain " + connKey + " (via " + key + ")");
      } catch (e) {
        Logger.warn("Sidechain restore failed for " + connKey, {
          error: e && e.message ? e.message : e,
        });
      }
    }
  });

  // Persist active rhythmic pump across RPG Maker save/load (global meta).
  hub.onCaptureGlobalState(function () {
    if (!this.pumpConfig || !this.pumpConfig.active) return undefined;
    return {
      pump: {
        active: true,
        bpm: this.pumpConfig.bpm,
        depth: this.pumpConfig.depth,
        shape: this.pumpConfig.shape,
        tracks: this.pumpConfig.tracks,
      },
    };
  });

  hub.onRestoreGlobalState(function (meta) {
    if (!meta || !meta.pump || !meta.pump.active) {
      if (this.pumpConfig) this.pumpConfig.active = false;
      return;
    }
    const p = meta.pump;
    this.pumpConfig = {
      active: true,
      bpm: p.bpm != null ? p.bpm : 120,
      depth: p.depth != null ? p.depth : 0.5,
      shape: p.shape || "sine",
      tracks: p.tracks || "all",
      // Reset phase so restore doesn't jump mid-cycle from a stale startTime.
      startTime: typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(),
    };
    Logger.info(
      "Restored rhythmic pump: " +
        this.pumpConfig.bpm +
        "bpm, " +
        this.pumpConfig.shape +
        ", depth " +
        this.pumpConfig.depth +
        " on " +
        this.pumpConfig.tracks
    );
  });

  Logger.success(TAG + " loaded — duck / pump / sidechain / pitchbendall ready");
})();


/* ---- FugsAudio5Switch.js ---- */

(() => {
  const TAG = "[FugsAudio5Switch]";
  if (!window.FugsAudio) {
    console.error(TAG + " FugsMultiTrackAudioEX (or FugsAudio1Core) must be ON and ABOVE this plugin.");
    return;
  }

  const hub = window.FugsAudio;
  const Logger = hub.Logger || {
    info: (...a) => console.log("[FugsAudio]", ...a),
    warn: (...a) => console.warn("[FugsAudio]", ...a),
    error: (...a) => console.error("[FugsAudio]", ...a),
    success: (...a) => console.log("[FugsAudio]", ...a),
    effect: (...a) => console.log("[FugsAudio:effect]", ...a),
    debug: () => {},
    debugOnce: () => {},
    switch: (...a) => console.log("[FugsAudio:switch]", ...a),
  };
  const AUDIO_CONSTANTS = hub.AUDIO_CONSTANTS || { MAX_RETRIES: 50 };
  const sceneTransitionDelayMS =
    (hub.config && hub.config.sceneTransitionDelayMS) != null
      ? hub.config.sceneTransitionDelayMS
      : 100;

  const SwitchManager = {
    // Switches we're actively monitoring
    monitoredSwitches: new Set(),

    // Original setValue function (stored once)
    originalSetValue: null,

    // Whether we've hooked the switch system
    isHooked: false,

    // Initialize the switch monitoring system
    init() {
      const hookWhenReady = (retries = 0) => {
        const MAX_RETRIES = AUDIO_CONSTANTS.MAX_RETRIES; // 5 seconds max wait time

        if (
          typeof $dataSystem !== "undefined" &&
          Game_Switches &&
          Game_Switches.prototype.setValue
        ) {
          this.hookSwitchSystem();
        } else if (retries < MAX_RETRIES) {
          setTimeout(() => hookWhenReady(retries + 1), sceneTransitionDelayMS);
        } else {
          Logger.error(
            "Failed to hook switch system after maximum retries. Game_Switches not available."
          );
        }
      };
      hookWhenReady();
    },

    // Hook into the switch system only once
    hookSwitchSystem() {
      if (this.isHooked) return;

      this.originalSetValue = Game_Switches.prototype.setValue;
      const self = this;

      Game_Switches.prototype.setValue = function (switchId, value) {
        const oldValue = this._data[switchId];

        // Call original function
        self.originalSetValue.call(this, switchId, value);

        // Only process if this switch is being monitored AND value actually changed
        if (oldValue !== value && self.isMonitored(switchId)) {
          Logger.switch(`Monitored switch ${switchId} changed: ${oldValue} -> ${value}`);
          SwitchBuffer.executeSwitch(switchId, value);
        }
      };

      this.isHooked = true;
      Logger.success("Switch monitoring system hooked");
    },

    // Add a switch to monitoring (when commands are registered)
    addSwitch(switchId) {
      if (!switchId || switchId < 1 || switchId > 5000) return false;

      if (!this.monitoredSwitches.has(switchId)) {
        this.monitoredSwitches.add(switchId);
        Logger.switch(`Added switch ${switchId} to monitoring`);
        return true;
      }
      return false;
    },

    // Remove a switch from monitoring
    removeSwitch(switchId) {
      if (this.monitoredSwitches.has(switchId)) {
        this.monitoredSwitches.delete(switchId);
        Logger.switch(`Removed switch ${switchId} from monitoring`);
        return true;
      }
      return false;
    },

    // Check if a switch is being monitored
    isMonitored(switchId) {
      return this.monitoredSwitches.has(switchId);
    },

    // Get all monitored switches
    getMonitoredSwitches() {
      return Array.from(this.monitoredSwitches).sort((a, b) => a - b);
    },

    // Clear all monitoring (for cleanup)
    clearAll() {
      this.monitoredSwitches.clear();
      Logger.switch("Cleared all switch monitoring");
    },
  };
  // Switch Buffer System
  const SwitchBuffer = {
    commandBuffer: new Map(),
    activeCommands: new Map(),
    restoreCommands: new Map(),

    _makeCommandKey(command) {
      if (!command) return "||";
      const action = command.action != null ? String(command.action) : "";
      const type = command.type != null ? String(command.type) : "";
      const trackId = command.trackId != null ? String(command.trackId) : "";
      return `${action}|${type}|${trackId}`;
    },

    _makeCommandSignature(command) {
      // Stable signature used to dedupe re-registrations from repeatedly-run events.
      const stable = {
        action: command && command.action != null ? String(command.action) : "",
        type: command && command.type != null ? String(command.type) : "",
        trackId: command && command.trackId != null ? String(command.trackId) : "",
        args: Array.isArray(command && command.args) ? command.args : [],
        persistence: command && command.persistence != null ? String(command.persistence) : null,
        pauseMode: command && command.pauseMode != null ? String(command.pauseMode) : null,
        curve: command && command.curve != null ? String(command.curve) : null,
        startTime:
          command && command.startTime !== undefined && command.startTime !== null
            ? command.startTime
            : null,
        loop: command && command.loop !== undefined ? command.loop : null,
        effect: command && command.effect !== undefined ? command.effect : null,
      };
      try {
        return JSON.stringify(stable);
      } catch (_e) {
        // Extremely defensive fallback; should never happen with the above shape.
        return String(stable.action) + "|" + String(stable.type) + "|" + String(stable.trackId);
      }
    },

    _removeActiveId(switchId, commandId) {
      if (!commandId) return;
      const activeList = this.activeCommands.get(switchId);
      if (!activeList || activeList.length === 0) return;
      let index = activeList.indexOf(commandId);
      while (index > -1) {
        activeList.splice(index, 1);
        index = activeList.indexOf(commandId);
      }
    },

    addCommand(switchId, command) {
      if (!switchId || switchId < 1 || switchId > 5000) {
        Logger.warn(`Invalid switch ID: ${switchId}`);
        return null;
      }

      // Automatically add switch to monitoring when command is registered
      SwitchManager.addSwitch(switchId);

      if (!this.commandBuffer.has(switchId)) {
        this.commandBuffer.set(switchId, []);
      }

      const list = this.commandBuffer.get(switchId);
      const commandKey = this._makeCommandKey(command);
      const signature = this._makeCommandSignature(command);

      // Find the most recently registered command targeting the same action/type/track,
      // and remove any earlier duplicates to prevent commandBuffer growth.
      let lastIndex = -1;
      for (let i = 0; i < list.length; i++) {
        if (this._makeCommandKey(list[i]) === commandKey) lastIndex = i;
      }

      if (lastIndex !== -1) {
        const existing = list[lastIndex];
        const existingSig =
          existing && existing._fugsSwitchSig
            ? existing._fugsSwitchSig
            : this._makeCommandSignature(existing);

        // Prune older duplicates for the same target.
        for (let i = lastIndex - 1; i >= 0; i--) {
          if (this._makeCommandKey(list[i]) === commandKey) {
            const removed = list.splice(i, 1)[0];
            if (removed && removed.id) this._removeActiveId(switchId, removed.id);
            lastIndex -= 1;
          }
        }

        // If the command is identical, keep the existing registration (no-op).
        if (existingSig === signature) {
          existing._fugsSwitchKey = commandKey;
          existing._fugsSwitchSig = existingSig;
          Logger.switch(`Duplicate switch command ignored for switch ${switchId}`, {
            commandId: existing.id,
            action: existing.action,
            type: existing.type,
            trackId: existing.trackId,
          });
          return existing.id;
        }

        // Otherwise replace with the latest intent (new id so executeSwitch can run it once if needed).
        const oldId = existing.id;
        const newId = Date.now() + Math.random();
        command.id = newId;
        command._fugsSwitchKey = commandKey;
        command._fugsSwitchSig = signature;
        list[lastIndex] = command;

        if (oldId) this._removeActiveId(switchId, oldId);
        Logger.switch(`Updated buffered command for switch ${switchId}`, {
          oldCommandId: oldId,
          commandId: newId,
          action: command.action,
          type: command.type,
          trackId: command.trackId,
        });
        return newId;
      }

      // New command registration.
      const commandId = Date.now() + Math.random();
      command.id = commandId;
      command._fugsSwitchKey = commandKey;
      command._fugsSwitchSig = signature;

      list.push(command);
      Logger.switch(`Buffered command for switch ${switchId}`, {
        commandId,
        action: command.action,
        type: command.type,
        trackId: command.trackId,
      });

      return commandId;
    },

    addRestoreCommand(switchId, command) {
      if (!switchId || switchId < 1 || switchId > 5000) {
        Logger.warn(`Invalid switch ID for restore command: ${switchId}`);
        return null;
      }

      if (!this.restoreCommands.has(switchId)) {
        this.restoreCommands.set(switchId, []);
      }

      const list = this.restoreCommands.get(switchId);
      const commandKey = this._makeCommandKey(command);
      const signature = this._makeCommandSignature(command);

      let lastIndex = -1;
      for (let i = 0; i < list.length; i++) {
        if (this._makeCommandKey(list[i]) === commandKey) lastIndex = i;
      }

      if (lastIndex !== -1) {
        const existing = list[lastIndex];
        const existingSig =
          existing && existing._fugsSwitchSig
            ? existing._fugsSwitchSig
            : this._makeCommandSignature(existing);

        // Prune older duplicates for the same restore target.
        for (let i = lastIndex - 1; i >= 0; i--) {
          if (this._makeCommandKey(list[i]) === commandKey) {
            list.splice(i, 1);
            lastIndex -= 1;
          }
        }

        if (existingSig === signature) {
          existing._fugsSwitchKey = commandKey;
          existing._fugsSwitchSig = existingSig;
          return existing.id || null;
        }

        const commandId = Date.now() + Math.random();
        command.id = commandId;
        command._fugsSwitchKey = commandKey;
        command._fugsSwitchSig = signature;
        list[lastIndex] = command;
        return commandId;
      }

      const commandId = Date.now() + Math.random();
      command.id = commandId;
      command._fugsSwitchKey = commandKey;
      command._fugsSwitchSig = signature;
      list.push(command);
      return commandId;
    },

    executeSwitch(switchId, isOn) {
      if (!SwitchManager.isMonitored(switchId)) {
        return;
      }

      if (isOn) {
        this.executeSwitchCommands(switchId);
      } else {
        this.stopSwitchCommands(switchId);
      }
    },

    executeSwitchCommands(switchId) {
      const commands = this.commandBuffer.get(switchId);
      if (!commands || commands.length === 0) return;

      if (!this.activeCommands.has(switchId)) {
        this.activeCommands.set(switchId, []);
      }

      const activeList = this.activeCommands.get(switchId);
      let executedCount = 0;
      let skippedCount = 0;

      commands.forEach((command) => {
        try {
          // Prevent re-executing the same already-active command when events re-register
          // commands while the switch remains ON.
          if (activeList.includes(command.id)) {
            skippedCount++;
            return;
          }

          Logger.switch(`Executing switch command for switch ${switchId}`, {
            action: command.action,
            type: command.type,
            trackId: command.trackId,
          });

          const result = hub.executeCommand(command);
          if (result) {
            activeList.push(command.id);
            executedCount++;
          }
        } catch (error) {
          Logger.error(`Error executing switch command for switch ${switchId}:`, error);
        }
      });

      Logger.success(
        `Executed ${executedCount}/${commands.length} commands for switch ${switchId}${
          skippedCount > 0 ? ` (skipped ${skippedCount} already-active)` : ""
        }`
      );
    },

    stopSwitchCommands(switchId) {
      const commands = this.commandBuffer.get(switchId);
      const activeList = this.activeCommands.get(switchId);

      // Actually stop the audio tracks that were started by switch commands
      if (commands && activeList && activeList.length > 0) {
        let stoppedCount = 0;

        commands.forEach((command) => {
          // Only stop if this command was executed (its ID is in activeList)
          if (activeList.includes(command.id)) {
            // Only stop "play" commands, not fades/ducks/etc
            if (command.action === "play") {
              try {
                hub.stopAudio(command.type, command.trackId, 0);
                stoppedCount++;
              } catch (error) {
                Logger.error(`Error stopping audio for switch ${switchId}:`, error);
              }
            }
          }
        });

        if (stoppedCount > 0) {
          Logger.success(`Stopped ${stoppedCount} audio tracks for switch ${switchId}`);
        }
      }

      // Clear active command list
      if (activeList) {
        activeList.length = 0;
      }

      // Execute restore commands for switch-controlled ducks
      if (this.restoreCommands.has(switchId)) {
        const restoreCommands = this.restoreCommands.get(switchId);
        let restoredCount = 0;

        restoreCommands.forEach((command) => {
          try {
            Logger.switch(`Executing restore command for switch ${switchId}`, {
              action: command.action,
              type: command.type,
              trackId: command.trackId,
            });

            if (hub.executeCommand(command)) {
              restoredCount++;
            }
          } catch (error) {
            Logger.error(`Error executing restore command for switch ${switchId}:`, error);
          }
        });

        this.restoreCommands.delete(switchId);
        Logger.success(`Restored ${restoredCount} commands for switch ${switchId}`);
      }
    },

    clearSwitch(switchId) {
      const hadCommands = this.commandBuffer.has(switchId);

      this.commandBuffer.delete(switchId);
      this.activeCommands.delete(switchId);
      this.restoreCommands.delete(switchId);
      SwitchManager.removeSwitch(switchId);

      if (hadCommands) {
        Logger.switch(`Cleared buffer for switch ${switchId}`);
      }
    },

    clearAll() {
      const switchCount = this.commandBuffer.size;

      this.commandBuffer.clear();
      this.activeCommands.clear();
      this.restoreCommands.clear();

      // Clear all monitored switches
      for (const switchId of SwitchManager.getMonitoredSwitches()) {
        SwitchManager.removeSwitch(switchId);
      }

      Logger.switch(`Cleared all switch buffers (${switchCount} switches affected)`);
    },
  };

  //-----------------------------------------------------------------------------------------------//

  // Attach to hub + window
  hub.SwitchManager = SwitchManager;
  hub.SwitchBuffer = SwitchBuffer;
  window.SwitchManager = SwitchManager;
  window.SwitchBuffer = SwitchBuffer;

  // Own switch-gated plugin commands (overwrite empty Core handler list entry)
  hub.onSwitchGatedCommand(function (switchId, commandObj) {
    SwitchBuffer.addCommand(switchId, commandObj);
    if (typeof $gameSwitches !== "undefined" && $gameSwitches && $gameSwitches.value(switchId)) {
      SwitchBuffer.executeSwitch(switchId, true);
    }
    return true;
  });

  SwitchManager.init();
  Logger.success(TAG + " loaded — switch-gated commands ready");
})();


/* ---- FugsAudio6Aliases.js ---- */

(() => {
  const TAG = "[FugsAudio6Aliases]";
  if (!window.FugsAudio) {
    console.error(TAG + " FugsMultiTrackAudioEX (or FugsAudio1Core) must be ON and ABOVE this plugin.");
    return;
  }

  const hub = window.FugsAudio;
  const Logger = hub.Logger || {
    info: (...a) => console.log("[FugsAudio]", ...a),
    warn: (...a) => console.warn("[FugsAudio]", ...a),
    error: (...a) => console.error("[FugsAudio]", ...a),
    success: (...a) => console.log("[FugsAudio]", ...a),
    effect: (...a) => console.log("[FugsAudio:effect]", ...a),
    debug: () => {},
    debugOnce: () => {},
    switch: () => {},
  };

  if (!hub.sfxAliases) hub.sfxAliases = new Map();
  if (!hub.aliasLastPlayed) hub.aliasLastPlayed = new Map();

  hub.registerAlias = function(aliasName, config) {
      if (!aliasName || typeof aliasName !== "string") {
        Logger.error("registerAlias: aliasName must be a non-empty string");
        return false;
      }
      if (!config || !Array.isArray(config.pool) || config.pool.length === 0) {
        Logger.error(`registerAlias: ${aliasName} must have a non-empty pool array`);
        return false;
      }

      const aliasConfig = {
        pool: config.pool,
        volumeJitter: this.toNum(config.volumeJitter, 0),
        pitchJitter: this.toNum(config.pitchJitter, 0),
        panJitter: this.toNum(config.panJitter, 0),
        cooldown: this.toNum(config.cooldown, 0),
        volume: this.toNum(config.volume, 90),
        pitch: this.toNum(config.pitch, 100),
        pan: this.toNum(config.pan, 0),
      };

      this.sfxAliases.set(aliasName, aliasConfig);
      Logger.info(`Registered SFX alias: ${aliasName}`, aliasConfig);
      return true;
    };

  hub.unregisterAlias = function(aliasName) {
      if (this.sfxAliases.has(aliasName)) {
        this.sfxAliases.delete(aliasName);
        this.aliasLastPlayed.delete(aliasName);
        Logger.info(`Unregistered SFX alias: ${aliasName}`);
        return true;
      }
      return false;
    };

  hub.playAlias = function(aliasName, type = "se", trackId = "1") {
      const config = this.sfxAliases.get(aliasName);
      if (!config) {
        Logger.warn(`playAlias: Unknown alias "${aliasName}"`);
        return false;
      }

      // Cooldown check
      if (config.cooldown > 0) {
        const lastPlayed = this.aliasLastPlayed.get(aliasName) || 0;
        const now = performance.now();
        if (now - lastPlayed < config.cooldown) {
          Logger.info(
            `playAlias: ${aliasName} on cooldown (${Math.round(config.cooldown - (now - lastPlayed))}ms remaining)`
          );
          return false;
        }
        this.aliasLastPlayed.set(aliasName, now);
      }

      // Pick random sound from pool
      const poolIndex = Math.floor(Math.random() * config.pool.length);
      const soundName = config.pool[poolIndex];

      // Apply humanization jitter
      const jitterRange = (base, jitter) => {
        if (jitter <= 0) return base;
        const variance = (Math.random() * 2 - 1) * jitter; // -jitter to +jitter
        return base + variance;
      };

      const finalVolume = Math.max(
        0,
        Math.min(200, jitterRange(config.volume, config.volumeJitter))
      );
      const finalPitch = Math.max(10, Math.min(400, jitterRange(config.pitch, config.pitchJitter)));
      const finalPan = Math.max(-100, Math.min(100, jitterRange(config.pan, config.panJitter)));

      Logger.info(`playAlias: ${aliasName} -> ${soundName}`, {
        volume: Math.round(finalVolume),
        pitch: Math.round(finalPitch),
        pan: Math.round(finalPan),
      });

      return this.playAudio({
        type,
        trackId,
        name: soundName,
        volume: finalVolume,
        fadein: 0,
        pan: finalPan,
        pitch: finalPitch,
        persistence: "none",
        pauseMode: "never",
      });
    };

  hub.listAliases = function() {
      const aliases = [];
      for (const [name, config] of this.sfxAliases.entries()) {
        aliases.push({
          name,
          poolSize: config.pool.length,
          pool: config.pool.join(", "),
          volumeJitter: config.volumeJitter,
          pitchJitter: config.pitchJitter,
          panJitter: config.panJitter,
          cooldown: config.cooldown,
        });
      }
      console.table(aliases);
      return aliases;
    };

  hub.parseAliasConfig = function(str) {
      const trimmed = str.trim();
      if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
        throw new Error("Config must be wrapped in braces");
      }

      const inner = trimmed.slice(1, -1).trim();
      const config = {};

      // Handle pool array specially: pool:[a,b,c]
      const poolMatch = inner.match(/pool:\s*\[([^\]]+)\]/);
      if (poolMatch) {
        config.pool = poolMatch[1].split(",").map((s) => s.trim());
      }

      // Parse remaining key:value pairs (skip pool since we handled it)
      const withoutPool = inner.replace(/pool:\s*\[[^\]]+\],?/, "").trim();
      if (withoutPool) {
        const pairs = withoutPool.split(",");
        for (const pair of pairs) {
          const colonIdx = pair.indexOf(":");
          if (colonIdx === -1) continue;
          const key = pair.substring(0, colonIdx).trim();
          const valueStr = pair.substring(colonIdx + 1).trim();
          if (!key) continue;

          // Parse value
          const numVal = Number(valueStr);
          if (!Number.isNaN(numVal) && valueStr.trim() !== "") {
            config[key] = numVal;
          } else if (valueStr === "true") {
            config[key] = true;
          } else if (valueStr === "false") {
            config[key] = false;
          } else {
            config[key] = valueStr;
          }
        }
      }

      return config;
    };

  // Overwrite soft tryPlayAlias to always route through real playAlias
  hub.tryPlayAlias = function (aliasName, type, trackId) {
    return this.playAlias(aliasName, type, trackId);
  };

  hub.registerHandler("registeralias", function (cmd) {
    try {
      const aliasName = cmd.args[0];
      const configStr = cmd.args.slice(1).join(" ");
      if (!configStr.startsWith("{")) {
        Logger.error("registeralias: config must be wrapped in braces");
        return false;
      }
      return this.registerAlias(aliasName, this.parseAliasConfig(configStr));
    } catch (e) {
      Logger.error("registeralias failed: " + e.message);
      return false;
    }
  });

  hub.registerHandler("unregisteralias", function (cmd) {
    return this.unregisterAlias(cmd.args[0]);
  });

  hub.registerHandler("listaliases", function () {
    return this.listAliases();
  });

  Logger.success(TAG + " loaded — SFX aliases ready");
})();


/* ---- FugsAudio7Compat.js ---- */

(() => {
  const TAG = "[FugsAudio7Compat]";
  if (!window.FugsAudio) {
    console.error(TAG + " FugsMultiTrackAudioEX (or FugsAudio1Core) must be ON and ABOVE this plugin.");
    return;
  }

  const hub = window.FugsAudio;
  const Logger = hub.Logger || {
    info: (...a) => console.log("[FugsAudio]", ...a),
    warn: (...a) => console.warn("[FugsAudio]", ...a),
    error: (...a) => console.error("[FugsAudio]", ...a),
    success: (...a) => console.log("[FugsAudio]", ...a),
    debug: () => {},
  };

  // Fixes infinite recursion in fadeOutBgs when _currentBgs.name is empty
  if (typeof OcRam_Audio_EX !== "undefined" || window.OcRam_Audio_EX) {
    if (typeof AudioManager === "undefined" || !AudioManager.fadeOutBgs) {
      Logger.warn(TAG + " OcRam present but AudioManager.fadeOutBgs missing — skip patch");
      return;
    }
    if (AudioManager._fugsOcRamFadeOutBgsPatched) {
      Logger.info(TAG + " OcRam fadeOutBgs patch already applied");
      return;
    }
    const _ocram_fadeOutBgs = AudioManager.fadeOutBgs;
    AudioManager.fadeOutBgs = function (duration, name) {
      if (
        (name === null || name === undefined || name === "") &&
        this._currentBgs &&
        (this._currentBgs.name === null ||
          this._currentBgs.name === undefined ||
          this._currentBgs.name === "")
      ) {
        if (this._bgsBuffer) {
          this._bgsBuffer.fadeOut(duration);
        }
        this._currentBgs = null;
        return;
      }
      _ocram_fadeOutBgs.call(this, duration, name);
    };
    AudioManager._fugsOcRamFadeOutBgsPatched = true;
    Logger.success(TAG + " OcRam_Audio_EX fadeOutBgs patch applied");
  } else {
    Logger.info(TAG + " OcRam_Audio_EX not found — compatibility plugin idle");
  }
})();
