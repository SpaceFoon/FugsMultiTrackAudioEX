/**
 * RPG Maker MV (1.6.x) engine MODEL for the harness.
 *
 * This file is executed INSIDE the harness vm context (like the engine's own
 * rpg_*.js files), so it uses plain `function X(){}` globals.
 *
 * It is NOT the real MV source (which is proprietary and not redistributed
 * here). It re-implements the behaviour of the parts the Fugs plugins touch,
 * following rpg_core.js / rpg_managers.js / rpg_objects.js 1.6.x:
 *
 *   - WebAudio: ONE `_sourceNode`, one decoded `_buffer`, `isPlaying()` means
 *     "has a source node", `pitch` setter restarts playback, XHR + callback
 *     style decodeAudioData, `_autoPlay` + load listeners, end timer, stop
 *     listeners, `seek()` from `_startTime`.
 *   - AudioManager.createBuffer(folder, name): folder WITHOUT trailing slash
 *     ("bgm"), Html5Audio for BGM on Android Chrome.
 *   - Game_Interpreter: `this._params`, command356 -> pluginCommand(command, args)
 *     (space-split, no quote handling).
 *   - DataManager.loadGame(): synchronous, returns true/false.
 *
 * Keep behaviour changes here in sync with the MZ model / real MZ scripts by
 * running the same scenario tests against every backend.
 */

/* global navigator, Graphics, XMLHttpRequest, document, $gameMap, $dataSystem, $gameSwitches */

//-----------------------------------------------------------------------------
// Utils
function Utils() {
  throw new Error("This is a static class");
}
Utils.RPGMAKER_NAME = "MV";
Utils.RPGMAKER_VERSION = "1.6.2";
Utils.isOptionValid = function () {
  return false;
};
Utils.isNwjs = function () {
  return true;
};
Utils.isMobileDevice = function () {
  var r = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  return !!navigator.userAgent.match(r);
};
Utils.isAndroidChrome = function () {
  var agent = navigator.userAgent;
  return !!(agent.match(/Android/) && agent.match(/Chrome/));
};

function Decrypter() {
  throw new Error("This is a static class");
}
Decrypter.hasEncryptedAudio = false;

function Graphics() {
  throw new Error("This is a static class");
}
Graphics.frameCount = 0;

//-----------------------------------------------------------------------------
// WebAudio (rpg_core.js 1.6.x semantics)
function WebAudio() {
  this.initialize.apply(this, arguments);
}

WebAudio._masterVolume = 1;
WebAudio._context = null;
WebAudio._masterGainNode = null;
WebAudio._initialized = false;

WebAudio.initialize = function (noAudio) {
  if (!this._initialized) {
    if (!noAudio) {
      this._createContext();
      this._createMasterGainNode();
    }
    this._initialized = true;
  }
  return !!this._context;
};

WebAudio.canPlayOgg = function () {
  return true;
};

WebAudio._createContext = function () {
  try {
    if (typeof AudioContext !== "undefined") {
      this._context = new AudioContext();
    }
  } catch (e) {
    this._context = null;
  }
};

WebAudio._createMasterGainNode = function () {
  var context = WebAudio._context;
  if (context) {
    this._masterGainNode = context.createGain();
    this._masterGainNode.gain.setValueAtTime(this._masterVolume, context.currentTime);
    this._masterGainNode.connect(context.destination);
  }
};

WebAudio.prototype.initialize = function (url) {
  if (!WebAudio._initialized) {
    WebAudio.initialize();
  }
  this.clear();
  this._load(url);
  this._url = url;
};

WebAudio.prototype.clear = function () {
  this.stop();
  this._buffer = null;
  this._sourceNode = null;
  this._gainNode = null;
  this._pannerNode = null;
  this._totalTime = 0;
  this._sampleRate = 0;
  this._loopStart = 0;
  this._loopLength = 0;
  this._startTime = 0;
  this._volume = 1;
  this._pitch = 1;
  this._pan = 0;
  this._endTimer = null;
  this._loadListeners = [];
  this._stopListeners = [];
  this._hasError = false;
  this._autoPlay = false;
};

Object.defineProperty(WebAudio.prototype, "url", {
  get: function () {
    return this._url;
  },
  configurable: true,
});

Object.defineProperty(WebAudio.prototype, "volume", {
  get: function () {
    return this._volume;
  },
  set: function (value) {
    this._volume = value;
    if (this._gainNode) {
      this._gainNode.gain.setValueAtTime(this._volume, WebAudio._context.currentTime);
    }
  },
  configurable: true,
});

