//=======================================================================//
//                      FugsMultiTrackAudioEX.js                         //
//=======================================================================//
/*:
 * @plugindesc v2.2 Unlimited audio tracks with mixing controls
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
 * Fugs MultiTrack Audio — CORE
 * =========================================================================
 * Mixer: play / stop / fade / crossfade / pause / resume / save / load /
 * syncplay / chain / pitch / pan / listall.
 *
 * Full command playbook, presets, spatial, dynamics, switches, aliases:
 *   Install and open  FugsAudio0Docs  in Plugin Manager.
 *
 * Optional satellites (load BELOW this plugin):
 *   FugsAudio2Effects, FugsAudio3Spatial, FugsAudio4Dynamics,
 *   FugsAudio5Switch, FugsAudio6Aliases, FugsAudio7Compat
 *   FugsAudio0Docs  ← documentation (recommended for all projects)
 *   FugsAudio8Test  ← dev only
 *
 * Load order tip: Core first; Docs anywhere after Core; Test last.
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
        const elapsed = now - fade.startTime;
        const progress = Math.min(elapsed / fade.duration, 1);

        const easedProgress = this.applyCurve(progress, fade.curve);

        const currentValue = fade.startValue + (fade.targetValue - fade.startValue) * easedProgress;
        fade.onUpdate(currentValue);

        if (progress >= 1) {
          fade.onComplete && fade.onComplete();
          completedFades.push(key);
        }
      }

      completedFades.forEach((key) => this.activeFades.delete(key));

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
    onSwitchGatedCommand(fn) { if (typeof fn === "function") this._switchGatedHandlers.push(fn); },

    _runHooks(list, ...args) {
      if (!list || !list.length) return;
      for (let i = 0; i < list.length; i++) {
        try { list[i].apply(this, args); }
        catch (e) { Logger.error("Lifecycle hook failed", { error: e && e.message ? e.message : e }); }
      }
    },

    runUpdateHooks() { this._runHooks(this._updateHooks); },

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

        const scheduleEndAction = (offsetSeconds) => {
          // Runs after the engine's internal end timer stops the audio.
          // For repeat loops, we restart; otherwise we cleanup the track.
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
                if (effect) {
                  this.connectEffectChain(key, buffer);
                }
                scheduleEndAction(0);
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
        };

        // Loop modes:
        // - forever: use WebAudio looping (no end timer)
        // - repeat: play once, then restart on end N times
        // - never: play once
        if (loopCfg.mode === "repeat") {
          buffer._fugsLoopRepeatsRemaining = loopCfg.repeatCount;
          scheduleEndAction(startTime);
        } else if (!shouldLoop) {
          scheduleEndAction(startTime);
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

      // Cancel pending timeouts for this track
      if (this.activeTimeouts.has(key)) {
        const timeoutIds = this.activeTimeouts.get(key);
        timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
        this.activeTimeouts.delete(key);
        Logger.info(`Cancelled ${timeoutIds.length} pending timeout(s) for paused ${key}`);
      }

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

        // Schedule buffer pause via setTimeout to ensure it happens even if fade is cancelled
        const pauseDelay = Math.max(fadeout || 0, 0);
        const timeoutId = setTimeout(() => {
          // Only pause if buffer hasn't been replaced
          if (this.tracks.get(key) === buffer) {
            try {
              buffer.stop();
            } catch (_e) {
              // DOMException if already stopped or context closed
            }
            this.pausedTracks.add(key);
            Logger.success(`Pause complete for ${key}`);
          } else {
            Logger.info(`Pause skipped - ${key} was replaced`);
          }

          // Remove timeout from tracking
          if (this.activeTimeouts.has(key)) {
            const timeouts = this.activeTimeouts.get(key);
            const index = timeouts.indexOf(timeoutId);
            if (index > -1) timeouts.splice(index, 1);
            if (timeouts.length === 0) this.activeTimeouts.delete(key);
          }
        }, pauseDelay * 1000);

        // Track this timeout for cleanup
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
        this.pausedTracks.add(key);
      }

      return true;
    },

    resumeAudio(type, trackId, args) {
      const key = `${type}_${trackId}`;

      if (!this.pausedTracks.has(key)) {
        Logger.warn(`Track ${key} is not paused`);
        return false;
      }

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
      // scheduleEndAction timer.  The manual resume path below handles
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

      Logger.info(`Resuming ${key} from position: ${startPos}s using RPG Maker method`);

      try {
        // Dispose any existing effect chain tied to the paused buffer BEFORE we replace the buffer.
        // This avoids leaking WebAudio nodes when resume swaps the buffer object.
        this.clearEffect(key, { keepConfig: true });

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
        // If the track was paused when saved, pause it immediately after restoring
        if (state.isPaused) {
          this.pauseAudio(type, trackId, [0]); // Pause with no fadeout
        }
        Logger.info(`Restored state for ${key}${state.isPaused ? " (paused)" : ""}`);
        return true;
      }

      return false;
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
      return data;
    },

    applySaveData(data) {
      if (!data) return;

      // Restore snapshots from plain object
      this.namedSnapshots.clear();
      for (const [name, snapshotObj] of Object.entries(data)) {
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
            // Track is dead, clean it up
            this.cleanupTrack(key);
            Logger.info(`Cleaned up orphaned track: ${key}`);
          }
        } catch (_error) {
          // Track is corrupted, remove it
          this.cleanupTrack(key);
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
