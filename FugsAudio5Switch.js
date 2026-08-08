//=======================================================================//
//                        FugsAudio5Switch.js                            //
//=======================================================================//
/*:
 * @plugindesc v2.2 Switch-gated commands for Fugs MultiTrack Audio
 * @target MV 1.63
 * @author Fug
 *
 * @help
 * =========================================================================
 * FugsAudio5Switch — OPTIONAL
 * =========================================================================
 * Switch-gated commands (switch:N) + SwitchBuffer restores.
 * Requires Core ABOVE this plugin.
 *
 * Full docs: install FugsAudio0Docs and open it in Plugin Manager.
 * =========================================================================
 */

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
