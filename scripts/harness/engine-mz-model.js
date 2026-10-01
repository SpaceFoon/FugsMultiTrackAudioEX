/**
 * RPG Maker MZ (1.7.x) engine MODEL for the harness.
 *
 * Executed INSIDE the harness vm context (like the engine's own rmmz_*.js).
 *
 * This is NOT the real MZ source (proprietary, not redistributed here). It
 * re-implements the behaviour of the parts the Fugs plugins touch, following
 * rmmz_core.js / rmmz_managers.js / rmmz_objects.js 1.7.x. It was validated by
 * running the same scenario tests against the REAL MZ scripts
 * (see real-engine.js / RMMZ_JS_DIR), so where the two ever disagree the real
 * scripts win.
 *
 * Key MZ behaviours modelled (all differ from MV):
 *   - WebAudio keeps decoded data in `_buffers[]` and playing nodes in
 *     `_sourceNodes[]` (array). There is NO `_sourceNode` / `_buffer`.
 *   - `isPlaying()` is a flag set by play() immediately (even before load).
 *   - `pitch` setter restarts playback via play(this._loop, 0).
 *   - `destroy()` releases everything (MV has no destroy()).
 *   - AudioManager.createBuffer(folder, name): folder INCLUDES trailing slash
 *     ("bgm/"); URL = path + folder + Utils.encodeURI(name) + ext.
 *   - PluginManager.registerCommand / callCommand (MZ plugin commands).
 *   - Game_Interpreter has NO `_params`; commands receive `params`.
 *     command356 (MV-style plugin command) still calls pluginCommand().
 *   - DataManager.loadGame()/saveGame() return Promises.
 */

/* global navigator, Graphics, XMLHttpRequest, document, $gameMap, $dataSystem, $gameSwitches */

//-----------------------------------------------------------------------------
// Utils
function Utils() {
  throw new Error("This is a static class");
}
Utils.RPGMAKER_NAME = "MZ";
Utils.RPGMAKER_VERSION = "1.7.0";
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
Utils.isLocal = function () {
  return window.location.href.startsWith("file:");
};
Utils.canPlayOgg = function () {
  return true;
};
Utils.encodeURI = function (str) {
  return encodeURIComponent(str).replace(/%2F/g, "/");
};
Utils.extractFileName = function (filename) {
  return filename.split("/").pop();
};
Utils.hasEncryptedAudio = function () {
  return false;
};

function Graphics() {
  throw new Error("This is a static class");
}
Graphics.frameCount = 0;

//-----------------------------------------------------------------------------
// WebAudio (rmmz_core.js 1.7.x semantics, local-XHR load path)
function WebAudio() {
  this.initialize.apply(this, arguments);
}

WebAudio.prototype.initialize = function (url) {
  this.clear();
  this._url = url;
  this._startLoading();
};

WebAudio.initialize = function () {
  this._context = null;
  this._masterGainNode = null;
  this._masterVolume = 1;
  this._createContext();
  this._createMasterGainNode();
  return !!this._context;
};

WebAudio.setMasterVolume = function (value) {
  this._masterVolume = value;
  this._resetVolume();
};

WebAudio._createContext = function () {
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    this._context = new AC();
  } catch (e) {
    this._context = null;
  }
};

WebAudio._currentTime = function () {
  return this._context ? this._context.currentTime : 0;
};

WebAudio._createMasterGainNode = function () {
  var context = this._context;
  if (context) {
    this._masterGainNode = context.createGain();
    this._resetVolume();
    this._masterGainNode.connect(context.destination);
  }
};

WebAudio._resetVolume = function () {
  if (this._masterGainNode) {
    var gain = this._masterGainNode.gain;
    gain.setValueAtTime(this._masterVolume, this._currentTime());
  }
};

