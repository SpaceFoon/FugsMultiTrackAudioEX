/**
 * Strict fake Web Audio API for the engine harness.
 *
 * Goals (why this is not a "stub that accepts anything"):
 *  - Keeps a REAL node graph so tests can assert routing
 *    ("is the effect chain actually between source and gain?",
 *     "does anything stay connected to the destination after stop?").
 *  - Models AudioParam automation (setValueAtTime / ramps / setTargetAtTime /
 *    cancelScheduledValues) closely enough to read effective values.
 *  - Tracks real playback POSITION of every BufferSource (integrating
 *    playbackRate), so tests can prove "the song did not restart" and check
 *    seek() accuracy after pitch changes.
 *  - Throws the same kinds of errors browsers throw for API misuse
 *    (disconnect() of a non-existent connection, stop() before start(),
 *    non-finite param values, bad enum values, wrong context, ...).
 *
 * Time comes from the shared virtual clock (clock.js).
 */
"use strict";

class InvalidStateError extends Error {
  constructor(m) {
    super(m);
    this.name = "InvalidStateError";
  }
}
class InvalidAccessError extends Error {
  constructor(m) {
    super(m);
    this.name = "InvalidAccessError";
  }
}
class NotSupportedError extends Error {
  constructor(m) {
    super(m);
    this.name = "NotSupportedError";
  }
}
class IndexSizeError extends Error {
  constructor(m) {
    super(m);
    this.name = "IndexSizeError";
  }
}

function assertFinite(v, what) {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new TypeError(`${what}: The provided float value is non-finite (${v}).`);
  }
}

