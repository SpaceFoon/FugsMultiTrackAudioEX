//=======================================================================//
//                        FugsAudio6Aliases.js                           //
//=======================================================================//
/*:
 * @plugindesc v2.2 SFX alias pools + humanizer for Fugs MultiTrack Audio
 * @target MV 1.63
 * @author Fug
 *
 * @help
 * =========================================================================
 * FugsAudio6Aliases — OPTIONAL
 * =========================================================================
 * SFX alias pools + humanizer (registeralias / play-se alias:Name).
 * Requires Core ABOVE this plugin.
 *
 * Full docs: install FugsAudio0Docs and open it in Plugin Manager.
 * =========================================================================
 */

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