WebAudio.prototype.clear = function () {
  this.stop();
  this._data = null;
  this._fetchedSize = 0;
  this._fetchedData = [];
  this._buffers = [];
  this._sourceNodes = [];
  this._gainNode = null;
  this._pannerNode = null;
  this._totalTime = 0;
  this._sampleRate = 0;
  this._loop = 0;
  this._loopStart = 0;
  this._loopLength = 0;
  this._loopStartTime = 0;
  this._loopLengthTime = 0;
  this._startTime = 0;
  this._volume = 1;
  this._pitch = 1;
  this._pan = 0;
  this._endTimer = null;
  this._loadListeners = [];
  this._stopListeners = [];
  this._lastUpdateTime = 0;
  this._isLoaded = false;
  this._isError = false;
  this._isPlaying = false;
  this._decoder = null;
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
      this._gainNode.gain.setValueAtTime(this._volume, WebAudio._currentTime());
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
        this.play(this._loop, 0);
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
  return this._buffers && this._buffers.length > 0;
};

WebAudio.prototype.isError = function () {
  return this._isError;
};

WebAudio.prototype.isPlaying = function () {
  return this._isPlaying;
};

WebAudio.prototype.play = function (loop, offset) {
  this._loop = loop;
  if (this.isReady()) {
    offset = offset || 0;
    this._startPlaying(offset);
  } else if (WebAudio._context) {
    this.addLoadListener(() => this.play(loop, offset));
  }
  this._isPlaying = true;
};

WebAudio.prototype.stop = function () {
  this._isPlaying = false;
  this._removeEndTimer();
  this._removeNodes();
  this._loadListeners = [];
  if (this._stopListeners) {
    while (this._stopListeners.length > 0) {
      var listner = this._stopListeners.shift();
      listner();
    }
  }
};

WebAudio.prototype.destroy = function () {
  this._destroyDecoder();
  this.clear();
};

WebAudio.prototype.fadeIn = function (duration) {
  if (this.isReady()) {
    if (this._gainNode) {
      var gain = this._gainNode.gain;
      var currentTime = WebAudio._currentTime();
      gain.setValueAtTime(0, currentTime);
      gain.linearRampToValueAtTime(this._volume, currentTime + duration);
    }
  } else {
    this.addLoadListener(() => this.fadeIn(duration));
  }
};

WebAudio.prototype.fadeOut = function (duration) {
  if (this._gainNode) {
    var gain = this._gainNode.gain;
    var currentTime = WebAudio._currentTime();
    gain.setValueAtTime(this._volume, currentTime);
    gain.linearRampToValueAtTime(0, currentTime + duration);
  }
  this._isPlaying = false;
  this._loadListeners = [];
};

