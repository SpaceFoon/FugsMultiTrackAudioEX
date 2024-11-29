//-------------------------------------------------------------------------------//
//                           FugsMultiTrackAudioEX.js                           //
//-------------------------------------------------------------------------------//
/*:
 * @plugindesc v1.0 Unlimited audio tracks with advanced fading and crossfading
 * capabilities for BGM, BGS, ME, and SE audio.
 *
 * @target MV 1.63
 *
 * @author Fug
 *
 * @param Debug Logs
 * @type boolean
 * @desc Toggle debug logs (console output).
 * @on Enable
 * @off Disable
 * @default false
 *
 * @help
 * === Overview ===
 * This plugin enables the use of unlimited audio tracks for BGM, BGS, ME, and SE,
 * each with advanced control features. It supports fade-in, fade-out, and crossfading
 * across different audio types, allowing complex audio arrangements without interference.
 *
 * === Features ===
 * - Play multiple tracks of the same or different audio types simultaneously.
 * - Seamless fade-in, fade-out, and crossfading support across all tracks.
 * - Independent track handling to prevent conflicts with the default audio system or
 *   other audio plugins (e.g., OC Rams Audio EX).
 *
 * === Why Use This Plugin? ===
 * This plugin was created to provide detailed control over audio transitions, such as
 * fading a BGM into a BGS or layering SE with precise volume and pan adjustments.
 *
 * === Command Structure ===
 * The plugin commands follow this general format:
 *
 *   [Command]-[Type][Track]? [Arguments]?
 *
 * - **Command**: The action to perform (e.g., play, fade, stop, crossfade).
 * - **Type**: The audio type (BGM, BGS, ME, SE).
 * - **Track**: (Optional) The specific track number (defaults to Track 1 if omitted).
 * - **Arguments**: (Optional) Parameters for the command (e.g., volume, fade duration).
 *
 * Example Commands:
 *   play-bgs3 Scene1           // Plays a BGS on Track 3.
 *   stop-bgs3                  // Stops the BGS on Track 3 immediately.
 *   play-bgs "Title Music" 90 3 // Plays BGS with spaces in its name, 90% volume, and 3s fade-in.
 *
 * === Detailed Commands ===
 * 1. **Play Audio**
 *    `play-[Type][Track]? [name] [volume]? [fadein]? [pan]? [pitch]?`
 *    - Plays the specified audio with optional adjustments.
 *    - Example: `play-bgs2 Scene1 90 5 -30 120`
 *      (Plays Scene1 BGS on Track 2, 90% volume, 5s fade-in, -30 pan, and 120% pitch).
 *
 * 2. **Fade Audio**
 *    `fade-[Type][Track]? [volume] [duration] [pan]? [pitch]?`
 *    - Gradually adjusts the volume, pan, or pitch over time.
 *    - Example: `fade-bgm 30 3`
 *      (Fades BGM volume to 30% over 3 seconds).
 *
 * 3. **Stop Audio**
 *    `stop-[Type][Track]? [fadeout]?`
 *    - Stops the audio with an optional fade-out duration.
 *    - Example: `stop-bgm2 5`
 *      (Stops BGM on Track 2 with a 5-second fade-out).
 *
 * 4. **Crossfade Audio**
 *    `crossfade-[Type][Track]? [toTypeTo] [TrackId]? [name] [duration]`
 *    - Crossfades from one track to another with a smooth transition.
 *    - Example: `crossfade-bgm2 bgm3 Scene2 5`
 *      (Crossfades BGM on Track 2 to Scene2 on BGM Track 3 over 5 seconds).
 *
 * === Important Notes ===
 * - **Track Numbers**: Optional. Defaults to Track 1 if omitted.
 * - **Default Values**:
 *   - Volume: 90%, Pan: 0, Pitch: 100%.
 *   - Audio plays/stops immediately if fade-in/out duration is not provided.
 * - **Quoted Names**: Audio files with spaces in their names require quotes.
 *
 * === Possible Issues/ToDo ===
 * 1. **Command Parsing**:
 *    - The `parseArguments` method may struggle with special characters or nested quotes.
 *     (I already know it will fail German, haven't even tried)
 * 2. **Performance**:
 *    - Excessive fade operations using `setInterval` could lead to performance issues.(meh)
 *      Consider optimizing with `requestAnimationFrame` or a centralized fade handling system.
 * 3. **Nonexistent Tracks**:
 *    - Ensure meaningful error handling for invalid track IDs or audio types(types done).
 * 4. **Fade Precision**:
 *    - Avoid rounding errors during volume/pan/pitch adjustments, especially for small durations.
 *
 * === Final Notes ===
 * - The plugin operates independently of RPG Maker's stock audio system.
 * - Designed to work alongside other audio plugins without conflicts.
 */