Object.defineProperty(WebAudio.prototype, "pitch", {
  get: function () {
    return this._pitch;
  },
  set: function (value) {
    if (this._pitch !== value) {
      this._pitch = value;
      if (this.isPlaying()) {
        this.play(this._sourceNode.loop, 0);
      }
    }
  },
  configurable: true,
});

Object.defineProperty(WebAudio.prototype, "pan", {
  get: function () {
    return this._pan;
  },
  set: function (value) {
    this._pan = value;
    this._updatePanner();
  },
  configurable: true,
});

WebAudio.prototype.isReady = function () {
  return !!this._buffer;
};

WebAudio.prototype.isError = function () {
  return this._hasError;
};

WebAudio.prototype.isPlaying = function () {
  return !!this._sourceNode;
};

WebAudio.prototype.play = function (loop, offset) {
  if (this.isReady()) {
    offset = offset || 0;
    this._startPlaying(loop, offset);
  } else if (WebAudio._context) {
    this._autoPlay = true;
    this.addLoadListener(
      function () {
        if (this._autoPlay) {
          this.play(loop, offset);
        }
      }.bind(this)
    );
  }
};

WebAudio.prototype.stop = function () {
  this._autoPlay = false;
  this._removeEndTimer();
  this._removeNodes();
  if (this._stopListeners) {
    while (this._stopListeners.length > 0) {
      var listner = this._stopListeners.shift();
      listner();
    }
  }
};

WebAudio.prototype.fadeIn = function (duration) {
  if (this.isReady()) {
    if (this._gainNode) {
      var gain = this._gainNode.gain;
      var currentTime = WebAudio._context.currentTime;
      gain.setValueAtTime(0, currentTime);
      gain.linearRampToValueAtTime(this._volume, currentTime + duration);
    }
  } else {
    this.addLoadListener(
      function () {
        this.fadeIn(duration);
      }.bind(this)
    );
  }
};

WebAudio.prototype.fadeOut = function (duration) {
  if (this._gainNode) {
    var gain = this._gainNode.gain;
    var currentTime = WebAudio._context.currentTime;
    gain.setValueAtTime(this._volume, currentTime);
    gain.linearRampToValueAtTime(0, currentTime + duration);
  }
  this._autoPlay = false;
};

WebAudio.prototype.seek = function () {
  if (WebAudio._context) {
    var pos = (WebAudio._context.currentTime - this._startTime) * this._pitch;
    if (this._loopLength > 0) {
      while (pos >= this._loopStart + this._loopLength) {
        pos -= this._loopLength;
      }
    }
    return pos;
  } else {
    return 0;
  }
};

WebAudio.prototype.addLoadListener = function (listner) {
  this._loadListeners.push(listner);
};

WebAudio.prototype.addStopListener = function (listner) {
  this._stopListeners.push(listner);
};

WebAudio.prototype._load = function (url) {
  if (WebAudio._context) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "arraybuffer";
    xhr.onload = function () {
      if (xhr.status < 400) {
        this._onXhrLoad(xhr);
      }
    }.bind(this);
    xhr.onerror = function () {
      this._hasError = true;
    }.bind(this);
    xhr.send();
  }
};

WebAudio.prototype._onXhrLoad = function (xhr) {
  var array = xhr.response;
  // (loop-tag parsing omitted in the model: no LOOPSTART/LOOPLENGTH in fake files)
  WebAudio._context.decodeAudioData(
    array,
    function (buffer) {
      this._buffer = buffer;
      this._totalTime = buffer.duration;
      if (this._loopLength > 0 && this._sampleRate > 0) {
        this._loopStart /= this._sampleRate;
        this._loopLength /= this._sampleRate;
      } else {
        this._loopStart = 0;
        this._loopLength = this._totalTime;
      }
      this._onLoad();
    }.bind(this)
  );
};

WebAudio.prototype._startPlaying = function (loop, offset) {
  if (this._loopLength > 0) {
    while (offset >= this._loopStart + this._loopLength) {
      offset -= this._loopLength;
    }
  }
  this._removeEndTimer();
  this._removeNodes();
  this._createNodes();
  this._connectNodes();
  this._sourceNode.loop = loop;
  this._sourceNode.start(0, offset);
  this._startTime = WebAudio._context.currentTime - offset / this._pitch;
  this._createEndTimer();
};