WebAudio.prototype.seek = function () {
  if (WebAudio._context) {
    var pos = (WebAudio._currentTime() - this._startTime) * this._pitch;
    if (this._loopLengthTime > 0) {
      while (pos >= this._loopStartTime + this._loopLengthTime) {
        pos -= this._loopLengthTime;
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

WebAudio.prototype.retry = function () {
  this._startLoading();
  if (this._isPlaying) {
    this.play(this._loop, 0);
  }
};

WebAudio.prototype._startLoading = function () {
  if (WebAudio._context) {
    var url = this._url + (Utils.hasEncryptedAudio() ? "_" : "");
    if (Utils.isLocal()) {
      this._startXhrLoading(url);
    } else {
      this._startFetching(url);
    }
    var currentTime = WebAudio._currentTime();
    this._lastUpdateTime = currentTime - 0.5;
    this._isError = false;
    this._isLoaded = false;
  }
};

// Web deployment: the file is fetched in chunks and decoded progressively.
WebAudio.prototype._startFetching = function (url) {
  var options = { credentials: "same-origin" };
  fetch(url, options)
    .then((response) => this._onFetch(response))
    .catch(() => this._onError());
};

WebAudio.prototype._onFetch = function (response) {
  if (response.ok) {
    var reader = response.body.getReader();
    var readChunk = (result) => {
      if (result.done) {
        this._isLoaded = true;
        if (this._fetchedSize > 0) {
          this._concatenateFetchedData();
          this._updateBuffer();
          this._data = null;
        }
        return 0;
      } else {
        this._onFetchProcess(result.value);
        return reader.read().then(readChunk);
      }
    };
    reader
      .read()
      .then(readChunk)
      .catch(() => this._onError());
  } else {
    this._onError();
  }
};

WebAudio.prototype._onFetchProcess = function (value) {
  this._fetchedSize += value.length;
  this._fetchedData.push(value);
  this._updateBufferOnFetch();
};

// Decode the data received so far at most once per second (and only past ~200 KB).
WebAudio.prototype._updateBufferOnFetch = function () {
  var currentTime = WebAudio._currentTime();
  var deltaTime = currentTime - this._lastUpdateTime;
  var currentData = this._data;
  var currentSize = currentData ? currentData.length : 0;
  if (deltaTime >= 1 && currentSize + this._fetchedSize >= 200000) {
    this._concatenateFetchedData();
    this._updateBuffer();
    this._lastUpdateTime = currentTime;
  }
};

WebAudio.prototype._concatenateFetchedData = function () {
  var currentData = this._data;
  var currentSize = currentData ? currentData.length : 0;
  var newData = new Uint8Array(currentSize + this._fetchedSize);
  var pos = 0;
  if (currentData) {
    newData.set(currentData);
    pos += currentSize;
  }
  for (var i = 0; i < this._fetchedData.length; i++) {
    newData.set(this._fetchedData[i], pos);
    pos += this._fetchedData[i].length;
  }
  this._data = newData;
  this._fetchedData = [];
  this._fetchedSize = 0;
};

WebAudio.prototype._destroyDecoder = function () {
  if (this._decoder) {
    this._decoder.destroy();
    this._decoder = null;
  }
};

WebAudio.prototype._startXhrLoading = function (url) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url);
  xhr.responseType = "arraybuffer";
  xhr.onload = () => this._onXhrLoad(xhr);
  xhr.onerror = this._onError.bind(this);
  xhr.send();
};

WebAudio.prototype._onXhrLoad = function (xhr) {
  if (xhr.status < 400) {
    this._data = new Uint8Array(xhr.response);
    this._isLoaded = true;
    this._updateBuffer();
  } else {
    this._onError();
  }
};

WebAudio.prototype._onError = function () {
  if (this._sourceNodes.length > 0) {
    this._stopSourceNode();
  }
  this._data = null;
  this._isError = true;
};

WebAudio.prototype._updateBuffer = function () {
  var arrayBuffer = this._data.buffer;
  // [Note] decodeAudioData() detaches its argument, so pass a copy.
  WebAudio._context
    .decodeAudioData(arrayBuffer.slice())
    .then((buffer) => this._onDecode(buffer))
    .catch(() => this._onError());
};

WebAudio.prototype._onDecode = function (buffer) {
  this._buffers = [];
  this._totalTime = 0;
  this._buffers.push(buffer);
  this._totalTime += buffer.duration;
  if (this._loopLength > 0 && this._sampleRate > 0) {
    this._loopStartTime = this._loopStart / this._sampleRate;
    this._loopLengthTime = this._loopLength / this._sampleRate;
  } else {
    this._loopStartTime = 0;
    this._loopLengthTime = this._totalTime;
  }
  if (this._sourceNodes.length > 0) {
    this._refreshSourceNode();
  }
  this._onLoad();
};

WebAudio.prototype._refreshSourceNode = function () {
  this._stopSourceNode();
  this._createAllSourceNodes();
  if (this._isPlaying) {
    this._startAllSourceNodes();
  }
  if (this._isPlaying) {
    this._removeEndTimer();
    this._createEndTimer();
  }
};

WebAudio.prototype._startPlaying = function (offset) {
  if (this._loopLengthTime > 0) {
    while (offset >= this._loopStartTime + this._loopLengthTime) {
      offset -= this._loopLengthTime;
    }
  }
  this._startTime = WebAudio._currentTime() - offset / this._pitch;
  this._removeEndTimer();
  this._removeNodes();
  this._createPannerNode();
  this._createGainNode();
  this._createAllSourceNodes();
  this._startAllSourceNodes();
  this._createEndTimer();
};

WebAudio.prototype._startAllSourceNodes = function () {
  for (var i = 0; i < this._sourceNodes.length; i++) {
    this._startSourceNode(i);
  }
};

WebAudio.prototype._startSourceNode = function (index) {
  var sourceNode = this._sourceNodes[index];
  var seekPos = this.seek();
  var currentTime = WebAudio._currentTime();
  var loop = this._loop;
  var loopStart = this._loopStartTime;
  var loopLength = this._loopLengthTime;
  var loopEnd = loopStart + loopLength;
  var pitch = this._pitch;
  var chunkStart = 0;
  for (var i = 0; i < index; i++) {
    chunkStart += this._buffers[i].duration;
  }
  var chunkEnd = chunkStart + sourceNode.buffer.duration;
  var when = 0;
  var offset = 0;
  if (seekPos >= chunkStart && seekPos < chunkEnd - 0.01) {
    when = currentTime;
    offset = seekPos - chunkStart;
  } else {
    when = currentTime + (chunkStart - seekPos) / pitch;
    offset = 0;
    if (loop) {
      if (when < currentTime - 0.01) {
        when += loopLength / pitch;
      }
      if (seekPos >= loopStart && chunkStart < loopStart) {
        when += (loopStart - chunkStart) / pitch;
        offset = loopStart - chunkStart;
      }
    }
  }
  if (when >= currentTime && offset < sourceNode.buffer.duration) {
    sourceNode.start(when, offset);
  }
};

WebAudio.prototype._stopSourceNode = function () {
  for (var i = 0; i < this._sourceNodes.length; i++) {
    var sourceNode = this._sourceNodes[i];
    try {
      sourceNode.onended = null;
      sourceNode.stop();
    } catch (e) {
      // Ignore InvalidStateError
    }
  }
};

WebAudio.prototype._createPannerNode = function () {
  this._pannerNode = WebAudio._context.createPanner();
  this._pannerNode.panningModel = "equalpower";
  this._pannerNode.connect(WebAudio._masterGainNode);
  this._updatePanner();
};

WebAudio.prototype._createGainNode = function () {
  var currentTime = WebAudio._currentTime();
  this._gainNode = WebAudio._context.createGain();
  this._gainNode.gain.setValueAtTime(this._volume, currentTime);
  this._gainNode.connect(this._pannerNode);
};

WebAudio.prototype._createAllSourceNodes = function () {
  for (var i = 0; i < this._buffers.length; i++) {
    this._createSourceNode(i);
  }
};

WebAudio.prototype._createSourceNode = function (index) {
  var sourceNode = WebAudio._context.createBufferSource();
  var currentTime = WebAudio._currentTime();
  sourceNode.buffer = this._buffers[index];
  sourceNode.loop = this._loop && this._isLoaded;
  sourceNode.loopStart = this._loopStartTime;
  sourceNode.loopEnd = this._loopStartTime + this._loopLengthTime;
  sourceNode.playbackRate.setValueAtTime(this._pitch, currentTime);
  sourceNode.connect(this._gainNode);
  this._sourceNodes[index] = sourceNode;
};

WebAudio.prototype._removeNodes = function () {
  if (this._sourceNodes && this._sourceNodes.length > 0) {
    this._stopSourceNode();
    this._sourceNodes = [];
    this._gainNode = null;
    this._pannerNode = null;
  }
};

WebAudio.prototype._createEndTimer = function () {
  if (this._sourceNodes.length > 0 && !this._loop) {
    var endTime = this._startTime + this._totalTime / this._pitch;
    var delay = endTime - WebAudio._currentTime();
    this._endTimer = setTimeout(this.stop.bind(this), delay * 1000);
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
// AudioManager (rmmz_managers.js 1.7.x semantics for what the plugins use)
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
AudioManager._staticBuffers = [];
AudioManager._path = "audio/";

AudioManager.audioFileExt = function () {
  return ".ogg";
};

// NOTE: folder INCLUDES the trailing slash in MZ ("bgm/").
AudioManager.createBuffer = function (folder, name) {
  var ext = this.audioFileExt();
  var url = this._path + folder + Utils.encodeURI(name) + ext;
  var buffer = new WebAudio(url);
  buffer.name = name;
  buffer.frameCount = Graphics.frameCount;
  return buffer;
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
    this._bgsBuffer = this.createBuffer("bgs/", bgs.name);
    this.updateBufferParameters(this._bgsBuffer, this._bgsVolume, bgs);
    this._bgsBuffer.play(true, pos || 0);
  }
  this._currentBgs = { name: bgs.name, volume: bgs.volume, pitch: bgs.pitch, pan: bgs.pan, pos: pos };
};
AudioManager.stopBgs = function () {
  if (this._bgsBuffer) {
    this._bgsBuffer.destroy();
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
// PluginManager (MZ): parameters + command registry
function PluginManager() {
  throw new Error("This is a static class");
}
PluginManager._scripts = [];
PluginManager._parameters = {};
PluginManager._commands = {};
PluginManager.parameters = function (name) {
  return this._parameters[name.toLowerCase()] || {};
};
PluginManager.setParameters = function (name, parameters) {
  this._parameters[name.toLowerCase()] = parameters;
};
PluginManager.registerCommand = function (pluginName, commandName, func) {
  var key = pluginName + ":" + commandName;
  this._commands[key] = func;
};
PluginManager.callCommand = function (self, pluginName, commandName, args) {
  var key = pluginName + ":" + commandName;
  var func = this._commands[key];
  if (typeof func === "function") {
    func.bind(self)(args);
  }
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
// Game_Interpreter (MZ): commands receive `params`; there is NO this._params
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
    this._indent = command.indent;
    var methodName = "command" + command.code;
    if (typeof this[methodName] === "function") {
      if (!this[methodName](command.parameters)) {
        return false;
      }
    }
    this._index++;
  } else {
    this.terminate();
  }
  return true;
};
// Plugin Command (MV)
Game_Interpreter.prototype.command356 = function (params) {
  var args = params[0].split(" ");
  var command = args.shift();
  this.pluginCommand(command, args);
  return true;
};
Game_Interpreter.prototype.pluginCommand = function () {
  // deprecated
};
// Plugin Command
Game_Interpreter.prototype.command357 = function (params) {
  var pluginName = Utils.extractFileName(params[0]);
  PluginManager.callCommand(this, pluginName, params[1], params[3]);
  return true;
};

//-----------------------------------------------------------------------------
// StorageManager / DataManager (MZ: Promise based)
function StorageManager() {
  throw new Error("This is a static class");
}
StorageManager._files = {};
StorageManager.ioLatencyMs = 20; // harness knob: simulated disk latency
StorageManager._later = function (fn) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      try {
        resolve(fn());
      } catch (e) {
        reject(e);
      }
    }, StorageManager.ioLatencyMs);
  });
};
StorageManager.saveObject = function (saveName, object) {
  var json = JSON.stringify(object); // like JsonEx: must be serialisable
  return this._later(function () {
    StorageManager._files[saveName] = json;
  });
};
StorageManager.loadObject = function (saveName) {
  return this._later(function () {
    if (!Object.prototype.hasOwnProperty.call(StorageManager._files, saveName)) {
      throw new Error("no such save");
    }
    return JSON.parse(StorageManager._files[saveName]);
  });
};
StorageManager.exists = function (saveName) {
  return Object.prototype.hasOwnProperty.call(this._files, saveName);
};