function createFakeAudio(clock, opts) {
  opts = opts || {};
  const decodeDelayMs = opts.decodeDelayMs != null ? opts.decodeDelayMs : 5;
  const sampleRate = opts.sampleRate || 48000;
  const contexts = [];
  let nodeSeq = 0;

  // ---------------------------------------------------------------- AudioParam
  class FakeAudioParam {
    constructor(ctx, name, initial, owner) {
      this._ctx = ctx;
      this.name = name;
      this._initial = initial;
      this.defaultValue = initial;
      this._events = [];
      this._owner = owner;
    }

    _insert(ev) {
      let i = this._events.length;
      while (i > 0 && this._events[i - 1].time > ev.time) i--;
      this._events.splice(i, 0, ev);
    }

    _evalSeg(seg, t) {
      if (seg.kind === "const") return seg.v;
      if (seg.tc === 0) return seg.target;
      return seg.target + (seg.v0 - seg.target) * Math.exp(-(t - seg.t0) / seg.tc);
    }

    valueAt(t) {
      let seg = { kind: "const", v: this._initial };
      let prevT = 0;
      for (const e of this._events) {
        if (e.time > t) {
          if (e.type === "linear" || e.type === "exp") {
            const v0 = this._evalSeg(seg, prevT);
            const span = e.time - prevT;
            const frac = span <= 0 ? 1 : Math.min(1, Math.max(0, (t - prevT) / span));
            if (e.type === "linear") return v0 + (e.value - v0) * frac;
            if (v0 > 0 && e.value > 0) return v0 * Math.pow(e.value / v0, frac);
            return v0;
          }
          break;
        }
        const vBefore = this._evalSeg(seg, e.time);
        if (e.type === "target") {
          seg = { kind: "target", t0: e.time, v0: vBefore, target: e.value, tc: e.tc };
        } else {
          seg = { kind: "const", v: e.value };
        }
        prevT = e.time;
      }
      return this._evalSeg(seg, t);
    }

    get value() {
      return this.valueAt(this._ctx.currentTime);
    }
    set value(v) {
      assertFinite(v, `AudioParam(${this.name}).value`);
      this.setValueAtTime(v, this._ctx.currentTime);
    }

    setValueAtTime(v, t) {
      assertFinite(v, `${this.name}.setValueAtTime value`);
      assertFinite(t, `${this.name}.setValueAtTime time`);
      if (t < 0) throw new RangeError(`${this.name}.setValueAtTime: time must be >= 0`);
      this._insert({ type: "set", time: t, value: v });
      return this;
    }
    linearRampToValueAtTime(v, t) {
      assertFinite(v, `${this.name}.linearRampToValueAtTime value`);
      assertFinite(t, `${this.name}.linearRampToValueAtTime time`);
      if (t < 0) throw new RangeError(`${this.name}.linearRampToValueAtTime: time must be >= 0`);
      this._insert({ type: "linear", time: t, value: v });
      return this;
    }
    exponentialRampToValueAtTime(v, t) {
      assertFinite(v, `${this.name}.exponentialRampToValueAtTime value`);
      assertFinite(t, `${this.name}.exponentialRampToValueAtTime time`);
      if (v === 0) throw new RangeError(`${this.name}.exponentialRampToValueAtTime: value must not be 0`);
      this._insert({ type: "exp", time: t, value: v });
      return this;
    }
    setTargetAtTime(target, t, tc) {
      assertFinite(target, `${this.name}.setTargetAtTime target`);
      assertFinite(t, `${this.name}.setTargetAtTime startTime`);
      assertFinite(tc, `${this.name}.setTargetAtTime timeConstant`);
      if (t < 0) throw new RangeError(`${this.name}.setTargetAtTime: startTime must be >= 0`);
      if (tc < 0) throw new RangeError(`${this.name}.setTargetAtTime: timeConstant must be >= 0`);
      this._insert({ type: "target", time: t, value: target, tc });
      return this;
    }
    cancelScheduledValues(t) {
      assertFinite(t, `${this.name}.cancelScheduledValues`);
      if (t < 0) throw new RangeError(`${this.name}.cancelScheduledValues: time must be >= 0`);
      // Chromium semantics: drop events at/after t, keep earlier (incl. in-progress setTarget)
      this._events = this._events.filter((e) => e.time < t);
      return this;
    }
    cancelAndHoldAtTime(t) {
      return this.cancelScheduledValues(t);
    }
    setValueCurveAtTime() {
      throw new NotSupportedError("setValueCurveAtTime is not modelled by the fake");
    }
  }

  // ------------------------------------------------------------------ AudioNode
  class FakeNode {
    constructor(ctx, kind, inputs, outputs) {
      this.context = ctx;
      this._kind = kind;
      this._id = ++nodeSeq;
      this.numberOfInputs = inputs;
      this.numberOfOutputs = outputs;
      this._cc = 2;
      this._ccm = "max";
      this._cci = "speakers";
      ctx._nodes.push(this);
    }

    get channelCount() {
      return this._cc;
    }
    set channelCount(v) {
      this._cc = v;
    }
    get channelCountMode() {
      return this._ccm;
    }
    set channelCountMode(v) {
      this._ccm = v;
    }
    get channelInterpretation() {
      return this._cci;
    }
    set channelInterpretation(v) {
      this._cci = v;
    }

    _param(name, initial) {
      const p = new FakeAudioParam(this.context, `${this._kind}.${name}`, initial, this);
      return p;
    }

    connect(dest, output, input) {
      output = output || 0;
      input = input || 0;
      if (!(dest instanceof FakeNode) && !(dest instanceof FakeAudioParam)) {
        throw new TypeError("Failed to execute 'connect' on 'AudioNode': parameter 1 is not of type 'AudioNode'.");
      }
      const destCtx = dest instanceof FakeNode ? dest.context : dest._ctx;
      if (destCtx !== this.context) {
        throw new InvalidAccessError("cannot connect to a destination belonging to a different audio context.");
      }
      if (output >= this.numberOfOutputs) throw new IndexSizeError(`output index ${output} out of range`);
      if (dest instanceof FakeNode && input >= dest.numberOfInputs) {
        throw new IndexSizeError(`input index ${input} out of range`);
      }
      const dup = this.context._edges.find(
        (e) => e.from === this && e.to === dest && e.output === output && e.input === input
      );
      if (!dup) this.context._edges.push({ from: this, to: dest, output, input });
      return dest;
    }

    disconnect(dest, output, input) {
      const edges = this.context._edges;
      if (dest === undefined) {
        this.context._edges = edges.filter((e) => e.from !== this);
        return;
      }
      if (typeof dest === "number") {
        // disconnect(output)
        this.context._edges = edges.filter((e) => !(e.from === this && e.output === dest));
        return;
      }
      const match = (e) =>
        e.from === this &&
        e.to === dest &&
        (output === undefined || e.output === output) &&
        (input === undefined || e.input === input);
      if (!edges.some(match)) {
        throw new InvalidAccessError("the given destination is not connected.");
      }
      this.context._edges = edges.filter((e) => !match(e));
    }
  }

  class FakeGain extends FakeNode {
    constructor(ctx) {
      super(ctx, "Gain", 1, 1);
      this.gain = this._param("gain", 1);
    }
  }

  class FakeStereoPanner extends FakeNode {
    constructor(ctx) {
      super(ctx, "StereoPanner", 1, 1);
      this.pan = this._param("pan", 0);
    }
  }

  class FakePanner extends FakeNode {
    constructor(ctx) {
      super(ctx, "Panner", 1, 1);
      this._panningModel = "equalpower";
      this.distanceModel = "inverse";
      this.position = { x: 0, y: 0, z: 0 };
    }
    get panningModel() {
      return this._panningModel;
    }
    set panningModel(v) {
      if (v !== "equalpower" && v !== "HRTF") throw new TypeError(`invalid panningModel '${v}'`);
      this._panningModel = v;
    }
    setPosition(x, y, z) {
      assertFinite(x, "Panner.setPosition x");
      assertFinite(y, "Panner.setPosition y");
      assertFinite(z, "Panner.setPosition z");
      this.position = { x, y, z };
    }
    setOrientation() {}
    setVelocity() {}
  }

  class FakeAnalyser extends FakeNode {
    constructor(ctx) {
      super(ctx, "Analyser", 1, 1);
      this.fftSize = 2048;
      this.smoothingTimeConstant = 0.8;
      this.frequencyBinCount = 1024;
    }
    /** Fills with a square-ish wave whose RMS equals the graph level feeding this node. */
    getFloatTimeDomainData(arr) {
      const level = this.context.levelAt(this);
      for (let i = 0; i < arr.length; i++) arr[i] = i % 2 ? level : -level;
    }
    getByteTimeDomainData(arr) {
      const level = this.context.levelAt(this);
      for (let i = 0; i < arr.length; i++) arr[i] = 128 + Math.round((i % 2 ? level : -level) * 127);
    }
  }

  const BIQUAD_TYPES = ["lowpass", "highpass", "bandpass", "lowshelf", "highshelf", "peaking", "notch", "allpass"];
  class FakeBiquad extends FakeNode {
    constructor(ctx) {
      super(ctx, "Biquad", 1, 1);
      this._type = "lowpass";
      this.frequency = this._param("frequency", 350);
      this.detune = this._param("detune", 0);
      this.Q = this._param("Q", 1);
      this.gain = this._param("gain", 0);
    }
    get type() {
      return this._type;
    }
    set type(v) {
      if (!BIQUAD_TYPES.includes(v)) throw new TypeError(`Biquad type '${v}' is not a valid enum value`);
      this._type = v;
    }
  }

  class FakeDelay extends FakeNode {
    constructor(ctx, max) {
      super(ctx, "Delay", 1, 1);
      this.maxDelayTime = max;
      this.delayTime = this._param("delayTime", 0);
    }
  }

  const OVERSAMPLE = ["none", "2x", "4x"];
  class FakeWaveShaper extends FakeNode {
    constructor(ctx) {
      super(ctx, "WaveShaper", 1, 1);
      this._curve = null;
      this._oversample = "none";
    }
    get curve() {
      return this._curve;
    }
    set curve(c) {
      if (c !== null && (!c || typeof c.length !== "number" || c.length < 2)) {
        throw new InvalidStateError("WaveShaper curve must have at least 2 samples");
      }
      this._curve = c;
    }
    get oversample() {
      return this._oversample;
    }
    set oversample(v) {
      if (!OVERSAMPLE.includes(v)) throw new TypeError(`oversample '${v}' is not a valid enum value`);
      this._oversample = v;
    }
  }

  class FakeConvolver extends FakeNode {
    constructor(ctx) {
      super(ctx, "Convolver", 1, 1);
      this._buffer = null;
      this.normalize = true;
    }
    get buffer() {
      return this._buffer;
    }
    set buffer(b) {
      if (b !== null) {
        if (!(b instanceof FakeAudioBuffer)) throw new TypeError("Convolver.buffer must be an AudioBuffer");
        if (![1, 2, 4].includes(b.numberOfChannels)) throw new NotSupportedError("Convolver buffer channel count must be 1, 2 or 4");
        if (b.sampleRate !== this.context.sampleRate) throw new NotSupportedError("Convolver buffer sampleRate must match the context");
      }
      this._buffer = b;
    }
  }

  class FakeCompressor extends FakeNode {
    constructor(ctx) {
      super(ctx, "DynamicsCompressor", 1, 1);
      this.threshold = this._param("threshold", -24);
      this.knee = this._param("knee", 30);
      this.ratio = this._param("ratio", 12);
      this.attack = this._param("attack", 0.003);
      this.release = this._param("release", 0.25);
      this.reduction = 0;
    }
  }

  const OSC_TYPES = ["sine", "square", "sawtooth", "triangle", "custom"];
  class FakeOscillator extends FakeNode {
    constructor(ctx) {
      super(ctx, "Oscillator", 0, 1);
      this._type = "sine";
      this.frequency = this._param("frequency", 440);
      this.detune = this._param("detune", 0);
      this._started = false;
      this._stopped = false;
    }
    get type() {
      return this._type;
    }
    set type(v) {
      if (!OSC_TYPES.includes(v)) throw new TypeError(`Oscillator type '${v}' is not a valid enum value`);
      this._type = v;
    }
    start() {
      if (this._started) throw new InvalidStateError("Oscillator cannot be started more than once");
      this._started = true;
    }
    stop() {
      if (!this._started) throw new InvalidStateError("Oscillator cannot be stopped before it is started");
      this._stopped = true;
    }
  }

  class FakeSplitter extends FakeNode {
    constructor(ctx, n) {
      super(ctx, "ChannelSplitter", 1, n);
      this._fixedCount = n;
      this._cc = n;
      this._ccm = "explicit";
    }
    // real ChannelSplitter: channelCount is fixed to numberOfOutputs, mode fixed to "explicit"
    get channelCount() {
      return this._cc;
    }
    set channelCount(v) {
      if (v !== this._fixedCount) {
        throw new InvalidStateError("ChannelSplitter channelCount cannot be changed");
      }
    }
    get channelCountMode() {
      return this._ccm;
    }
    set channelCountMode(v) {
      if (v !== "explicit") throw new InvalidStateError("ChannelSplitter channelCountMode must be 'explicit'");
    }
  }
  class FakeMerger extends FakeNode {
    constructor(ctx, n) {
      super(ctx, "ChannelMerger", n, 1);
    }
  }

  class FakeDestination extends FakeNode {
    constructor(ctx) {
      super(ctx, "Destination", 1, 0);
      this.maxChannelCount = 2;
    }
  }

  // ----------------------------------------------------------------- AudioBuffer
  class FakeAudioBuffer {
    constructor(channels, length, rate, durationOverride) {
      this.numberOfChannels = channels;
      this.length = length;
      this.sampleRate = rate;
      this.duration = durationOverride != null ? durationOverride : length / rate;
      this._data = [];
    }
    getChannelData(ch) {
      if (ch < 0 || ch >= this.numberOfChannels) throw new IndexSizeError("channel index out of range");
      if (!this._data[ch]) this._data[ch] = new Float32Array(this.length);
      return this._data[ch];
    }
  }

  // ---------------------------------------------------------- BufferSourceNode
  class FakeBufferSource extends FakeNode {
    constructor(ctx) {
      super(ctx, "BufferSource", 0, 1);
      this.buffer = null;
      this.loop = false;
      this.loopStart = 0;
      this.loopEnd = 0;
      this.playbackRate = this._param("playbackRate", 1);
      this.detune = this._param("detune", 0);
      this.onended = null;
      this.testAmplitude = 0.5; // signal level used by levelAt()
      this._started = false;
      this._stopped = false;
      this._startWhen = 0;
      this._startOffset = 0;
      this._startCalls = 0;
      this._posT = 0;
      this._pos = 0;
    }

    start(when, offset) {
      if (this._started) throw new InvalidStateError("cannot call start more than once.");
      when = when || 0;
      offset = offset || 0;
      if (when < 0 || offset < 0) throw new RangeError("start(): when/offset must be >= 0");
      if (!this.buffer) {
        // real browsers allow this (silent), but it always signals a bug in our engines
        this._noBufferAtStart = true;
      }
      this._started = true;
      this._startCalls++;
      this._startWhen = Math.max(when, this.context.currentTime);
      this._startOffset = offset;
      this._posT = this._startWhen;
      this._pos = offset;
    }

    stop(when) {
      if (!this._started) throw new InvalidStateError("cannot call stop without calling start first.");
      const now = this.context.currentTime;
      this._stopped = true; // stop() has been called
      this._stoppedAt = when && when > now ? when : now;
    }

    /** True audio position (seconds into the buffer) at `t` (default now). */
    position(t) {
      const now = t != null ? t : this.context.currentTime;
      if (!this._started) return 0;
      const end = this._stopped ? Math.min(now, this._stoppedAt) : now;
      if (end <= this._startWhen) return this._startOffset;
      // integrate playbackRate (2 ms steps) from the last cached point
      if (this._posT > end) {
        this._posT = this._startWhen;
        this._pos = this._startOffset;
      }
      const dur = this.buffer ? this.buffer.duration : Infinity;
      const loopStart = this.loop ? this.loopStart || 0 : 0;
      const loopEnd = this.loop ? (this.loopEnd > loopStart ? this.loopEnd : dur) : dur;
      let t0 = this._posT;
      let pos = this._pos;
      const STEP = 0.002;
      while (t0 < end - 1e-12) {
        const dt = Math.min(STEP, end - t0);
        const rate = this.playbackRate.valueAt(t0 + dt / 2);
        pos += rate * dt;
        if (this.loop) {
          while (pos >= loopEnd) pos -= loopEnd - loopStart;
        } else if (pos >= dur) {
          pos = dur;
          t0 = end;
          break;
        }
        t0 += dt;
      }
      this._posT = end;
      this._pos = pos;
      return pos;
    }

    isAudible() {
      if (!this._started) return false;
      if (this._stopped && this.context.currentTime >= this._stoppedAt) return false;
      if (this._startWhen > this.context.currentTime) return false;
      if (!this.loop && this.buffer && this.position() >= this.buffer.duration) return false;
      return true;
    }
  }

  // --------------------------------------------------------------- AudioContext
  class FakeAudioContext {
    constructor() {
      this._nodes = [];
      this._edges = [];
      this.sampleRate = sampleRate;
      this.state = "running";
      this.destination = new FakeDestination(this);
      contexts.push(this);
    }
    get currentTime() {
      return clock.now() / 1000;
    }

    _live() {
      if (this.state === "closed") throw new InvalidStateError("The AudioContext has been closed.");
    }

    createGain() { this._live(); return new FakeGain(this); }
    createStereoPanner() { this._live(); return new FakeStereoPanner(this); }
    createPanner() { this._live(); return new FakePanner(this); }
    createAnalyser() { this._live(); return new FakeAnalyser(this); }
    createBiquadFilter() { this._live(); return new FakeBiquad(this); }
    createDelay(max) {
      this._live();
      if (max === undefined) max = 1;
      if (!(max > 0 && max < 180)) throw new NotSupportedError(`createDelay: maxDelayTime (${max}) must be in (0, 180)`);
      return new FakeDelay(this, max);
    }
    createWaveShaper() { this._live(); return new FakeWaveShaper(this); }
    createConvolver() { this._live(); return new FakeConvolver(this); }
    createDynamicsCompressor() { this._live(); return new FakeCompressor(this); }
    createOscillator() { this._live(); return new FakeOscillator(this); }
    createBufferSource() { this._live(); return new FakeBufferSource(this); }
    createChannelSplitter(n) {
      this._live();
      n = n === undefined ? 6 : n;
      if (!(n >= 1 && n <= 32)) throw new IndexSizeError("createChannelSplitter: invalid output count");
      return new FakeSplitter(this, n);
    }
    createChannelMerger(n) {
      this._live();
      n = n === undefined ? 6 : n;
      if (!(n >= 1 && n <= 32)) throw new IndexSizeError("createChannelMerger: invalid input count");
      return new FakeMerger(this, n);
    }
    createBuffer(channels, length, rate) {
      this._live();
      length = Math.floor(length);
      if (!(channels >= 1 && length >= 1 && rate >= 3000)) {
        throw new NotSupportedError("createBuffer: invalid arguments");
      }
      return new FakeAudioBuffer(channels, length, rate);
    }

    /**
     * decodeAudioData: promise AND callback style (MV 1.6 uses callbacks, MZ uses promises).
     * Payload format (see env.js): ASCII "FAKEAUDIO" + JSON {duration, sampleRate}.
     */
    decodeAudioData(arrayBuffer, success, failure) {
      const self = this;
      return new Promise((resolve, reject) => {
        clock.api.setTimeout(() => {
          try {
            const bytes = new Uint8Array(arrayBuffer);
            const text = Buffer.from(bytes).toString("latin1");
            const at = text.indexOf("FAKEAUDIO");
            if (at !== 0) throw new Error("EncodingError: unable to decode audio data");
            const meta = JSON.parse(text.slice("FAKEAUDIO".length));
            const rate = meta.sampleRate || self.sampleRate;
            const buf = new FakeAudioBuffer(meta.channels || 2, Math.round(meta.duration * rate), rate, meta.duration);
            if (typeof success === "function") success(buf);
            resolve(buf);
          } catch (e) {
            if (typeof failure === "function") failure(e);
            reject(e);
          }
        }, decodeDelayMs);
      });
    }

    resume() {
      if (this.state === "suspended") this.state = "running";
      return Promise.resolve();
    }
    suspend() {
      this.state = "suspended";
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }

    // ------------------------------------------------------------ test helpers
    nodesOfKind(kind) {
      return this._nodes.filter((n) => n._kind === kind);
    }
    edgesFrom(node) {
      return this._edges.filter((e) => e.from === node);
    }
    edgesTo(node) {
      return this._edges.filter((e) => e.to === node);
    }
    /** Is there a directed path from `from` to `to` (audio edges only)? */
    pathExists(from, to) {
      const seen = new Set();
      const stack = [from];
      while (stack.length) {
        const n = stack.pop();
        if (n === to) return true;
        if (seen.has(n)) continue;
        seen.add(n);
        for (const e of this._edges) {
          if (e.from === n && e.to instanceof FakeNode) stack.push(e.to);
        }
      }
      return false;
    }
    /** Nodes that currently feed (transitively) into `node`. */
    upstreamOf(node) {
      const seen = new Set();
      const stack = [node];
      while (stack.length) {
        const n = stack.pop();
        for (const e of this._edges) {
          if (e.to === n && !seen.has(e.from)) {
            seen.add(e.from);
            stack.push(e.from);
          }
        }
      }
      return Array.from(seen);
    }
    /** Source nodes that are audible and reach the destination. */
    audibleSources() {
      return this.nodesOfKind("BufferSource").filter(
        (s) => s.isAudible() && this.pathExists(s, this.destination)
      );
    }
    /** Approximate signal level at `node` (sum of upstream audible sources x gains). */
    levelAt(node, seen) {
      seen = seen || new Set();
      if (seen.has(node)) return 0;
      seen.add(node);
      if (node instanceof FakeBufferSource) {
        return node.isAudible() ? node.testAmplitude : 0;
      }
      let sum = 0;
      for (const e of this._edges) {
        if (e.to === node) sum += this.levelAt(e.from, new Set(seen));
      }
      if (node instanceof FakeGain) sum *= node.gain.valueAt(this.currentTime);
      return sum;
    }
    /** Human-readable dump for assertion messages. */
    describeGraph() {
      const name = (n) => `${n._kind}#${n._id}`;
      return this._edges
        .map((e) => `${name(e.from)} -> ${e.to instanceof FakeNode ? name(e.to) : "param:" + e.to.name}`)
        .join("\n");
    }
  }

  return {
    AudioContext: FakeAudioContext,
    FakeAudioBuffer,
    FakeNode,
    FakeAudioParam,
    contexts,
    errors: { InvalidStateError, InvalidAccessError, NotSupportedError, IndexSizeError },
  };
}

module.exports = { createFakeAudio };