WebAudio.prototype._createNodes = function () {
  var context = WebAudio._context;
  this._sourceNode = context.createBufferSource();
  this._sourceNode.buffer = this._buffer;
  this._sourceNode.loopStart = this._loopStart;
  this._sourceNode.loopEnd = this._loopStart + this._loopLength;
  this._sourceNode.playbackRate.setValueAtTime(this._pitch, context.currentTime);
  this._gainNode = context.createGain();
  this._gainNode.gain.setValueAtTime(this._volume, context.currentTime);
  this._pannerNode = context.createPanner();
  this._pannerNode.panningModel = "equalpower";
  this._updatePanner();
};

WebAudio.prototype._connectNodes = function () {
  this._sourceNode.connect(this._gainNode);
  this._gainNode.connect(this._pannerNode);
  this._pannerNode.connect(WebAudio._masterGainNode);
};

WebAudio.prototype._removeNodes = function () {
  if (this._sourceNode) {
    this._sourceNode.stop(0);
    this._sourceNode = null;
    this._gainNode = null;
    this._pannerNode = null;
  }
};

WebAudio.prototype._createEndTimer = function () {
  if (this._sourceNode && !this._sourceNode.loop) {
    var endTime = this._startTime + this._totalTime / this._pitch;
    var delay = endTime - WebAudio._context.currentTime;
    this._endTimer = setTimeout(
      function () {
        this.stop();
      }.bind(this),
      delay * 1000
    );
  }
};

WebAudio.prototype._removeEndTimer = function () {
  if (this._endTimer) {
    clearTimeout(this._endTimer);
    this._endTimer = null;
  }
};

WebAudio.prototype._updatePanner = function () {
  if (this._pannerNode) {
    var x = this._pan;
    var z = 1 - Math.abs(x);
    this._pannerNode.setPosition(x, 0, z);
  }
};

WebAudio.prototype._onLoad = function () {
  while (this._loadListeners.length > 0) {
    var listner = this._loadListeners.shift();
    listner();
  }
};

//-----------------------------------------------------------------------------
// Html5Audio (singleton used for BGM on Android Chrome in MV)
function Html5Audio() {
  throw new Error("This is a static class");
}
Html5Audio._url = null;
Html5Audio._setupCalls = 0;
Html5Audio._loadListeners = [];
Html5Audio._stopListeners = [];
Html5Audio._volume = 1;
Html5Audio._pitch = 1;
Html5Audio._pan = 0;
Html5Audio._playing = false;
Html5Audio.setup = function (url) {
  this._url = url;
  this._setupCalls++;
  this._playing = false;
};
Html5Audio.isReady = function () {
  return true;
};
Html5Audio.isPlaying = function () {
  return this._playing;
};
Html5Audio.play = function (loop, offset) {
  this._playing = true;
  this._loop = loop;
  this._offset = offset || 0;
};
Html5Audio.stop = function () {
  this._playing = false;
};
Html5Audio.seek = function () {
  return 0;
};
Html5Audio.addLoadListener = function (fn) {
  fn();
};
Html5Audio.addStopListener = function (fn) {
  this._stopListeners.push(fn);
};
Html5Audio.fadeIn = function () {};
Html5Audio.fadeOut = function () {};
Object.defineProperty(Html5Audio, "volume", {
  get: function () {
    return this._volume;
  },
  set: function (v) {
    this._volume = v;
  },
  configurable: true,
});
Object.defineProperty(Html5Audio, "pitch", {
  get: function () {
    return this._pitch;
  },
  set: function (v) {
    this._pitch = v;
  },
  configurable: true,
});
Object.defineProperty(Html5Audio, "pan", {
  get: function () {
    return this._pan;
  },
  set: function (v) {
    this._pan = v;
  },
  configurable: true,
});

//-----------------------------------------------------------------------------
// AudioManager (rpg_managers.js 1.6.x semantics for what the plugins use)
function AudioManager() {
  throw new Error("This is a static class");
}
AudioManager._bgmVolume = 100;
AudioManager._bgsVolume = 100;
AudioManager._meVolume = 100;
AudioManager._seVolume = 100;
AudioManager._currentBgm = null;
AudioManager._currentBgs = null;
AudioManager._bgmBuffer = null;
AudioManager._bgsBuffer = null;
AudioManager._meBuffer = null;
AudioManager._seBuffers = [];
AudioManager._path = "audio/";
AudioManager._blobUrl = null;

AudioManager.audioFileExt = function () {
  if (WebAudio.canPlayOgg() && !Utils.isMobileDevice()) {
    return ".ogg";
  } else {
    return ".m4a";
  }
};

