//=======================================================================//
//                        FugsAudio3Spatial.js                           //
//=======================================================================//
/*:
 * @plugindesc v2.2 Proximity, Doppler, pan sweep for Fugs MultiTrack Audio
 * @target MV 1.63
 * @author Fug
 *
 * @help
 * =========================================================================
 * FugsAudio3Spatial — OPTIONAL
 * =========================================================================
 * Proximity, Doppler, pan sweep (proximity / doppler / pansweep).
 * Requires Core ABOVE this plugin.
 *
 * Full docs: install FugsAudio0Docs and open it in Plugin Manager.
 * =========================================================================
 */

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
      // Safety checks
      if (!$gamePlayer || !$dataMap || !$gameMap) return;

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
    if (this.proximityData && this.proximityData.size > 0 && typeof $gamePlayer !== "undefined" && $gamePlayer) {
      const currentX = $gamePlayer.x;
      const currentY = $gamePlayer.y;
      if (this.lastPlayerX !== currentX || this.lastPlayerY !== currentY) {
        this.updateProximityVolume();
        this.lastPlayerX = currentX;
        this.lastPlayerY = currentY;
      }
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

  window.DistanceCurves = DistanceCurves;
  hub.DistanceCurves = DistanceCurves;
  Logger.success(TAG + " loaded — proximity / doppler / pansweep ready");
})();
