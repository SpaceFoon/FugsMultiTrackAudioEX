//=======================================================================//
//                        FugsAudio2Effects.js                           //
//=======================================================================//
/*:
 * @plugindesc v2.2 WebAudio effect chains + presets for Fugs MultiTrack Audio
 * @target MV 1.63
 * @author Fug
 *
 * @help
 * =========================================================================
 * FugsAudio2Effects — OPTIONAL
 * =========================================================================
 * WebAudio effect chains + presets (effect / fadeeffect / cleareffect / …).
 * Requires Core ABOVE this plugin.
 *
 * Full docs: install FugsAudio0Docs and open it in Plugin Manager.
 * =========================================================================
 */

(() => {
  const TAG = "[FugsAudio2Effects]";

  if (!window.FugsAudio) {
    console.error(
      TAG +
        " FugsMultiTrackAudioEX (or FugsAudio1Core) must be ON and ABOVE this plugin in Plugin Manager."
    );
    return;
  }

  const hub = window.FugsAudio;
  const Logger =
    hub.Logger || {
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
    console.error(TAG + " FadeManager missing on FugsAudio — aborting Effects load.");
    return;
  }
  const AUDIO_CONSTANTS = hub.AUDIO_CONSTANTS;
  if (!AUDIO_CONSTANTS) {
    console.error(TAG + " AUDIO_CONSTANTS missing on FugsAudio — aborting Effects load.");
    return;
  }

  // Audio Effects System with immutable presets
  // IMPORTANT: This system relies on RPG Maker MV's internal WebAudio implementation
  // Specifically: WebAudio._context, buffer._sourceNode, buffer._gainNode
  // These are private APIs and may break if modified by other plugins
  const AudioEffects = {
    context: null,
    curveCache: {},
    curveCacheOrder: [], // Track insertion order for LRU eviction
    CURVE_CACHE_MAX_SIZE: AUDIO_CONSTANTS.CURVE_CACHE_MAX_SIZE, // Limit cache to prevent memory leaks
    reverbCache: {},
    reverbCacheOrder: [], // LRU order for reverb buffer eviction
    REVERB_CACHE_MAX_SIZE: AUDIO_CONSTANTS.REVERB_CACHE_MAX_SIZE,

    init() {
      if (WebAudio._context) {
        this.context = WebAudio._context;
        Logger.success("Audio Effects System initialized");
      } else {
        Logger.error("Failed to initialize Audio Effects System: No WebAudio context found");
      }
    },

    toNum(val, def) {
      // Treat undefined/null/empty-string/whitespace as missing -> fallback
      if (val === undefined || val === null) return def;
      if (typeof val === "string" && val.trim() === "") return def;
      const num = Number(val);
      // Use Number.isNaN (not global isNaN) for proper type checking
      return Number.isNaN(num) || !Number.isFinite(num) ? def : num;
    },

    // Validate buffer has required WebAudio internals for effect processing
    validateBuffer(buffer, _key) {
      if (!buffer) {
        return { valid: false, reason: "Buffer is null/undefined" };
      }
      if (!buffer._sourceNode) {
        return { valid: false, reason: "Missing _sourceNode (WebAudio internal)" };
      }
      if (!buffer._gainNode) {
        return { valid: false, reason: "Missing _gainNode (WebAudio internal)" };
      }
      if (!buffer._sourceNode.context) {
        return { valid: false, reason: "SourceNode has no AudioContext" };
      }
      if (buffer._sourceNode.context.state === "closed") {
        return { valid: false, reason: "AudioContext is closed" };
      }
      return { valid: true };
    },

    createReverbBuffer(
      duration = AUDIO_CONSTANTS.DEFAULT_REVERB_DURATION,
      decay = AUDIO_CONSTANTS.DEFAULT_REVERB_DECAY
    ) {
      if (!this.context) return null;

      // Cache reverb buffers keyed on duration+decay to avoid repeated large allocations
      const cacheKey = `${duration.toFixed(2)}_${decay.toFixed(3)}`;
      if (this.reverbCache[cacheKey]) return this.reverbCache[cacheKey];

      const sampleRate = this.context.sampleRate;
      const length = sampleRate * duration;
      const buffer = this.context.createBuffer(2, length, sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
      }

      // LRU eviction for reverb cache
      while (this.reverbCacheOrder.length >= this.REVERB_CACHE_MAX_SIZE) {
        const oldestKey = this.reverbCacheOrder.shift();
        delete this.reverbCache[oldestKey];
      }
      this.reverbCache[cacheKey] = buffer;
      this.reverbCacheOrder.push(cacheKey);

      return buffer;
    },

    createEffectChain(effects) {
      if (!this.context) return null;

      // Wrap entire chain construction in try/catch — the many .connect() and
      // .start() calls can throw DOMException if the AudioContext is closed,
      // suspended, or has exhausted its node budget (common on Chromium 65).
      try {
        const chain = {
          input: this.context.createGain(),
          output: this.context.createGain(),
          nodes: [],
          oscillators: [], // Track LFOs for cleanup
          wetGain: this.context.createGain(),
          dryGain: this.context.createGain(),
        };

        // Set initial wet/dry mix
        chain.wetGain.gain.value = 0;
        chain.dryGain.gain.value = 1;

        let currentNode = chain.input;

        effects.forEach((effect) => {
          let node;

          switch (effect.type) {
            case "reverb":
              node = this.context.createConvolver();
              node.buffer = this.createReverbBuffer(
                effect.duration || AUDIO_CONSTANTS.DEFAULT_REVERB_DURATION,
                effect.decay || AUDIO_CONSTANTS.DEFAULT_REVERB_DECAY
              );
              break;

            case "lowpass":
              node = this.context.createBiquadFilter();
              node.type = "lowpass";
              node.frequency.value = effect.frequency || AUDIO_CONSTANTS.DEFAULT_LOWPASS_FREQ;
              node.Q.value = effect.resonance || AUDIO_CONSTANTS.DEFAULT_RESONANCE;
              break;

            case "highpass":
              node = this.context.createBiquadFilter();
              node.type = "highpass";
              node.frequency.value = effect.frequency || AUDIO_CONSTANTS.DEFAULT_HIGHPASS_FREQ;
              node.Q.value = effect.resonance || AUDIO_CONSTANTS.DEFAULT_RESONANCE;
              break;

            case "bandpass":
              node = this.context.createBiquadFilter();
              node.type = "bandpass";
              node.frequency.value = effect.frequency || AUDIO_CONSTANTS.DEFAULT_BANDPASS_FREQ;
              node.Q.value = effect.resonance || AUDIO_CONSTANTS.DEFAULT_RESONANCE;
              break;

            case "distortion":
              node = this.context.createWaveShaper();
              node.curve = this.createDistortionCurve(
                effect.amount || AUDIO_CONSTANTS.DEFAULT_DISTORTION_AMOUNT
              );
              node.oversample = "4x";
              break;

            case "overdrive":
              // Simple gain boost + waveshaper for "rage mode"
              {
                const drive =
                  effect.drive || effect.amount || AUDIO_CONSTANTS.OVERDRIVE_DRIVE_DEFAULT;
                const output = effect.output || AUDIO_CONSTANTS.OVERDRIVE_OUTPUT_DEFAULT;
                const preGain = this.context.createGain();
                preGain.gain.value = Math.max(
                  AUDIO_CONSTANTS.OVERDRIVE_DRIVE_MIN,
                  drive / AUDIO_CONSTANTS.OVERDRIVE_DRIVE_SCALE
                );

                const shaper = this.context.createWaveShaper();
                shaper.curve = this.createDistortionCurve(drive);
                shaper.oversample = "4x";

                const postGain = this.context.createGain();
                postGain.gain.value = output;

                currentNode.connect(preGain);
                preGain.connect(shaper);
                shaper.connect(postGain);
                currentNode = postGain;
                node = null;
                chain.nodes.push(preGain, shaper, postGain);
              }
              break;

            case "bitcrusher":
              node = this.context.createWaveShaper();
              node.curve = this.createBitcrusherCurve(
                effect.bits || AUDIO_CONSTANTS.DEFAULT_BITCRUSHER_BITS,
                effect.normfreq || AUDIO_CONSTANTS.DEFAULT_BITCRUSHER_NORMFREQ
              );
              node.oversample = "none"; // Don't oversample for lo-fi effect
              break;

            case "compressor":
              node = this.context.createDynamicsCompressor();
              node.threshold.value =
                effect.threshold !== undefined
                  ? effect.threshold
                  : AUDIO_CONSTANTS.DEFAULT_COMPRESSOR_THRESHOLD;
              node.knee.value =
                effect.knee !== undefined ? effect.knee : AUDIO_CONSTANTS.DEFAULT_COMPRESSOR_KNEE;
              node.ratio.value =
                effect.ratio !== undefined
                  ? effect.ratio
                  : AUDIO_CONSTANTS.DEFAULT_COMPRESSOR_RATIO;
              node.attack.value =
                effect.attack !== undefined
                  ? effect.attack
                  : AUDIO_CONSTANTS.DEFAULT_COMPRESSOR_ATTACK;
              node.release.value =
                effect.release !== undefined
                  ? effect.release
                  : AUDIO_CONSTANTS.DEFAULT_COMPRESSOR_RELEASE;
              break;

            case "delay": {
              node = this.context.createDelay(effect.maxDelay || AUDIO_CONSTANTS.DEFAULT_DELAY_MAX);
              node.delayTime.value = effect.delay || AUDIO_CONSTANTS.DEFAULT_DELAY_TIME;
              const delayFeedback = this.context.createGain();
              delayFeedback.gain.value = effect.feedback || AUDIO_CONSTANTS.DEFAULT_FEEDBACK;
              const delayWet = this.context.createGain();
              // Use 1.0 here - let global wetGain control the overall wet/dry mix
              // This avoids double-attenuation (per-effect wet * global wet)
              delayWet.gain.value = 1.0;
              // Feed audio into the delay
              currentNode.connect(node);
              // Set up feedback loop
              node.connect(delayFeedback);
              delayFeedback.connect(node);
              // Connect to wet path
              node.connect(delayWet);
              delayWet.connect(chain.wetGain);
              // Track all nodes for cleanup
              chain.nodes.push(node, delayFeedback, delayWet);
              node = null; // Parallel send - don't advance currentNode
              break;
            }

            case "multitap":
              // Multiple parallel delays with optional feedback and pan
              {
                const taps =
                  Array.isArray(effect.taps) && effect.taps.length > 0
                    ? effect.taps
                    : [
                        {
                          delay: this.toNum(effect.tap1, AUDIO_CONSTANTS.MULTITAP_DEFAULT_DELAY_1),
                          feedback: this.toNum(
                            effect.tap2,
                            AUDIO_CONSTANTS.MULTITAP_DEFAULT_FEEDBACK_1
                          ),
                          pan: AUDIO_CONSTANTS.MULTITAP_DEFAULT_PAN_1,
                        },
                        {
                          delay: this.toNum(effect.tap3, AUDIO_CONSTANTS.MULTITAP_DEFAULT_DELAY_2),
                          feedback: this.toNum(
                            effect.tap4,
                            AUDIO_CONSTANTS.MULTITAP_DEFAULT_FEEDBACK_2
                          ),
                          pan: AUDIO_CONSTANTS.MULTITAP_DEFAULT_PAN_2,
                        },
                        {
                          delay: this.toNum(effect.tap5, AUDIO_CONSTANTS.MULTITAP_DEFAULT_DELAY_3),
                          feedback: this.toNum(
                            effect.tap6,
                            AUDIO_CONSTANTS.MULTITAP_DEFAULT_FEEDBACK_3
                          ),
                          pan: AUDIO_CONSTANTS.MULTITAP_DEFAULT_PAN_3,
                        },
                      ].filter((t) => t.delay !== null && !isNaN(t.delay));

                const maxDelay = effect.maxDelay || 1;

                taps.forEach((tap) => {
                  const tapDelay = this.context.createDelay(maxDelay);
                  tapDelay.delayTime.value =
                    tap.delay || AUDIO_CONSTANTS.MULTITAP_TAP_DELAY_FALLBACK;

                  const tapFeedback = this.context.createGain();
                  tapFeedback.gain.value =
                    tap.feedback !== undefined ? tap.feedback : AUDIO_CONSTANTS.DEFAULT_FEEDBACK;

                  let tapPanNode = null;
                  if (tap.pan !== undefined && tap.pan !== null) {
                    tapPanNode = this.context.createStereoPanner();
                    tapPanNode.pan.value = Math.max(
                      AUDIO_CONSTANTS.AUTOPAN_PAN_MIN,
                      Math.min(AUDIO_CONSTANTS.AUTOPAN_PAN_MAX, tap.pan)
                    );
                  }

                  const tapWet = this.context.createGain();
                  tapWet.gain.value =
                    tap.wet !== undefined ? tap.wet : AUDIO_CONSTANTS.MULTITAP_DEFAULT_WET;

                  // wire: current -> delay -> feedback -> delay (loop)
                  currentNode.connect(tapDelay);
                  tapDelay.connect(tapFeedback);
                  tapFeedback.connect(tapDelay);

                  // to wet path (with optional pan)
                  if (tapPanNode) {
                    tapDelay.connect(tapPanNode);
                    tapPanNode.connect(tapWet);
                  } else {
                    tapDelay.connect(tapWet);
                  }
                  tapWet.connect(chain.wetGain);

                  chain.nodes.push(tapDelay, tapFeedback, tapWet);
                  if (tapPanNode) chain.nodes.push(tapPanNode);
                });

                node = null; // Parallel send - don't advance currentNode
              }
              break;

            case "tremolo": {
              // Volume LFO effect - heartbeat, danger throb, etc.
              node = this.context.createGain();
              const tremoloOsc = this.context.createOscillator();
              const tremoloDepthGain = this.context.createGain();

              tremoloOsc.type = effect.shape || "sine";
              tremoloOsc.frequency.setTargetAtTime(
                effect.rate || AUDIO_CONSTANTS.DEFAULT_TREMOLO_RATE,
                0,
                0.001
              );
              tremoloDepthGain.gain.value = effect.depth || AUDIO_CONSTANTS.DEFAULT_TREMOLO_DEPTH; // 0-1

              // Connect LFO: oscillator -> depth -> target gain
              tremoloOsc.connect(tremoloDepthGain);
              tremoloDepthGain.connect(node.gain);
              tremoloOsc.start();

              // Store oscillator and depth gain for cleanup
              chain.oscillators.push(tremoloOsc);
              chain.nodes.push(tremoloDepthGain);
              break;
            }

            case "vibrato": {
              // Pitch LFO effect - subtle warble, ethereal, dream-like
              // Implemented via modulated delay for classic vibrato sound
              const vibratoDelay = this.context.createDelay(0.02);
              const vibratoOsc = this.context.createOscillator();
              const vibratoDepthGain = this.context.createGain();

              vibratoOsc.type = effect.shape || "sine";
              vibratoOsc.frequency.setTargetAtTime(
                effect.rate || AUDIO_CONSTANTS.DEFAULT_VIBRATO_RATE,
                0,
                0.001
              );

              // Convert depth from cents to delay time
              // Depth of 50 cents = ~3ms delay modulation
              const depthInSeconds =
                ((effect.depth || AUDIO_CONSTANTS.DEFAULT_VIBRATO_DEPTH) /
                  AUDIO_CONSTANTS.VIBRATO_CENTS_TO_RATIO) *
                AUDIO_CONSTANTS.VIBRATO_DELAY_SCALE;
              vibratoDepthGain.gain.value = depthInSeconds;

              vibratoDelay.delayTime.value = AUDIO_CONSTANTS.VIBRATO_BASE_DELAY; // Base delay

              // Connect LFO to modulate delay time
              vibratoOsc.connect(vibratoDepthGain);
              vibratoDepthGain.connect(vibratoDelay.delayTime);
              vibratoOsc.start();

              node = vibratoDelay;

              // Store oscillator and depth gain for cleanup
              chain.oscillators.push(vibratoOsc);
              chain.nodes.push(vibratoDepthGain);
              break;
            }

            case "chorus":
              // 3-voice chorus with staggered delays
              // Use 1.0 gain - let global wetGain control wet/dry mix
              for (let i = 0; i < AUDIO_CONSTANTS.CHORUS_VOICE_COUNT; i++) {
                const delay = this.context.createDelay(AUDIO_CONSTANTS.CHORUS_MAX_DELAY);
                delay.delayTime.value =
                  AUDIO_CONSTANTS.CHORUS_DELAY_BASE + i * AUDIO_CONSTANTS.CHORUS_DELAY_INCREMENT;
                const gain = this.context.createGain();
                gain.gain.value = AUDIO_CONSTANTS.CHORUS_MIX_FACTOR; // Equal mix of 3 voices, total = 1.0
                currentNode.connect(delay);
                delay.connect(gain);
                gain.connect(chain.wetGain);
                // Track nodes for cleanup
                chain.nodes.push(delay, gain);
              }
              node = null;
              break;

            case "phaser": {
              const stages = effect.stages || AUDIO_CONSTANTS.DEFAULT_PHASER_STAGES;
              const phaserBase = effect.frequency || AUDIO_CONSTANTS.DEFAULT_PHASER_BASE_FREQ;
              const phaserDepth = effect.depth || AUDIO_CONSTANTS.DEFAULT_PHASER_DEPTH;
              const phaserRate = effect.rate || AUDIO_CONSTANTS.DEFAULT_PHASER_RATE;

              const phaserOsc = this.context.createOscillator();
              phaserOsc.type = effect.shape || "sine";
              phaserOsc.frequency.setTargetAtTime(phaserRate, 0, 0.001);

              const phaserGain = this.context.createGain();
              phaserGain.gain.value = phaserDepth;
              phaserOsc.connect(phaserGain);
              phaserOsc.start();
              chain.oscillators.push(phaserOsc);
              chain.nodes.push(phaserGain);

              let filterInput = this.context.createBiquadFilter();
              filterInput.type = "allpass";
              filterInput.frequency.value = phaserBase;
              phaserGain.connect(filterInput.frequency);
              chain.nodes.push(filterInput);

              let lastFilter = filterInput;
              for (let stage = 1; stage < stages; stage += 1) {
                const filter = this.context.createBiquadFilter();
                filter.type = "allpass";
                filter.frequency.value = phaserBase;
                phaserGain.connect(filter.frequency);
                lastFilter.connect(filter);
                lastFilter = filter;
                chain.nodes.push(filter);
              }

              currentNode.connect(filterInput);
              currentNode = lastFilter;
              node = null;
              break;
            }

            case "flanger": {
              const flangerDelay = this.context.createDelay(AUDIO_CONSTANTS.FLANGER_MAX_DELAY);
              flangerDelay.delayTime.value = AUDIO_CONSTANTS.DEFAULT_FLANGER_DELAY;

              const flangerFeedback = this.context.createGain();
              flangerFeedback.gain.value = Math.min(
                effect.feedback || AUDIO_CONSTANTS.DEFAULT_FLANGER_FEEDBACK,
                AUDIO_CONSTANTS.FLANGER_FEEDBACK_MAX
              );

              const flangerOsc = this.context.createOscillator();
              flangerOsc.type = effect.shape || "sine";
              flangerOsc.frequency.setTargetAtTime(
                effect.rate || AUDIO_CONSTANTS.DEFAULT_FLANGER_RATE,
                0,
                0.001
              );

              const flangerDepth = this.context.createGain();
              flangerDepth.gain.value = effect.depth || AUDIO_CONSTANTS.DEFAULT_FLANGER_DEPTH;

              flangerOsc.connect(flangerDepth);
              flangerDepth.connect(flangerDelay.delayTime);
              flangerOsc.start();
              chain.oscillators.push(flangerOsc);

              const flangerInput = this.context.createGain();

              currentNode.connect(flangerInput);
              flangerInput.connect(flangerDelay);
              flangerDelay.connect(flangerFeedback);
              flangerFeedback.connect(flangerInput);

              currentNode = flangerDelay;
              node = null;
              chain.nodes.push(flangerInput, flangerDelay, flangerFeedback, flangerDepth);
              break;
            }

            case "widener": {
              // Stereo widening via Haas effect (delayed channel)
              // Typical values: 5-50ms. Max safe: 1 second.
              const rawWidth =
                (effect.width !== undefined ? effect.width : effect.amount) ||
                AUDIO_CONSTANTS.DEFAULT_WIDENER_WIDTH;
              const maxDelay = AUDIO_CONSTANTS.WIDENER_MAX_DELAY;
              const widthDelay = Math.min(Math.max(0, rawWidth), maxDelay); // Clamp to safe range

              const splitter = this.context.createChannelSplitter(2);
              splitter.channelCount = 2; // Stereo output
              splitter.channelCountMode = "explicit"; // Force up-mix for mono sources
              const merger = this.context.createChannelMerger(2);
              const delayNode = this.context.createDelay(maxDelay);
              delayNode.delayTime.value = widthDelay;

              // Left -> Merger L
              splitter.connect(merger, 0, 0);

              // Right -> Delay -> Merger R
              splitter.connect(delayNode, 1);
              delayNode.connect(merger, 0, 1);

              currentNode.connect(splitter);
              currentNode = merger;
              node = null;
              chain.nodes.push(splitter, merger, delayNode);
              break;
            }

            case "eq3": {
              const low = this.context.createBiquadFilter();
              low.type = "lowshelf";
              low.frequency.value = AUDIO_CONSTANTS.DEFAULT_EQ_LOW_FREQ;
              low.gain.value = effect.low || 0;

              const mid = this.context.createBiquadFilter();
              mid.type = "peaking";
              mid.frequency.value = effect.midFreq || AUDIO_CONSTANTS.DEFAULT_EQ_MID_FREQ;
              mid.gain.value = effect.mid || 0;

              const high = this.context.createBiquadFilter();
              high.type = "highshelf";
              high.frequency.value = AUDIO_CONSTANTS.DEFAULT_EQ_HIGH_FREQ;
              high.gain.value = effect.high || 0;

              currentNode.connect(low);
              low.connect(mid);
              mid.connect(high);

              currentNode = high;
              node = null;
              chain.nodes.push(low, mid, high);
              break;
            }

            case "ringmod": {
              // Ring Modulator (Amplitude Modulation)
              // Multiplies signal by an oscillator
              const ringOsc = this.context.createOscillator();
              ringOsc.type = "sine";
              ringOsc.frequency.setTargetAtTime(
                effect.speed !== undefined
                  ? effect.speed
                  : effect.frequency !== undefined
                    ? effect.frequency
                    : AUDIO_CONSTANTS.DEFAULT_RINGMOD_SPEED,
                0,
                0.001
              );

              const ringGain = this.context.createGain();
              ringGain.gain.value = 0; // Base gain 0 for pure ring mod

              // Mix control for ring modulation intensity
              // For ring mod, "mix" controls how much the carrier oscillator modulates the signal
              // Dry/Wet is still handled by chain.wetGain/dryGain for overall effect blend
              const ringDepth = this.context.createGain();
              ringDepth.gain.value =
                effect.mix !== undefined ? effect.mix : AUDIO_CONSTANTS.DEFAULT_RINGMOD_MIX;

              // Connect: Osc -> Depth -> RingGain.gain
              // Signal -> RingGain -> Output
              ringOsc.connect(ringDepth);
              ringDepth.connect(ringGain.gain);
              ringOsc.start();
              chain.oscillators.push(ringOsc);
              chain.nodes.push(ringDepth);

              node = ringGain;
              chain.nodes.push(ringGain);
              break;
            }

            case "autopan": {
              // Auto-Pan / Rotary Speaker
              const panner = this.context.createStereoPanner();
              const panOsc = this.context.createOscillator();
              const panDepth = this.context.createGain();

              panOsc.type = "sine";
              panOsc.frequency.value =
                effect.speed !== undefined
                  ? effect.speed
                  : effect.rate !== undefined
                    ? effect.rate
                    : AUDIO_CONSTANTS.DEFAULT_AUTOPAN_SPEED;

              panDepth.gain.value = effect.depth || AUDIO_CONSTANTS.DEFAULT_AUTOPAN_DEPTH; // 0 to 1

              panOsc.connect(panDepth);
              panDepth.connect(panner.pan);

              panOsc.start();
              chain.oscillators.push(panOsc);

              node = panner;
              chain.nodes.push(panner, panDepth);
              break;
            }
          }

          if (node) {
            currentNode.connect(node);
            currentNode = node;
            chain.nodes.push(node);
          }
        });

        // Connect wet/dry paths
        chain.input.connect(chain.dryGain);
        chain.dryGain.connect(chain.output);

        if (currentNode !== chain.input) {
          currentNode.connect(chain.wetGain);
        }
        chain.wetGain.connect(chain.output);

        return chain;
      } catch (e) {
        Logger.error(`createEffectChain failed: ${e.message}`);
        return null;
      }
    },

    createDistortionCurve(amount) {
      // Validate amount and choose defaults
      const safeAmount = this.toNum(amount, AUDIO_CONSTANTS.DEFAULT_DISTORTION_AMOUNT);
      // Clamp to a sane operational range to avoid extreme math
      const clampedAmount = Math.max(
        AUDIO_CONSTANTS.DISTORTION_AMOUNT_MIN,
        Math.min(AUDIO_CONSTANTS.DISTORTION_AMOUNT_MAX, safeAmount)
      );

      // Use runtime audio context sampleRate when available, fallback to 44100
      const defaultSamples = AUDIO_CONSTANTS.MIN_SAMPLE_RATE;
      const ctxRate =
        this.context && Number.isFinite(this.context.sampleRate)
          ? Math.round(this.context.sampleRate)
          : defaultSamples;
      // Bound the sample buffer used for curve generation to avoid huge allocations
      const samples = Math.max(
        AUDIO_CONSTANTS.MIN_CURVE_SAMPLES,
        Math.min(AUDIO_CONSTANTS.MAX_CURVE_SAMPLES, ctxRate)
      );

      const roundedKey = Number.parseFloat(clampedAmount).toFixed(
        AUDIO_CONSTANTS.CACHE_KEY_DECIMALS
      );
      const cacheKey = `dist_${roundedKey}_${samples}`;
      if (this.curveCache[cacheKey]) {
        return this.curveCache[cacheKey];
      }

      const curve = new Float32Array(samples);
      const deg = AUDIO_CONSTANTS.DISTORTION_DEG_TO_RAD;

      for (let i = 0; i < samples; i++) {
        const x =
          (i * AUDIO_CONSTANTS.DISTORTION_INPUT_SCALE) / samples -
          AUDIO_CONSTANTS.DISTORTION_INPUT_OFFSET;
        // Use clampedAmount for math to avoid NaNs / runaway values
        let v =
          ((AUDIO_CONSTANTS.DISTORTION_AMP_MULTIPLIER + clampedAmount) *
            x *
            AUDIO_CONSTANTS.DISTORTION_X_SCALER *
            deg) /
          (Math.PI + clampedAmount * Math.abs(x));

        // Ensure finite value and clamp into [-1, 1]
        if (!Number.isFinite(v) || Number.isNaN(v)) v = 0;
        curve[i] = Math.max(
          AUDIO_CONSTANTS.DISTORTION_OUTPUT_CLAMP_MIN,
          Math.min(AUDIO_CONSTANTS.DISTORTION_OUTPUT_CLAMP_MAX, v)
        );
      }

      // sanity-check result and cache it with LRU eviction
      this._addToCache(cacheKey, curve);
      return curve;
    },

    // LRU cache helper - evicts oldest entries when cache is full
    _addToCache(key, value) {
      if (this.curveCache[key]) {
        // Already cached, just return
        return;
      }
      // Evict oldest entries if cache is full
      while (this.curveCacheOrder.length >= this.CURVE_CACHE_MAX_SIZE) {
        const oldestKey = this.curveCacheOrder.shift();
        delete this.curveCache[oldestKey];
      }
      this.curveCache[key] = value;
      this.curveCacheOrder.push(key);
    },

    createBitcrusherCurve(bits, normfreq) {
      // Bitcrusher using WaveShaper with quantization
      const safeBits = Math.max(
        AUDIO_CONSTANTS.BITCRUSHER_BITS_MIN,
        Math.min(
          AUDIO_CONSTANTS.BITCRUSHER_BITS_MAX,
          Math.round(this.toNum(bits, AUDIO_CONSTANTS.DEFAULT_BITCRUSHER_BITS))
        )
      );
      const rawNorm = this.toNum(normfreq, AUDIO_CONSTANTS.DEFAULT_BITCRUSHER_NORMFREQ);
      const safeNormfreq = Math.max(
        AUDIO_CONSTANTS.NORMFREQ_MIN,
        Math.min(AUDIO_CONSTANTS.NORMFREQ_MAX, rawNorm)
      );

      // Use runtime audio context sampleRate when available, fallback to 44100
      const defaultSamples = AUDIO_CONSTANTS.MIN_SAMPLE_RATE;
      const ctxRate =
        this.context && Number.isFinite(this.context.sampleRate)
          ? Math.round(this.context.sampleRate)
          : defaultSamples;
      const samples = Math.max(
        AUDIO_CONSTANTS.MIN_CURVE_SAMPLES,
        Math.min(AUDIO_CONSTANTS.MAX_CURVE_SAMPLES, ctxRate)
      );

      // Use rounded normfreq for stable cache keys
      const normKey = safeNormfreq.toFixed(AUDIO_CONSTANTS.CACHE_KEY_DECIMALS);
      const cacheKey = `bit_${safeBits}_${normKey}_${samples}`;
      if (this.curveCache[cacheKey]) {
        return this.curveCache[cacheKey];
      }
      const curve = new Float32Array(samples);

      // Calculate number of quantization levels from bit depth
      const levels = Math.pow(AUDIO_CONSTANTS.BITCRUSHER_LEVELS_BASE, safeBits);
      const step = AUDIO_CONSTANTS.BITCRUSHER_STEP_BASE / levels; // Range is -1 to 1

      for (let i = 0; i < samples; i++) {
        const x =
          (i * AUDIO_CONSTANTS.BITCRUSHER_INDEX_SCALE) / samples -
          AUDIO_CONSTANTS.BITCRUSHER_INPUT_OFFSET; // Input range -1 to 1

        // Quantize to discrete levels based on bit depth
        const quantized = Math.round(x / step) * step;

        // Apply normfreq as a sample-rate reduction approximation
        // Higher normfreq = more aggressive stepping
        const stepped = Math.floor(i * safeNormfreq) / (samples * safeNormfreq);
        const index = Math.floor(stepped * samples);
        const steppedValue =
          index < samples
            ? Math.round(
                (((index * AUDIO_CONSTANTS.BITCRUSHER_INDEX_SCALE) / samples -
                  AUDIO_CONSTANTS.BITCRUSHER_STEPPED_OFFSET) /
                  step) *
                  step
              )
            : quantized;

        // Blend between normal quantization and stepped for smoother normfreq effect
        let val =
          quantized *
            (AUDIO_CONSTANTS.BITCRUSHER_BLEND_NORMAL -
              safeNormfreq * AUDIO_CONSTANTS.BITCRUSHER_BLEND_FACTOR) +
          steppedValue * (safeNormfreq * AUDIO_CONSTANTS.BITCRUSHER_BLEND_FACTOR);
        if (!Number.isFinite(val) || Number.isNaN(val)) val = 0;
        curve[i] = Math.max(
          AUDIO_CONSTANTS.BITCRUSHER_RANGE_MIN,
          Math.min(AUDIO_CONSTANTS.BITCRUSHER_RANGE_MAX, val)
        );
      }

      // Store in cache with LRU eviction and return
      this._addToCache(cacheKey, curve);
      return curve;
    },

    // Preset categories - organized by use case
    presets: {
      environment: {
        underwater: [
          { type: "lowpass", frequency: 800, resonance: 2 },
          { type: "reverb", duration: 3, decay: 0.9, wet: 0.7 },
          { type: "ringmod", speed: 0.8, mix: 0.15 },
        ],
        cave: [
          { type: "reverb", duration: 4, decay: 0.8, wet: 0.8 },
          {
            type: "multitap",
            maxDelay: 1,
            taps: [
              { delay: 0.24, feedback: 0.35, pan: -0.6, wet: 0.35 },
              { delay: 0.36, feedback: 0.32, pan: 0.6, wet: 0.35 },
            ],
          },
          { type: "lowpass", frequency: 2500, resonance: 1 },
        ],
        city: [
          { type: "reverb", duration: 1.5, decay: 0.6, wet: 0.4 },
          { type: "highpass", frequency: 200, resonance: 1 },
        ],
        dungeon: [
          { type: "reverb", duration: 3.5, decay: 0.9, wet: 0.9 },
          { type: "lowpass", frequency: 1200, resonance: 1.5 },
        ],
        forest: [
          { type: "reverb", duration: 2, decay: 0.7, wet: 0.5 },
          { type: "chorus", wet: 0.3 },
        ],
        space: [
          { type: "reverb", duration: 5, decay: 0.95, wet: 0.9 },
          { type: "delay", delay: 0.5, feedback: 0.5, wet: 0.4 },
          { type: "autopan", speed: 0.2, depth: 0.6 },
        ],
        abyss: [
          { type: "lowpass", frequency: 200, resonance: 2 },
          { type: "reverb", duration: 7, decay: 0.98, wet: 0.85 },
          { type: "compressor", threshold: -30, ratio: 12, attack: 0.01, release: 0.3 },
        ],
        tavernRoom: [
          { type: "lowpass", frequency: 3200, resonance: 0.6 },
          { type: "widener", width: 0.015 },
          { type: "reverb", duration: 1.4, decay: 0.55, wet: 0.35 },
        ],
        mistyForest: [
          { type: "highpass", frequency: 250, resonance: 0.9 },
          { type: "reverb", duration: 3.8, decay: 0.85, wet: 0.5 },
          { type: "chorus", rate: 0.7, depth: 0.35 },
        ],
        shimmer: [
          { type: "chorus", wet: 0.35 },
          { type: "delay", delay: 0.45, feedback: 0.6, wet: 0.35 },
          { type: "reverb", duration: 5, decay: 0.85, wet: 0.6 },
          { type: "highpass", frequency: 250, resonance: 1 },
        ],
        mechanicalHum: [
          { type: "ringmod", speed: 60, mix: 0.3 },
          { type: "bandpass", frequency: 200, resonance: 3 },
          { type: "tremolo", rate: 5, depth: 0.25, shape: "sine" },
          { type: "reverb", duration: 2, decay: 0.6, wet: 0.3 },
        ],
      },

      mood: {
        ethereal: [
          { type: "vibrato", rate: 4, depth: 15, shape: "sine" },
          { type: "widener", width: 0.025 },
          { type: "reverb", duration: 4, decay: 0.85, wet: 0.6 },
        ],
        frozen: [
          { type: "tremolo", rate: 0.8, depth: 0.3, shape: "sine" },
          { type: "reverb", duration: 4.5, decay: 0.9, wet: 0.7 },
          { type: "highpass", frequency: 500, resonance: 1 },
        ],
        memory: [
          { type: "lowpass", frequency: 1200, resonance: 1 },
          { type: "vibrato", rate: 2, depth: 10, shape: "sine" },
          { type: "reverb", duration: 3, decay: 0.7, wet: 0.5 },
        ],
        tapeEcho: [
          { type: "delay", delay: 0.28, feedback: 0.45, wet: 0.55, maxDelay: 1 },
          { type: "lowpass", frequency: 3800, resonance: 0.7 },
          { type: "reverb", duration: 1.8, decay: 0.65, wet: 0.35 },
        ],
      },

      weather: {
        stormyWeather: [
          { type: "highpass", frequency: 300, resonance: 1.2 },
          { type: "autopan", speed: 0.6, depth: 0.8 },
          { type: "reverb", duration: 4, decay: 0.85, wet: 0.5 },
        ],
        heavyRain: [
          { type: "highpass", frequency: 150, resonance: 0.8 },
          { type: "bandpass", frequency: 4000, resonance: 2 },
          { type: "reverb", duration: 3.5, decay: 0.8, wet: 0.45 },
        ],
        snowStorm: [
          { type: "lowpass", frequency: 2000, resonance: 0.7 },
          { type: "tremolo", rate: 0.3, depth: 0.2, shape: "sine" },
          { type: "widener", width: 0.02 },
          { type: "reverb", duration: 4.5, decay: 0.9, wet: 0.6 },
        ],
        thunderAftershock: [
          { type: "highpass", frequency: 2500, resonance: 6 },
          { type: "reverb", duration: 5, decay: 0.95, wet: 0.75 },
          { type: "tremolo", rate: 0.8, depth: 0.3, shape: "sine" },
        ],
        windHowl: [
          { type: "highpass", frequency: 500, resonance: 0.9 },
          { type: "flanger", rate: 0.4, depth: 0.004, feedback: 0.5 },
          { type: "autopan", speed: 0.7, depth: 0.6 },
          { type: "reverb", duration: 3.5, decay: 0.8, wet: 0.5 },
        ],
        hailOnTin: [
          { type: "highpass", frequency: 1200, resonance: 1.6 },
          { type: "bandpass", frequency: 5200, resonance: 3.5 },
          { type: "distortion", amount: 12 },
          { type: "reverb", duration: 1.4, decay: 0.55, wet: 0.25 },
        ],
        insideCabinRain: [
          { type: "lowpass", frequency: 2600, resonance: 0.8 },
          { type: "reverb", duration: 1.8, decay: 0.6, wet: 0.35 },
          { type: "chorus", wet: 0.18 },
        ],
        monsoonWall: [
          { type: "bandpass", frequency: 3600, resonance: 2.2 },
          { type: "compressor", threshold: -28, knee: 8, ratio: 10, attack: 0.005, release: 0.15 },
          { type: "widener", width: 0.02 },
          { type: "reverb", duration: 3.2, decay: 0.78, wet: 0.4 },
        ],
        desertWind: [
          { type: "highpass", frequency: 900, resonance: 1.1 },
          { type: "autopan", speed: 0.45, depth: 0.7 },
          { type: "flanger", rate: 0.25, depth: 0.003, feedback: 0.35 },
          { type: "reverb", duration: 2.8, decay: 0.75, wet: 0.35 },
        ],
        blizzardWhiteout: [
          { type: "lowpass", frequency: 1400, resonance: 0.7 },
          { type: "widener", width: 0.02 },
          { type: "tremolo", rate: 0.25, depth: 0.25, shape: "sine" },
          { type: "reverb", duration: 5.2, decay: 0.92, wet: 0.7 },
        ],
        lightningZap: [
          { type: "highpass", frequency: 3200, resonance: 5 },
          { type: "distortion", amount: 28 },
          { type: "delay", delay: 0.07, feedback: 0.2, wet: 0.15 },
          { type: "reverb", duration: 0.9, decay: 0.35, wet: 0.12 },
        ],
      },

      combat: {
        explosionAftershock: [
          { type: "highpass", frequency: 3000, resonance: 7 },
          { type: "reverb", duration: 6, decay: 0.95, wet: 0.8 },
          { type: "tremolo", rate: 2, depth: 0.4, shape: "sine" },
        ],
        impactThud: [
          { type: "lowpass", frequency: 800, resonance: 1.5 },
          { type: "compressor", threshold: -25, ratio: 12, attack: 0.003, release: 0.2 },
          { type: "reverb", duration: 1.5, decay: 0.5, wet: 0.25 },
        ],
        charging: [
          { type: "tremolo", rate: 3, depth: 0.4, shape: "sine" },
          { type: "highpass", frequency: 1000, resonance: 2 },
          { type: "distortion", amount: 15 },
          { type: "reverb", duration: 2, decay: 0.6, wet: 0.2 },
        ],
        swordClash: [
          { type: "highpass", frequency: 2000, resonance: 3 },
          { type: "bandpass", frequency: 4500, resonance: 4 },
          { type: "distortion", amount: 25 },
          { type: "reverb", duration: 1.2, decay: 0.4, wet: 0.2 },
        ],
        magicCast: [
          { type: "highpass", frequency: 800, resonance: 1 },
          { type: "ringmod", speed: 20, mix: 0.2 },
          { type: "reverb", duration: 2.5, decay: 0.7, wet: 0.45 },
          { type: "chorus", wet: 0.3 },
        ],
        powerUp: [
          { type: "highpass", frequency: 600, resonance: 1.5 },
          { type: "eq3", low: -3, mid: 2, high: 4, midFreq: 2000 },
          { type: "tremolo", rate: 6, depth: 0.35, shape: "triangle" },
          { type: "reverb", duration: 1.5, decay: 0.5, wet: 0.2 },
        ],
        defeatMoment: [
          { type: "lowpass", frequency: 600, resonance: 2 },
          { type: "eq3", low: 3, mid: -4, high: -6, midFreq: 1500 },
          { type: "tremolo", rate: 1.5, depth: 0.2, shape: "sine" },
          { type: "reverb", duration: 3, decay: 0.85, wet: 0.5 },
        ],
        victoryTone: [
          { type: "eq3", low: 2, mid: 1, high: 3, midFreq: 2500 },
          { type: "reverb", duration: 2, decay: 0.6, wet: 0.3 },
          { type: "compressor", threshold: -18, ratio: 4, attack: 0.01, release: 0.15 },
        ],
        bloodlust: [
          { type: "distortion", amount: 30 },
          { type: "tremolo", rate: 8, depth: 0.5, shape: "square" },
          { type: "compressor", threshold: -20, ratio: 8, attack: 0.005, release: 0.1 },
          { type: "reverb", duration: 1, decay: 0.3, wet: 0.15 },
        ],
        adrenaline: [
          { type: "compressor", threshold: -22, knee: 6, ratio: 5, attack: 0.008, release: 0.12 },
          { type: "eq3", low: -2, mid: 2, high: 3, midFreq: 2400 },
          { type: "tremolo", rate: 5.5, depth: 0.18, shape: "sine" },
        ],
        slowMo: [
          { type: "lowpass", frequency: 900, resonance: 1.2 },
          { type: "reverb", duration: 6.5, decay: 0.95, wet: 0.75 },
          { type: "autopan", speed: 0.12, depth: 0.45 },
        ],
        berserk: [
          { type: "distortion", amount: 42 },
          { type: "ringmod", speed: 18, mix: 0.25 },
          { type: "compressor", threshold: -18, knee: 4, ratio: 8, attack: 0.003, release: 0.08 },
        ],
        bossAura: [
          { type: "bandpass", frequency: 900, resonance: 4 },
          { type: "phaser", rate: 0.22, depth: 700, frequency: 550, stages: 6 },
          { type: "reverb", duration: 5.5, decay: 0.93, wet: 0.65 },
        ],
        criticalHitSting: [
          { type: "highpass", frequency: 1800, resonance: 2 },
          { type: "eq3", low: -3, mid: 2, high: 5, midFreq: 3000 },
          { type: "delay", delay: 0.12, feedback: 0.35, wet: 0.18 },
          { type: "reverb", duration: 1.1, decay: 0.45, wet: 0.16 },
        ],
        nearDeath: [
          { type: "lowpass", frequency: 650, resonance: 2 },
          { type: "tremolo", rate: 1.35, depth: 0.35, shape: "sine" },
          { type: "reverb", duration: 2.8, decay: 0.8, wet: 0.35 },
        ],
      },

      horror: {
        nightmare: [
          { type: "vibrato", rate: 3, depth: 30, shape: "sine" },
          { type: "lowpass", frequency: 800, resonance: 2 },
          { type: "reverb", duration: 5, decay: 0.9, wet: 0.7 },
        ],
        nightmareAugmented: [
          { type: "ringmod", speed: 8, mix: 0.7 },
          { type: "reverb", duration: 6, decay: 0.95, wet: 0.8 },
          { type: "tremolo", rate: 0.5, depth: 0.5, shape: "sine" },
          { type: "lowpass", frequency: 1000, resonance: 3 },
        ],
        hauntedHall: [
          { type: "highpass", frequency: 180, resonance: 0.7 },
          { type: "reverb", duration: 5, decay: 0.92, wet: 0.7 },
          { type: "tremolo", rate: 0.8, depth: 0.25, shape: "sine" },
        ],
        cursedChapel: [
          { type: "bandpass", frequency: 850, resonance: 8 },
          { type: "reverb", duration: 6, decay: 0.94, wet: 0.65 },
          { type: "autopan", speed: 0.4, depth: 0.4 },
        ],
        dungeonDepths: [
          { type: "lowpass", frequency: 900, resonance: 1.2 },
          { type: "reverb", duration: 3.5, decay: 0.85, wet: 0.5 },
          { type: "tremolo", rate: 0.6, depth: 0.18, shape: "sine" },
        ],
        ghostWhisper: [
          { type: "highpass", frequency: 400, resonance: 0.8 },
          { type: "widener", width: 0.025 },
          { type: "autopan", speed: 0.7, depth: 0.6 },
          { type: "reverb", duration: 4, decay: 0.9, wet: 0.55 },
        ],
        madness: [
          { type: "lowpass", frequency: 700, resonance: 1.4 },
          { type: "bitcrusher", bits: 10, normfreq: 0.55 },
          { type: "ringmod", speed: 12 },
          { type: "reverb", duration: 2.5, decay: 0.75, wet: 0.45 },
        ],
        eldritchVoid: [
          { type: "highpass", frequency: 220, resonance: 1 },
          { type: "phaser", rate: 0.6, depth: 0.7 },
          { type: "reverb", duration: 6.5, decay: 0.96, wet: 0.7 },
        ],
        flangedSpirit: [
          { type: "flanger", rate: 0.35, depth: 0.003, feedback: 0.6 },
          { type: "reverb", duration: 3.2, decay: 0.85, wet: 0.45 },
          { type: "highpass", frequency: 260, resonance: 0.9 },
        ],
        poltergeist: [
          { type: "autopan", speed: 1.0, depth: 0.9 },
          { type: "widener", width: 0.02 },
          { type: "reverb", duration: 4.2, decay: 0.9, wet: 0.55 },
        ],
        possessedRadio: [
          { type: "bandpass", frequency: 1600, resonance: 4 },
          { type: "bitcrusher", bits: 7, normfreq: 0.55 },
          { type: "tremolo", rate: 9, depth: 0.55, shape: "square" },
          { type: "distortion", amount: 18 },
        ],
        ritualChant: [
          { type: "chorus", wet: 0.28 },
          { type: "eq3", low: 2, mid: 1.5, high: -2, midFreq: 1200 },
          { type: "reverb", duration: 5, decay: 0.9, wet: 0.6 },
        ],
        mirrorRealm: [
          { type: "phaser", rate: 0.35, depth: 900, frequency: 800, stages: 6 },
          { type: "delay", delay: 0.32, feedback: 0.5, wet: 0.3 },
          { type: "highpass", frequency: 350, resonance: 0.8 },
          { type: "reverb", duration: 4.6, decay: 0.88, wet: 0.55 },
        ],
      },

      communication: {
        phone: [
          { type: "bandpass", frequency: 1000, resonance: 5 },
          { type: "distortion", amount: 20 },
          { type: "compressor", threshold: -20, knee: 10, ratio: 6, attack: 0.01, release: 0.1 },
        ],
        radio: [
          { type: "bandpass", frequency: 2000, resonance: 3 },
          { type: "bitcrusher", bits: 12, normfreq: 0.2 },
          { type: "distortion", amount: 10 },
        ],
        radioDistress: [
          { type: "highpass", frequency: 450, resonance: 0.8 },
          { type: "bandpass", frequency: 1400, resonance: 6 },
          { type: "distortion", amount: 45 },
          { type: "compressor", threshold: -20, ratio: 6, attack: 0.01, release: 0.3 },
          { type: "reverb", duration: 1.2, decay: 0.4, wet: 0.25 },
        ],
      },

      lofi: {
        retro: [
          { type: "bitcrusher", bits: 8, normfreq: 0.3 },
          { type: "lowpass", frequency: 4000, resonance: 1 },
        ],
        corrupted: [
          { type: "bitcrusher", bits: 4, normfreq: 0.7 },
          { type: "ringmod", speed: 15, mix: 0.6 },
        ],
        damaged: [
          { type: "bitcrusher", bits: 6, normfreq: 0.6 },
          { type: "tremolo", rate: 8, depth: 0.4, shape: "square" },
        ],
      },

      dynamics: {
        gentle: [
          { type: "compressor", threshold: -18, knee: 6, ratio: 3, attack: 0.01, release: 0.1 },
        ],
        squashed: [
          { type: "compressor", threshold: -30, knee: 10, ratio: 8, attack: 0.001, release: 0.05 },
        ],
        broadcast: [
          { type: "compressor", threshold: -20, knee: 15, ratio: 6, attack: 0.005, release: 0.2 },
          { type: "eq3", low: -2, mid: 2, high: 3, midFreq: 2000 },
        ],
        limiter: [
          { type: "compressor", threshold: -6, knee: 1, ratio: 20, attack: 0.001, release: 0.1 },
        ],
        bassChamber: [
          { type: "compressor", threshold: -18, ratio: 8, attack: 0.005, release: 0.25 },
          { type: "eq3", low: 4, mid: -2, high: -1, midFreq: 600 },
          { type: "reverb", duration: 2.4, decay: 0.75, wet: 0.4 },
        ],
      },

      spatial: {
        scifi: [
          { type: "phaser", rate: 0.5, depth: 800, frequency: 500, stages: 8 },
          { type: "reverb", duration: 3, decay: 0.5, wet: 0.4 },
        ],
        jet: [{ type: "flanger", rate: 0.2, depth: 0.005, feedback: 0.7 }],
        wide: [{ type: "widener", width: 0.02 }],
        psychotic: [
          { type: "flanger", rate: 1.5, depth: 0.008, feedback: 0.8 },
          { type: "tremolo", rate: 7, depth: 0.6, shape: "triangle" },
        ],
        stutter: [
          { type: "bitcrusher", bits: 8, normfreq: 0.4 },
          { type: "tremolo", rate: 10, depth: 0.75, shape: "square" },
        ],
        dizzy: [
          { type: "autopan", speed: 0.8, depth: 1.0 },
          { type: "phaser", rate: 0.3, depth: 400, frequency: 800, stages: 4 },
        ],
      },

      locations: {
        tinyBathroom: [
          { type: "highpass", frequency: 220, resonance: 1 },
          { type: "delay", delay: 0.08, feedback: 0.25, wet: 0.18 },
          { type: "reverb", duration: 1.2, decay: 0.45, wet: 0.35 },
        ],
        warehouse: [
          {
            type: "multitap",
            maxDelay: 1,
            taps: [
              { delay: 0.14, feedback: 0.25, pan: -0.3, wet: 0.25 },
              { delay: 0.22, feedback: 0.22, pan: 0.3, wet: 0.25 },
            ],
          },
          { type: "reverb", duration: 3.8, decay: 0.86, wet: 0.55 },
          { type: "highpass", frequency: 180, resonance: 0.7 },
        ],
        stoneCorridor: [
          { type: "bandpass", frequency: 1200, resonance: 2.5 },
          {
            type: "multitap",
            maxDelay: 1,
            taps: [
              { delay: 0.18, feedback: 0.3, pan: -0.5, wet: 0.25 },
              { delay: 0.26, feedback: 0.28, pan: 0.5, wet: 0.25 },
            ],
          },
          { type: "reverb", duration: 2.6, decay: 0.8, wet: 0.45 },
        ],
        openField: [
          { type: "highpass", frequency: 180, resonance: 0.7 },
          { type: "reverb", duration: 1.9, decay: 0.55, wet: 0.18 },
        ],
      },

      extreme: {
        overdrive: [{ type: "overdrive", drive: 25, output: 1.2 }],
        glitchApocalypse: [
          { type: "bitcrusher", bits: 3, normfreq: 0.8 },
          { type: "ringmod", speed: 45, mix: 0.9 },
          { type: "tremolo", rate: 15, depth: 0.8, shape: "square" },
          { type: "distortion", amount: 80 },
          { type: "reverb", duration: 1.5, decay: 0.5, wet: 0.3 },
        ],
        totalCrushed: [
          {
            type: "compressor",
            threshold: -50,
            knee: 0.5,
            ratio: 20,
            attack: 0.0001,
            release: 0.05,
          },
          { type: "limiter", threshold: -3, knee: 0, ratio: Infinity, attack: 0.001, release: 0.1 },
          { type: "distortion", amount: 50 },
        ],
        voidReverb: [
          { type: "reverb", duration: 8, decay: 0.98, wet: 0.95 },
          { type: "lowpass", frequency: 2000, resonance: 0.5 },
        ],
        tinnySpeaker: [
          { type: "highpass", frequency: 3500, resonance: 8 },
          { type: "distortion", amount: 35 },
          { type: "compressor", threshold: -25, ratio: 10, attack: 0.005, release: 0.15 },
        ],
        boomy: [
          { type: "lowpass", frequency: 250, resonance: 6 },
          { type: "tremolo", rate: 2, depth: 0.4, shape: "sine" },
          { type: "reverb", duration: 4, decay: 0.9, wet: 0.6 },
        ],
        chaosModulation: [
          { type: "flanger", rate: 1.8, depth: 0.008, feedback: 0.85 },
          { type: "phaser", rate: 0.4, depth: 1000, frequency: 400, stages: 6 },
          { type: "vibrato", rate: 7, depth: 40, shape: "triangle" },
          { type: "autopan", speed: 1.2, depth: 1.0 },
        ],
        blown: [
          { type: "overdrive", drive: 40, output: 2.0 },
          { type: "distortion", amount: 70 },
          { type: "bitcrusher", bits: 8, normfreq: 0.5 },
          { type: "compressor", threshold: -15, ratio: 15, attack: 0.002, release: 0.08 },
        ],
      },

      character: {
        robot: [
          { type: "ringmod", speed: 30, mix: 1.0 },
          { type: "delay", delay: 0.15, feedback: 0.3, wet: 0.2 },
        ],
        tiny: [
          { type: "highpass", frequency: 1200, resonance: 1.5 },
          { type: "widener", width: 0.02 },
          { type: "vibrato", rate: 5, depth: 10, shape: "triangle" },
          { type: "reverb", duration: 1.5, decay: 0.6, wet: 0.4 },
        ],
        giant: [
          { type: "lowpass", frequency: 400, resonance: 1.5 },
          { type: "tremolo", rate: 1, depth: 0.2, shape: "sine" },
          { type: "reverb", duration: 5.5, decay: 0.95, wet: 0.65 },
        ],
        overdrivenLute: [
          { type: "overdrive", drive: 18, output: 1.1 },
          { type: "eq3", low: -1.5, mid: 1.5, high: 2.5, midFreq: 1800 },
          { type: "reverb", duration: 1.6, decay: 0.6, wet: 0.3 },
        ],
      },

      tonal: {
        muffled: [{ type: "eq3", low: 5, mid: -10, high: -20 }],
        nextroom: [
          { type: "eq3", low: 2, mid: -5, high: -30 },
          { type: "reverb", duration: 1.5, decay: 0.5, wet: 0.2 },
        ],
      },

      // Aliases point to other presets
      _aliases: {
        angelic: "environment.shimmer",
      },
    },

    // Get a preset by name, supporting nested paths and aliases
    getPreset(name) {
      if (!name || typeof name !== "string") return null;

      // Check aliases first
      if (this.presets._aliases && this.presets._aliases[name]) {
        name = this.presets._aliases[name];
      }

      // Handle "category.preset" format
      if (name.includes(".")) {
        const segments = name.split(".");
        if (segments.length !== 2) return null;
        const category = segments[0];
        const presetName = segments[1];
        if (!category || !presetName) return null;
        const cat = this.presets[category];
        if (cat && cat[presetName]) return cat[presetName];
        return null;
      }

      // Search all categories for the preset name
      for (const categoryName of Object.keys(this.presets)) {
        if (categoryName.startsWith("_")) continue; // Skip _aliases etc.
        const category = this.presets[categoryName];
        if (category && typeof category === "object" && category[name]) {
          return category[name];
        }
      }

      return null;
    },

    // List all preset names (for tests and debugging)
    listPresets() {
      const result = {};
      for (const categoryName of Object.keys(this.presets)) {
        if (categoryName.startsWith("_")) continue;
        const category = this.presets[categoryName];
        if (category && typeof category === "object") {
          result[categoryName] = Object.keys(category);
        }
      }
      return result;
    },

    // Get flat list of all preset names
    getAllPresetNames() {
      const names = [];
      for (const categoryName of Object.keys(this.presets)) {
        if (categoryName.startsWith("_")) continue;
        const category = this.presets[categoryName];
        if (category && typeof category === "object") {
          names.push(...Object.keys(category));
        }
      }
      // Add aliases
      if (this.presets._aliases) {
        names.push(...Object.keys(this.presets._aliases));
      }
      return names.sort();
    },
  };

  // --- Track-level effect integration (lives on hub) ---
  hub.connectEffectChain = function(key, buffer) {
      const chain = this.effectChains.get(key);
      if (!chain) return false;

      // Validate buffer has required WebAudio internals
      const validation = AudioEffects.validateBuffer(buffer, key);
      if (!validation.valid) {
        Logger.warn(`Cannot connect effects for ${key}: ${validation.reason}`);
        Logger.warn("This may indicate plugin conflicts or WebAudio internals changed");
        return false;
      }

      try {
        // Disconnect old connections before reconnecting
        // Wrap in try/catch - nodes may already be disconnected
        try {
          buffer._sourceNode.disconnect();
        } catch (_) {
          Logger.effect(`_reconnectEffectChain: sourceNode already disconnected (expected)`);
        }
        try {
          chain.output.disconnect();
        } catch (_) {
          Logger.effect(`_reconnectEffectChain: chain output already disconnected (expected)`);
        }

        // Connect the new buffer
        buffer._sourceNode.connect(chain.input);
        chain.output.connect(buffer._gainNode);
        Logger.effect(`Connected effect chain for ${key}`);
        return true;
      } catch (error) {
        Logger.error(`Failed to connect effect chain for ${key}: ${error.message}`);
        return false;
      }
  };

  hub._disposeEffectChain = function(key, chain, buffer, options = {}) {
      if (!chain) return;
      const restoreRouting = options.restoreRouting !== false;

      // Best-effort disconnect: WebAudio disconnect() can throw if already disconnected.
      try {
        if (buffer && restoreRouting && buffer._sourceNode && buffer._gainNode) {
          try {
            buffer._sourceNode.disconnect(chain.input);
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: disconnect old routing (source->chain) failed",
              {},
              "disposeEffectChain.disconnectOldRouting.source"
            );
          }
          try {
            chain.output.disconnect(buffer._gainNode);
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: disconnect old routing (chain->gain) failed",
              {},
              "disposeEffectChain.disconnectOldRouting.output"
            );
          }
        }
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: disconnect old routing outer failed",
          {},
          "disposeEffectChain.disconnectOldRouting.outer"
        );
      }

      // Disconnect chain internals.
      try {
        if (chain.input && chain.input.disconnect) chain.input.disconnect();
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: disconnect input failed",
          {},
          "disposeEffectChain.disconnectInput"
        );
      }
      try {
        if (chain.output && chain.output.disconnect) chain.output.disconnect();
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: disconnect output failed",
          {},
          "disposeEffectChain.disconnectOutput"
        );
      }
      try {
        if (chain.wetGain && chain.wetGain.disconnect) chain.wetGain.disconnect();
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: disconnect wetGain failed",
          {},
          "disposeEffectChain.disconnectWetGain"
        );
      }
      try {
        if (chain.dryGain && chain.dryGain.disconnect) chain.dryGain.disconnect();
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: disconnect dryGain failed",
          {},
          "disposeEffectChain.disconnectDryGain"
        );
      }

      if (Array.isArray(chain.nodes)) {
        chain.nodes.forEach((node) => {
          try {
            if (node && node.disconnect) node.disconnect();
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: disconnect node failed",
              {},
              "disposeEffectChain.disconnectNode"
            );
          }
          // Release ConvolverNode internal buffer copy
          try {
            if (node && node.buffer !== undefined) node.buffer = null;
          } catch (_e) {
            // Some nodes don't allow setting buffer to null
          }
        });
        chain.nodes.length = 0;
      }

      if (Array.isArray(chain.oscillators)) {
        chain.oscillators.forEach((osc) => {
          try {
            if (osc && osc.stop) osc.stop();
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: oscillator stop failed",
              {},
              "disposeEffectChain.stopOsc"
            );
          }
          try {
            if (osc && osc.disconnect) osc.disconnect();
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: oscillator disconnect failed",
              {},
              "disposeEffectChain.disconnectOsc"
            );
          }
        });
        // Clear array to help GC and prevent accidental reuse
        chain.oscillators.length = 0;
      }

      // Null out all node references to help GC on older Chromium
      chain.input = null;
      chain.output = null;
      chain.wetGain = null;
      chain.dryGain = null;

      // Restore default routing (source -> gain) if the track is still live.
      try {
        if (buffer && restoreRouting && buffer._sourceNode && buffer._gainNode) {
          try {
            buffer._sourceNode.disconnect();
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: restore routing disconnect failed",
              {},
              "disposeEffectChain.restoreRouting.disconnect"
            );
          }
          try {
            buffer._sourceNode.connect(buffer._gainNode);
          } catch (_e) {
            Logger.debugOnce(
              "disposeEffectChain: restore routing connect failed",
              {},
              "disposeEffectChain.restoreRouting.connect"
            );
          }
        }
      } catch (_e) {
        Logger.debugOnce(
          "disposeEffectChain: restore routing outer failed",
          {},
          "disposeEffectChain.restoreRouting.outer"
        );
      }

      Logger.effect(`Disposed effect chain nodes for ${key}`);
  };

  hub._setEffectWetMix = function(chain, wetMix) {
      if (!chain || !chain.wetGain || !chain.dryGain) return false;
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      const mix = clamp01(typeof wetMix === "number" && isFinite(wetMix) ? wetMix : 0);

      // Equal-power (sqrt) crossfade to avoid loudness dips at mid-mix.
      // mix=0.5 => wet≈0.707, dry≈0.707 (instead of 0.5/0.5 which often sounds quieter)
      chain._wetMix = mix;
      chain.wetGain.gain.value = Math.sqrt(mix);
      chain.dryGain.gain.value = Math.sqrt(1 - mix);
      return true;
  };

  hub.applyEffect = function(key, effectConfig, params) {
      // Lazy-init: grab context on-demand if init() was called too early
      if (!AudioEffects.context && WebAudio._context) {
        AudioEffects.context = WebAudio._context;
        Logger.info("AudioEffects: Late-initialized context");
      }
      if (!AudioEffects.context) {
        Logger.warn(`Cannot apply effect to ${key}: WebAudio context not ready`);
        return false;
      }

      // B10: any direct effect application supersedes a pending crossfade for
      // this key, so bump the generation token to abort its mid-point timeout.
      if (!this._effectCrossfadeGen) this._effectCrossfadeGen = new Map();
      this._effectCrossfadeGen.set(key, (this._effectCrossfadeGen.get(key) || 0) + 1);

      // Clean up existing effect chain if present
      if (this.effectChains.has(key)) {
        this.clearEffect(key);
      }

      let effects;
      // Strip 'preset:' prefix if present to support documented syntax
      let lookupKey = effectConfig;
      if (typeof effectConfig === "string" && effectConfig.startsWith("preset:")) {
        lookupKey = effectConfig.substring(7); // Remove 'preset:' prefix
      }

      // Look up preset using getPreset() which handles nested categories and aliases
      const presetEffects =
        typeof lookupKey === "string" ? AudioEffects.getPreset(lookupKey) : null;
      if (presetEffects) {
        effects = presetEffects;
        Logger.effect(`Applying preset '${lookupKey}' to ${key}`);
      } else if (Array.isArray(effectConfig)) {
        effects = effectConfig;
      } else {
        const knownEffectTypes = {
          reverb: true,
          lowpass: true,
          highpass: true,
          bandpass: true,
          distortion: true,
          overdrive: true,
          bitcrusher: true,
          compressor: true,
          delay: true,
          multitap: true,
          tremolo: true,
          vibrato: true,
          chorus: true,
          phaser: true,
          flanger: true,
          widener: true,
          eq3: true,
          ringmod: true,
          autopan: true,
        };

        if (typeof effectConfig === "string" && !knownEffectTypes[effectConfig]) {
          Logger.warn(`Unknown effect preset/type '${effectConfig}' for ${key}`);
          return false;
        }

        // Single effect with parameters
        const effect = { type: effectConfig };

        // Parameter mapping per effect type
        const paramMaps = {
          reverb: ["duration", "decay", "wet"],
          lowpass: ["frequency", "resonance"],
          highpass: ["frequency", "resonance"],
          bandpass: ["frequency", "resonance"],
          distortion: ["amount"],
          bitcrusher: ["bits", "normfreq"],
          compressor: ["threshold", "knee", "ratio", "attack", "release"],
          delay: ["delay", "feedback", "wet"],
          chorus: ["wet"],
          tremolo: ["rate", "depth", "shape"],
          vibrato: ["rate", "depth", "shape"],
          phaser: ["rate", "depth", "stages", "frequency"],
          flanger: ["rate", "depth", "feedback"],
          widener: ["width"],
          eq3: ["low", "mid", "high", "midFreq"],
          ringmod: ["speed", "mix"],
          autopan: ["speed", "depth"],
          convolver: ["url"],
          multitap: ["tap1", "tap2", "tap3", "tap4", "tap5", "tap6"],
          overdrive: ["drive", "output"],
        };

        const paramNames = paramMaps[effectConfig] || [];

        // Safely process parameters
        if (Array.isArray(params)) {
          params.forEach((param, idx) => {
            if (paramNames[idx] && param !== undefined && param !== null) {
              // Special handling for string parameters
              if (paramNames[idx] === "shape") {
                effect[paramNames[idx]] = String(param);
              } else {
                const numValue = Number(param);
                if (!isNaN(numValue)) {
                  effect[paramNames[idx]] = numValue;
                }
              }
            }
          });
        }
        effects = [effect];
      }

      // Determine wet/dry mix from effect metadata (optional)
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      let wetMix = 0.35; // sensible default

      // Priority: explicit wetMix on any effect, else first numeric "wet"
      const mixSource = effects.find((e) => e && typeof e === "object" && e.wetMix !== undefined);
      if (mixSource && typeof mixSource.wetMix === "number" && !isNaN(mixSource.wetMix)) {
        wetMix = mixSource.wetMix;
      } else {
        const wetSource = effects.find((e) => e && typeof e === "object" && e.wet !== undefined);
        if (wetSource && typeof wetSource.wet === "number" && !isNaN(wetSource.wet)) {
          wetMix = wetSource.wet;
        }
      }
      wetMix = clamp01(wetMix);

      const chain = AudioEffects.createEffectChain(effects);
      if (chain) {
        chain._targetWetMix = wetMix;
        this._setEffectWetMix(chain, wetMix);
        this.effectChains.set(key, chain);

        const buffer = this.tracks.get(key);
        if (buffer) {
          this.connectEffectChain(key, buffer);
          // Persist the chosen effect on the buffer so save/resume/listall stay accurate.
          const effectKeyToStore =
            typeof effectConfig === "string"
              ? effectConfig
              : typeof lookupKey === "string"
                ? lookupKey
                : effectConfig;
          buffer._effect = effectKeyToStore;
          // Keep paused snapshot (if any) in sync to avoid stale reloads.
          if (this.pausedSnapshots && this.pausedSnapshots.has(key)) {
            const snap = this.pausedSnapshots.get(key);
            if (snap) snap.effect = effectKeyToStore;
          }
        }

        Logger.effect(`Applied effects to ${key}`, effects);
        return true;
      }

      return false;
  };

  hub.fadeEffect = function(key, effectConfig, params, fadeInDuration) {
      // Validate parameters
      if (!params) params = [];
      if (!fadeInDuration || isNaN(fadeInDuration)) fadeInDuration = 2;

      // Don't slice params - caller already extracted duration separately
      if (!this.applyEffect(key, effectConfig, params)) {
        return false;
      }

      const chain = this.effectChains.get(key);
      if (!chain) return false;

      // Start with no effect (full dry)
      const targetWetMix =
        typeof chain._targetWetMix === "number" && isFinite(chain._targetWetMix)
          ? chain._targetWetMix
          : 1;
      this._setEffectWetMix(chain, 0);

      Logger.info(`Starting effect fade-in for ${key}: ${effectConfig} over ${fadeInDuration}s`);

      // Fade in the effect
      FadeManager.startFade(
        `${key}_effectWet`,
        0,
        targetWetMix,
        fadeInDuration,
        (value) => {
          this._setEffectWetMix(chain, value);
        },
        () => {
          Logger.success(`Effect fade-in complete for ${key}: ${effectConfig}`);
        }
      );

      return true;
  };

  hub.fadeOutEffect = function(key, fadeOutDuration) {
      const chain = this.effectChains.get(key);
      if (!chain) return false;

      // Store reference to identify this specific chain later
      const originalChain = chain;

      Logger.info(`Starting effect fade-out for ${key} over ${fadeOutDuration}s`);

      FadeManager.startFade(
        `${key}_effectWet`,
        typeof chain._wetMix === "number" && isFinite(chain._wetMix)
          ? chain._wetMix
          : chain.wetGain && chain.wetGain.gain
            ? Math.max(0, Math.min(1, chain.wetGain.gain.value * chain.wetGain.gain.value))
            : 1,
        0,
        fadeOutDuration,
        (value) => {
          const currentChain = this.effectChains.get(key);
          // Only update if this is still the same chain we started fading
          if (!currentChain || currentChain !== originalChain) return;
          this._setEffectWetMix(currentChain, value);
        }
      );

      // Use setTimeout for critical cleanup instead of fade callback
      // This ensures cleanup happens even if fade is cancelled by another operation
      const timeoutId = setTimeout(() => {
        const currentChain = this.effectChains.get(key);
        // Only cleanup if this is still the same chain we started fading
        if (!currentChain || currentChain !== originalChain) {
          Logger.info(`Effect fade-out cleanup skipped - effect was replaced for ${key}`);
          return;
        }

        const buffer = this.tracks.get(key);
        this._disposeEffectChain(key, currentChain, buffer);
        this.effectChains.delete(key);
        Logger.success(`Effect fade-out complete for ${key}`);

        // Remove timeout from tracking
        if (this.activeTimeouts.has(key)) {
          const timeouts = this.activeTimeouts.get(key);
          const index = timeouts.indexOf(timeoutId);
          if (index > -1) timeouts.splice(index, 1);
          if (timeouts.length === 0) this.activeTimeouts.delete(key);
        }
      }, fadeOutDuration * 1000);

      // Track this timeout for cleanup
      if (!this.activeTimeouts.has(key)) {
        this.activeTimeouts.set(key, []);
      }
      this.activeTimeouts.get(key).push(timeoutId);

      return true;
  };

  hub.crossFadeEffect = function(key, oldEffect, newEffect, duration, curve = "smooth", newEffectParams = []) {
      Logger.info(
        `Starting effect cross-fade for ${key}: ${oldEffect} -> ${newEffect} over ${duration}s with curve ${curve}`
      );

      // B10: generation token per key. Each crossfade (or effect swap) bumps the
      // token so a superseded crossfade's mid-point timeout aborts instead of
      // clobbering the newer effect chain. fadeOutEffect's own guard already
      // covers the intra-crossfade ordering; this covers *interleaved* commands.
      if (!this._effectCrossfadeGen) this._effectCrossfadeGen = new Map();
      const gen = (this._effectCrossfadeGen.get(key) || 0) + 1;
      this._effectCrossfadeGen.set(key, gen);

      // Start fade out of old effect
      this.fadeOutEffect(key, duration / 2);

      // After half duration, start new effect
      const timeoutId = setTimeout(
        () => {
          // B10: bail if a newer crossfade/effect superseded this one.
          if (this._effectCrossfadeGen.get(key) !== gen) {
            Logger.info(`Effect cross-fade for ${key} superseded — skipping new effect apply`);
            if (this.activeTimeouts.has(key)) {
              const timeouts = this.activeTimeouts.get(key);
              const idx = timeouts.indexOf(timeoutId);
              if (idx > -1) timeouts.splice(idx, 1);
              if (timeouts.length === 0) this.activeTimeouts.delete(key);
            }
            return;
          }

          // Check if track still exists before applying new effect
          if (!this.tracks.has(key)) {
            Logger.warn(`Effect cross-fade cancelled - track ${key} no longer exists`);
            return;
          }

          // applyEffect (via fadeEffect) clears any lingering chain internally, and
          // fadeOutEffect's cleanup timeout guards on chain identity, so applying
          // the new effect here is safe regardless of which timer fired first.
          this.fadeEffect(key, newEffect, newEffectParams, duration / 2);
          Logger.success(`Effect cross-fade complete for ${key}: ${oldEffect} -> ${newEffect}`);

          // Remove timeout from tracking
          if (this.activeTimeouts.has(key)) {
            const timeouts = this.activeTimeouts.get(key);
            const index = timeouts.indexOf(timeoutId);
            if (index > -1) timeouts.splice(index, 1);
            if (timeouts.length === 0) this.activeTimeouts.delete(key);
          }
        },
        (duration / 2) * 1000
      );

      // Track this timeout for cleanup
      if (!this.activeTimeouts.has(key)) {
        this.activeTimeouts.set(key, []);
      }
      this.activeTimeouts.get(key).push(timeoutId);

      return true;
  };

  hub.clearEffect = function(key, options = {}) {
      if (!this.effectChains.has(key)) return false;

      const chain = this.effectChains.get(key);
      const buffer = this.tracks.get(key);

      this._disposeEffectChain(key, chain, buffer);
      this.effectChains.delete(key);
      FadeManager.cancelFade(`${key}_effectWet`);

      // Optionally clear the persisted effect config for resume/save.
      const keepConfig = options.keepConfig !== false;
      if (!keepConfig) {
        if (buffer) buffer._effect = null;
        const snapshot = this.pausedSnapshots.get(key);
        if (snapshot) snapshot.effect = null;
      }

      Logger.effect(`Cleared effects from ${key}`);
      return true;
  };

  // --- Public script API ---
    /**
     * Apply an effect preset to a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {string} preset - Effect preset name (e.g., 'underwater', 'cave', 'phone')
     * @param {array} params - Additional effect parameters
     * @returns {boolean} Success
     */
  hub.setEffect = function(type, trackId = 1, preset, params = []) {
      const key = `${type}_${trackId}`;
      return this.applyEffect(key, preset, params);
  };

    /**
     * Fade in an effect on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {string} preset - Effect preset name
     * @param {number} duration - Fade-in duration in seconds (default 2)
     * @param {array} params - Additional effect parameters
     * @returns {boolean} Success
     */
  hub.fadeInEffect = function(type, trackId = 1, preset, duration = 2, params = []) {
      const key = `${type}_${trackId}`;
      return this.fadeEffect(key, preset, params, duration);
  };

    /**
     * Fade out the current effect on a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @param {number} duration - Fade-out duration in seconds (default 2)
     * @returns {boolean} Success
     */
  hub.fadeOutEffectOnTrack = function(type, trackId = 1, duration = 2) {
      const key = `${type}_${trackId}`;
      return this.fadeOutEffect(key, duration);
  };

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
  hub.crossfadeEffects = function(type, trackId = 1, fromPreset, toPreset, duration = 3, params = []) {
      const key = `${type}_${trackId}`;
      return this.crossFadeEffect(key, fromPreset, toPreset, duration, "smooth", params);
  };

    /**
     * Clear all effects from a track.
     * @param {string} type - 'bgm', 'bgs', 'me', or 'se'
     * @param {number|string} trackId - Track number
     * @returns {boolean} Success
     */
  hub.removeEffect = function(type, trackId = 1) {
      const key = `${type}_${trackId}`;
      return this.clearEffect(key, { keepConfig: false });
  };

  // Register command handlers (overwrite Core's soft stubs)
  hub.registerHandler("effect", function (cmd) {
    return this.applyEffect(`${cmd.type}_${cmd.trackId}`, cmd.args[0], cmd.args.slice(1));
  });
  hub.registerHandler("fadeeffect", function (cmd) {
    const args = cmd.args;
    if (args.length === 0) {
      Logger.warn("No effect specified for fadeeffect command");
      return false;
    }
    let fadeEffectParams, fadeInDuration;
    if (args.length === 1) {
      fadeEffectParams = [];
      fadeInDuration = 2;
    } else {
      fadeEffectParams = args.slice(1, -1);
      fadeInDuration = Number(args[args.length - 1]);
      if (isNaN(fadeInDuration)) {
        fadeEffectParams = args.slice(1);
        fadeInDuration = 2;
      }
    }
    return this.fadeEffect(`${cmd.type}_${cmd.trackId}`, args[0], fadeEffectParams, fadeInDuration);
  });
  hub.registerHandler("fadeouteffect", function (cmd) {
    return this.fadeOutEffect(`${cmd.type}_${cmd.trackId}`, this.toNum(cmd.args[0], 2));
  });
  hub.registerHandler("cleareffect", function (cmd) {
    return this.clearEffect(`${cmd.type}_${cmd.trackId}`, { keepConfig: false });
  });
  hub.registerHandler("crossfadeeffect", function (cmd) {
    const args = cmd.args;
    return this.crossFadeEffect(
      `${cmd.type}_${cmd.trackId}`,
      args[0],
      args[1],
      this.toNum(args[2], 3),
      "smooth",
      args.slice(3)
    );
  });

  // Teardown: dispose effect graph when Core cleans a track
  hub.onTeardown(function (key) {
    const chain = this.effectChains && this.effectChains.get(key);
    if (!chain) return;
    if (typeof this._disposeEffectChain === "function") {
      this._disposeEffectChain(key, chain, this.tracks.get(key), { restoreRouting: false });
    }
    this.effectChains.delete(key);
    FadeManager.cancelFade(`${key}_effectWet`);
  });

  // Init engine (Core may have already run init before this plugin loaded)
  AudioEffects.init();
  window.AudioEffects = AudioEffects;
  hub.AudioEffects = AudioEffects;

  Logger.success(TAG + " loaded — effect commands and AudioEffects ready");
})();