AudioManager.shouldUseHtml5Audio = function () {
  // Android Chrome: decodeAudioData() is slow, so MV plays BGM via <audio>.
  return Utils.isAndroidChrome() && !Decrypter.hasEncryptedAudio;
};

// NOTE: folder has NO trailing slash in MV ("bgm"), the method adds it.
AudioManager.createBuffer = function (folder, name) {
  var ext = this.audioFileExt();
  var url = this._path + folder + "/" + encodeURIComponent(name) + ext;
  if (this.shouldUseHtml5Audio() && folder === "bgm") {
    if (this._blobUrl) Html5Audio.setup(this._blobUrl);
    else Html5Audio.setup(url);
    return Html5Audio;
  } else {
    return new WebAudio(url);
  }
};

AudioManager.updateBufferParameters = function (buffer, configVolume, audio) {
  if (buffer && audio) {
    buffer.volume = (configVolume * (audio.volume || 0)) / 10000;
    buffer.pitch = (audio.pitch || 0) / 100;
    buffer.pan = (audio.pan || 0) / 100;
  }
};

AudioManager.playBgs = function (bgs, pos) {
  this.stopBgs();
  if (bgs.name) {
    this._bgsBuffer = this.createBuffer("bgs", bgs.name);
    this.updateBufferParameters(this._bgsBuffer, this._bgsVolume, bgs);
    this._bgsBuffer.play(true, pos || 0);
  }
  this._currentBgs = { name: bgs.name, volume: bgs.volume, pitch: bgs.pitch, pan: bgs.pan, pos: pos };
};
AudioManager.stopBgs = function () {
  if (this._bgsBuffer) {
    this._bgsBuffer.stop();
    this._bgsBuffer = null;
    this._currentBgs = null;
  }
};
AudioManager.fadeOutBgs = function (duration) {
  if (this._bgsBuffer && this._currentBgs) {
    this._bgsBuffer.fadeOut(duration);
    this._currentBgs = null;
  }
};
AudioManager.stopAll = function () {
  this.stopBgs();
};

//-----------------------------------------------------------------------------
// PluginManager (MV): parameters only, no command registry
function PluginManager() {
  throw new Error("This is a static class");
}
PluginManager._path = "js/plugins/";
PluginManager._scripts = [];
PluginManager._parameters = {};
PluginManager.parameters = function (name) {
  return this._parameters[name.toLowerCase()] || {};
};
PluginManager.setParameters = function (name, parameters) {
  this._parameters[name.toLowerCase()] = parameters;
};

//-----------------------------------------------------------------------------
// Game_Switches
function Game_Switches() {
  this.initialize.apply(this, arguments);
}
Game_Switches.prototype.initialize = function () {
  this.clear();
};
Game_Switches.prototype.clear = function () {
  this._data = [];
};
Game_Switches.prototype.value = function (switchId) {
  return !!this._data[switchId];
};
Game_Switches.prototype.setValue = function (switchId, value) {
  if (switchId > 0 && switchId < $dataSystem.switches.length) {
    this._data[switchId] = value;
    this.onChange();
  }
};
Game_Switches.prototype.onChange = function () {
  if (typeof $gameMap !== "undefined" && $gameMap && $gameMap.requestRefresh) $gameMap.requestRefresh();
};

//-----------------------------------------------------------------------------
// Game_Interpreter (MV): commands read this._params
function Game_Interpreter() {
  this.initialize.apply(this, arguments);
}
Game_Interpreter.prototype.initialize = function (depth) {
  this._depth = depth || 0;
  this.clear();
};
Game_Interpreter.prototype.clear = function () {
  this._mapId = 0;
  this._eventId = 0;
  this._list = null;
  this._index = 0;
  this._waitCount = 0;
  this._waitMode = "";
  this._childInterpreter = null;
};
Game_Interpreter.prototype.setup = function (list, eventId) {
  this.clear();
  this._mapId = $gameMap.mapId();
  this._eventId = eventId || 0;
  this._list = list;
};
Game_Interpreter.prototype.isRunning = function () {
  return !!this._list;
};
Game_Interpreter.prototype.update = function () {
  while (this.isRunning()) {
    if (this.updateChild() || this.updateWait()) {
      break;
    }
    if (SceneManager.isSceneChanging()) {
      break;
    }
    if (!this.executeCommand()) {
      break;
    }
  }
};
Game_Interpreter.prototype.updateChild = function () {
  return false;
};
Game_Interpreter.prototype.updateWait = function () {
  return false;
};
Game_Interpreter.prototype.terminate = function () {
  this._list = null;
};
Game_Interpreter.prototype.currentCommand = function () {
  return this._list[this._index];
};
Game_Interpreter.prototype.executeCommand = function () {
  var command = this.currentCommand();
  if (command) {
    this._params = command.parameters;
    this._indent = command.indent;
    var methodName = "command" + command.code;
    if (typeof this[methodName] === "function") {
      if (!this[methodName]()) {
        return false;
      }
    }
    this._index++;
  } else {
    this.terminate();
  }
  return true;
};
// Plugin Command
Game_Interpreter.prototype.command356 = function () {
  var args = this._params[0].split(" ");
  var command = args.shift();
  this.pluginCommand(command, args);
  return true;
};
Game_Interpreter.prototype.pluginCommand = function (/* command, args */) {
  // to be overridden by plugins
};

