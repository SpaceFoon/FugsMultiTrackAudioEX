//=======================================================================//
//                        FugsAudio7Compat.js                            //
//=======================================================================//
/*:
 * @plugindesc v2.2 Compatibility patches for Fugs MultiTrack Audio
 * @target MV 1.63
 * @author Fug
 *
 * @help
 * =========================================================================
 * FugsAudio7Compat — OPTIONAL
 * =========================================================================
 * Compatibility patches (OcRam fadeOutBgs guard). Place after OcRam if used.
 * Requires Core ABOVE this plugin. Soft no-op if OcRam is absent.
 *
 * Full docs: install FugsAudio0Docs and open it in Plugin Manager.
 * =========================================================================
 */

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