function DataManager() {
  throw new Error("This is a static class");
}
DataManager.makeSavename = function (savefileId) {
  return "file" + savefileId;
};
DataManager.createGameObjects = function () {
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
  var contents = this.makeSaveContents();
  var saveName = this.makeSavename(savefileId);
  return StorageManager.saveObject(saveName, contents).then(function () {
    return 0;
  });
};
DataManager.loadGame = function (savefileId) {
  var saveName = this.makeSavename(savefileId);
  return StorageManager.loadObject(saveName).then((contents) => {
    this.createGameObjects();
    this.extractSaveContents(contents);
    return 0;
  });
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
  return this._nextScene && this._nextScene.constructor === sceneClass;
};
SceneManager.isSceneChanging = function () {
  return this._exiting || !!this._nextScene;
};
SceneManager.goto = function (sceneClass) {
  if (sceneClass) {
    this._nextScene = new sceneClass();
  }
};
SceneManager.changeScene = function () {
  if (this.isSceneChanging()) {
    if (this._scene) {
      this._scene.terminate();
    }
    this._scene = this._nextScene;
    this._nextScene = null;
    if (this._scene) {
      this._scene.create();
    }
  }
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
// MZ: executeLoad(id) { DataManager.loadGame(id).then(onLoadSuccess).catch(onLoadFailure) }
Scene_Load.prototype.executeLoad = function (savefileId) {
  return DataManager.loadGame(savefileId)
    .then(() => this.onLoadSuccess())
    .catch(() => this.onLoadFailure());
};
Scene_Load.prototype.onLoadSuccess = function () {
  this._loadSuccess = true;
};
Scene_Load.prototype.onLoadFailure = function () {
  this._loadSuccess = false;
};