(() => {
  const debug = Boolean(
    PluginManager.parameters("FugsMultiTrackAudioEX")["Debug Logs"]
  );
  if (debug) console.log("Welcome to Fugs Multi-Track Audio EX!!!!");
  if (debug) console.log("Debugging logs are enabled!!!");

  const FugsMultiTrackAudioEX = {
    tracks: {}, //object for all current tracks

    // Play
    playAudio(
      type,
      trackId,
      name,
      volume = 90,
      fadein = 0,
      pan = 0,
      pitch = 100
    ) {
      const key = `${type}_${trackId}`;
      if (this.tracks[key]) {
        if (debug)
          console.log(`Stopping existing track before playing:`, {
            type,
            trackId,
            name: name || "unknown",
          });
        this.tracks[key].stop();
      }
      const buffer = AudioManager.createBuffer(type.toLowerCase(), name);
      this.tracks[key] = buffer;
      buffer.volume = 0; // Start at zero for fade-in
      buffer.pan = pan / 100;
      buffer.pitch = pitch / 100;

      if (debug)
        console.log(`Preparing to fade in audio:`, {
          type,
          trackId,
          name,
          fadein,
        });

      // Fade-in
      if (fadein > 0) {
        buffer.play(true);
        FugsMultiTrackAudioEX.fadeVolume(type, trackId, volume, fadein);
      } else {
        if (debug)
          console.log(`Playing audio instantly:`, { type, trackId, name });
      }
      buffer.volume = volume / 100;
      buffer.play(true);

      if (debug)
        console.log(`Audio playback started:`, {
          type,
          trackId,
          name,
          volume,
          fadein,
          pan,
          pitch,
        });
      // this.tracks[key].startTime = performance.now();
    },

    // Stop
    stopAudio(type, trackId, fadeout = 0) {
      const key = `${type}_${trackId}`;
      const buffer = this.tracks[key];

      if (buffer) {
        if (fadeout > 0) {
          FugsMultiTrackAudioEX.fadeVolume(type, trackId, 0, fadeout);
        } else {
          setTimeout(() => {
            buffer.stop();
            delete this.tracks[key];
            if (debug)
              console.log(`Audio stopped after fadeout:`, { type, trackId });
          }, fadeout * 1000);
        }
      } else {
        console.warn(`No buffer found to stop:`, { type, trackId });
      }
      // this.tracks[key].stopTime = performance.now()
    },

    // Fade
    fadeVolume(type, trackId, targetVolume, duration) {
      const key = `${type}_${trackId}`;
      const buffer = this.tracks[key];
      if (debug) console.log(`fading: `, { type, trackId });

      if (buffer) {
        const startVolume = buffer.volume;
        const target = targetVolume / 100;
        const steps = 30;
        const interval = (duration * 1000) / steps;

        if (debug)
          console.log(`Fading volume:`, {
            type,
            trackId,
            startVolume,
            targetVolume,
            duration,
          });

        let currentStep = 0;
        const fadeInterval = setInterval(() => {
          currentStep++;
          buffer.volume =
            startVolume + (target - startVolume) * (currentStep / steps);
          if (currentStep >= steps) {
            clearInterval(fadeInterval);
            if (debug) console.log(`Volume fade complete:`, { type, trackId });
          }
        }, interval);
      } else {
        console.warn(`No buffer found to fade volume:`, { type, trackId });
      }
    },

    // Crossfade
    crossfade(fromType, fromTrackId, toType, toTrackId, name, duration) {
      const fromKey = `${fromType}_${fromTrackId}`;
      const buffer = this.tracks[fromKey];

      FugsMultiTrackAudioEX.playAudio(toType, toTrackId, name, 90, duration);

      if (debug)
        console.log(`Starting crossfade:`, {
          fromType,
          fromTrackId,
          toType,
          toTrackId,
          name,
          duration,
        });

      if (buffer) {
        FugsMultiTrackAudioEX.stopAudio(fromType, fromTrackId, duration);
      } else {
        if (debug) console.log("buffer:", buffer);
      }
    },
    stopAllBGM() {
      for (const key in this.tracks) {
        if ((this.tracks[key].type = "bgm")) {
          this.tracks[key].stop();
          delete this.tracks[key];
        }
      }
      if (debug) console.log("All custom BGM tracks stopped.");
    },
    stopAllBGS() {
      for (const key in this.tracks) {
        if ((this.tracks[key].type = "bgs")) {
          this.tracks[key].stop();
          delete this.tracks[key];
        }
      }
      if (debug) console.log("All custom BGS tracks stopped.");
    },
    stopAllME() {
      for (const key in this.tracks) {
        if ((this.tracks[key].type = "me")) {
          this.tracks[key].stop();
          delete this.tracks[key];
        }
      }
      if (debug) console.log("All custom ME tracks stopped.");
    },
    stopAllSE() {
      for (const key in this.tracks) {
        if ((this.tracks[key].type = "sem")) {
          this.tracks[key].stop();
          delete this.tracks[key];
        }
      }
      if (debug) console.log("All custom SE tracks stopped.");
    },
    stopAll() {
      for (const key in this.tracks) {
        this.tracks[key].stop();
        delete this.tracks[key];
      }
      if (debug) console.log("All custom audio tracks stopped.");
    },
    parseArguments(argsString) {
      const args = [];
      const regex = /"([^"]+)"|(\S+)/g;
      let match;
      while ((match = regex.exec(argsString)) !== null) {
        args.push(match[1] || match[2]); // Use quoted match or unquoted match
      }
      return args;
    },
  };

  // const _AudioManager_stopBgm = AudioManager.stopBgm;
  // AudioManager.stopBgm = function () {
  //   _AudioManager_stopBgm.call(this);
  //   FugsMultiTrackAudioEX.stopAllBGM(); // Stop custom BGM
  // };

  const _Scene_Title_start = Scene_Title.prototype.start;
  Scene_Title.prototype.start = function () {
    _Scene_Title_start.call(this);
    FugsMultiTrackAudioEX.stopAll();
  };

  const _DataManager_loadGame = DataManager.loadGame;
  DataManager.loadGame = function (savefileId) {
    const result = _DataManager_loadGame.call(this, savefileId);
    if (result) {
      FugsMultiTrackAudioEX.stopAll();
    }
    return result;
  };

  const _DataManager_setupNewGame = DataManager.setupNewGame;
  DataManager.setupNewGame = function () {
    _DataManager_setupNewGame.call(this);
    FugsMultiTrackAudioEX.stopAll();
  };

  // const _Scene_Base_terminate = Scene_Base.prototype.terminate;
  // Scene_Base.prototype.terminate = function () {
  //   _Scene_Base_terminate.call(this);
  //   FugsMultiTrackAudioEX.stopAll();
  // save tracks and resume?
  // };

  // const _Scene_Base_start = Scene_Base.prototype.start;
  // Scene_Base.prototype.start = function () {
  //   _Scene_Base_start.call(this);
  //   FugsMultiTrackAudioEX.stopAll();
  //   // This is where to resume
  // };

  const _Scene_Map_terminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    _Scene_Map_terminate.call(this);
    if (SceneManager.isNextScene(Scene_Battle)) {
      FugsMultiTrackAudioEX.stopAll();
      // FugsMultiTrackAudioEX.stopAllBGM();
      // FugsMultiTrackAudioEX.stopAllBGS();
    }
    // if (SceneManager.isNextScene(Scene_Map)) {
    // }
    // Scene_Map.prototype.stopAudioOnBattleStart
    // SceneManager.isPreviousScene(Scene_Battle)
    // SceneManager.isPreviousScene(Scene_Load)
    // (SceneManager.isNextScene(Scene_Title)
    // SceneManager.isNextScene(Scene_Gameover)
    //BattleManager.replayBgmAndBgs;
    // BattleManager.saveBgmAndBgs = function () {
    //   this._mapBgm = AudioManager.saveBgm();
    //   this._mapBgs = AudioManager.saveBgs();
    // };
  };
  const _Game_Interpreter_pluginCommand =
    Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function (command, argsString) {
    _Game_Interpreter_pluginCommand.call(this, command, argsString);

    const regex = /(?:play-|stop-|fade-|crossfade-)([a-zA-Z]+)(\d*)/i;
    const matches = command.match(regex);

    if (!matches) {
      return;
    }

    const commandCommand = matches[0].split("-")[0]; // play, stop, fade, crossfade
    const type = matches[1].toLowerCase(); // bgm, bgs, me, se.
    const trackId = matches[2] || "1"; // Track 1 default

    if (!["bgm", "bgs", "me", "se"].includes(type)) {
      console.error(
        `Invalid audio type: ${matches[1]}. Expected one of 'bgm', 'bgs', 'me', or 'se'.`
      );
      return;
    }

    if (debug)
      console.log("Command details parsed:", {
        commandCommand,
        type,
        trackId,
      });

    const args = FugsMultiTrackAudioEX.parseArguments(argsString.join(" "));
    if (debug) console.log("Parsed Args:", args);

    if (commandCommand === "play") {
      const [name, volume, fadein, pan, pitch] = args;
      FugsMultiTrackAudioEX.playAudio(
        type,
        trackId,
        name,
        volume,
        fadein,
        pan,
        pitch
      );
    } else if (commandCommand === "stop") {
      const fadeout = args[0] || 0;
      FugsMultiTrackAudioEX.stopAudio(type, trackId, fadeout);
    } else if (commandCommand === "fade") {
      const [targetVolume = 0, duration = 0] = args;
      FugsMultiTrackAudioEX.fadeVolume(type, trackId, targetVolume, duration);
    } else if (commandCommand === "crossfade") {
      const [arg0, name, duration = 120] = args;
      const regex = /([a-zA-Z]+)(\d*)/i;
      const matches = arg0.match(regex);
      if (!matches) {
        return console.error("No matches for crossfade args");
      }
      const toType = matches[1];
      const toTrackId = matches[2];
      if (debug)
        console.log(
          "crossfade args:",
          type,
          trackId,
          toType,
          toTrackId,
          name,
          duration
        );

      FugsMultiTrackAudioEX.crossfade(
        type,
        trackId,
        toType,
        toTrackId,
        name,
        duration
      );
    }
  };
})();