//-----------------------------------------------------------------------------
// StorageManager / DataManager (MV: synchronous)
function StorageManager() {
  throw new Error("This is a static class");
}
StorageManager._files = {};
StorageManager.save = function (savefileId, json) {
  this._files["file" + savefileId] = json;
};
StorageManager.load = function (savefileId) {
  return this._files["file" + savefileId];
};
StorageManager.exists = function (savefileId) {
  return Object.prototype.hasOwnProperty.call(this._files, "file" + savefileId);
};

function DataManager() {
  throw new Error("This is a static class");
}
DataManager.createGameObjects = function () {
  // fresh state, like the real thing
  $gameSwitches = new Game_Switches();
};
DataManager.setupNewGame = function () {
  this.createGameObjects();
};
DataManager.makeSaveContents = function () {
  var contents = {};
  contents.switches = $gameSwitches;
  return contents;
};
DataManager.extractSaveContents = function (contents) {
  $gameSwitches = Object.assign(new Game_Switches(), contents.switches);
};
DataManager.saveGame = function (savefileId) {
  try {
    StorageManager.save(savefileId, JSON.stringify(this.makeSaveContents()));
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};
DataManager.loadGame = function (savefileId) {
  try {
    if (StorageManager.exists(savefileId)) {
      var json = StorageManager.load(savefileId);
      this.createGameObjects();
      this.extractSaveContents(JSON.parse(json));
      return true;
    }
    return false;
  } catch (e) {
    console.error(e);
    return false;
  }
};

//-----------------------------------------------------------------------------
// SceneManager + minimal scenes (only the methods the plugins wrap)
function SceneManager() {
  throw new Error("This is a static class");
}
SceneManager._scene = null;
SceneManager._nextScene = null;
SceneManager._stack = [];
SceneManager.isNextScene = function (sceneClass) {
  return !!this._nextScene && this._nextScene.constructor === sceneClass;
};
SceneManager.isSceneChanging = function () {
  return !!this._nextScene;
};
SceneManager.goto = function (sceneClass) {
  if (sceneClass) this._nextScene = new sceneClass();
};

function Scene_Base() {}
Scene_Base.prototype.create = function () {};
Scene_Base.prototype.start = function () {};
Scene_Base.prototype.update = function () {};
Scene_Base.prototype.terminate = function () {};

function Scene_Title() {}
Scene_Title.prototype = Object.create(Scene_Base.prototype);
Scene_Title.prototype.constructor = Scene_Title;

function Scene_Map() {}
Scene_Map.prototype = Object.create(Scene_Base.prototype);
Scene_Map.prototype.constructor = Scene_Map;

function Scene_Battle() {}
Scene_Battle.prototype = Object.create(Scene_Base.prototype);
Scene_Battle.prototype.constructor = Scene_Battle;

function Scene_Menu() {}
Scene_Menu.prototype = Object.create(Scene_Base.prototype);
Scene_Menu.prototype.constructor = Scene_Menu;

function Scene_Load() {}
Scene_Load.prototype = Object.create(Scene_Base.prototype);
Scene_Load.prototype.constructor = Scene_Load;
// MV: onSavefileOk() { if (DataManager.loadGame(id)) onLoadSuccess() else onLoadFailure() }
Scene_Load.prototype.performLoad = function (savefileId) {
  if (DataManager.loadGame(savefileId)) {
    this.onLoadSuccess();
    return true;
  }
  this.onLoadFailure();
  return false;
};
Scene_Load.prototype.onLoadSuccess = function () {
  this._loadSuccess = true;
};
Scene_Load.prototype.onLoadFailure = function () {
  this._loadSuccess = false;
};
