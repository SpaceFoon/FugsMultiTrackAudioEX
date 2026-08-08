//=======================================================================//
//                        FugsAudio4Dynamics.js                          //
//=======================================================================//
/*:
 * @plugindesc v2.2 Duck, sidechain, pump, pitchbendall for Fugs MultiTrack Audio
 * @target MV 1.63
 * @author Fug
 *
 * @help
 * =========================================================================
 * FugsAudio4Dynamics — OPTIONAL
 * =========================================================================
 * Duck, sidechain, pump, pitchbendall.
 * Requires Core ABOVE this plugin. Switch-controlled ducks need FugsAudio5Switch.
 *
 * Full docs: install FugsAudio0Docs and open it in Plugin Manager.
 * =========================================================================
 */

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

            // Apply attack/release envelope smoothing
            const now = context.currentTime;
            const attackCoeff = Math.exp(-1 / (attack * context.sampleRate));
            const releaseCoeff = Math.exp(-1 / (release * context.sampleRate));

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

  Logger.success(TAG + " loaded — duck / pump / sidechain / pitchbendall ready");
})();
