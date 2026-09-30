"use strict";
/**
 * FugsAudio2Effects: effect / fadeeffect / fadeouteffect / crossfadeeffect /
 * cleareffect, the 19 documented raw effects and every documented preset.
 * Routing is verified on the fake audio graph: source -> chain -> gain.
 */
const fs = require("fs");
const path = require("path");
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { REPO_ROOT } = require("../harness/env");
const {
  forEachBackend, boot, play, keys, audibleSourcesOf, pluginErrors,
} = require("./support");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || "value"}: expected ${b} +/- ${tol}, got ${a}`);

function routing(env, key) {
  const ctx = env.audio;
  const chain = env.A.effectChains.get(key);
  const buf = env.track(key);
  const gain = buf && buf._gainNode;
  const srcs = audibleSourcesOf(env, key);
  const viaChain = (s) => ctx.edgesFrom(s).some((e) => e.to === (chain && chain.input));
  const direct = (s) => ctx.edgesFrom(s).some((e) => e.to === gain);
  const outToGain = !!(chain && chain.output && ctx.edgesFrom(chain.output).some((e) => e.to === gain));
  return { ctx, chain, buf, gain, srcs, viaChain, direct, outToGain };
}
function assertThroughChain(env, key, where) {
  const r = routing(env, key);
  assert.ok(r.chain, `${where}: effect chain exists`);
  assert.ok(r.srcs.length > 0, `${where}: track is audible`);
  for (const s of r.srcs) {
    assert.ok(r.viaChain(s), `${where}: source feeds the chain input`);
    assert.ok(!r.direct(s), `${where}: source must NOT also feed the gain directly (dry bypass)`);
    assert.ok(r.ctx.pathExists(s, r.ctx.destination), `${where}: source reaches the speakers`);
  }
  assert.ok(r.outToGain, `${where}: chain output feeds the track gain`);
}
function assertDirect(env, key, where) {
  const r = routing(env, key);
  assert.equal(env.A.effectChains.has(key), false, `${where}: chain removed`);
  assert.ok(r.srcs.length > 0, `${where}: track audible`);
  for (const s of r.srcs) assert.ok(r.direct(s), `${where}: source feeds gain directly again`);
}

// --------------------------------------------------------------- parse the Docs
const docsText = fs.readFileSync(path.join(REPO_ROOT, "FugsAudio0Docs.js"), "utf8");
function docPresets() {
  const start = docsText.indexOf(" * Available presets:");
  const end = docsText.indexOf("Performance note:", start);
  const names = new Set();
  for (const line of docsText.slice(start, end).split("\n").slice(1)) {
    // "   Category:   a, b, c"  or a wrapped continuation line "   d, e"
    const body = line.replace(/^\s*\*\s?/, "").replace(/^\s*[A-Za-z\/ -]+:\s+/, "");
    for (const n of body.split(",")) {
      const t = n.trim();
      if (/^[A-Za-z][A-Za-z0-9]*$/.test(t)) names.add(t);
    }
  }
  return Array.from(names);
}
const DOC_EFFECTS = ["reverb", "delay", "lowpass", "highpass", "bandpass", "distortion", "bitcrusher", "compressor",
  "chorus", "tremolo", "vibrato", "phaser", "flanger", "widener", "eq3", "ringmod", "autopan", "overdrive", "multitap"];

forEachBackend("effects: routing and lifecycle", (b) => {
  it("effect-bgm1 preset:cave puts the chain between source and gain", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("effect-bgm1 preset:cave");
    assertThroughChain(env, "bgm_1", "after effect command");
    assert.deepEqual(pluginErrors(env), []);
  });

  it("shorthand without 'preset:' also works: effect-bgm1 cave", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("effect-bgm1 cave");
    assertThroughChain(env, "bgm_1", "shorthand");
  });

  it("an effect issued right after play (file still loading) is applied as soon as the track starts", async () => {
    const env = await boot(b);
    await env.runCommand("play-bgm1 Theme 90");
    await env.runCommand("effect-bgm1 preset:underwater"); // same tick: buffer not decoded yet
    await env.settle();
    assertThroughChain(env, "bgm_1", "deferred connect");
  });

  it("FugsAudio.play(..., { effect }) applies the effect once the track is playing", async () => {
    const env = await boot(b);
    env.run("FugsAudio.play('bgm', 1, 'Theme', { volume: 80, effect: 'cave' })");
    await env.settle();
    assertThroughChain(env, "bgm_1", "play option");
  });

  it("cleareffect-bgm1 restores the direct source -> gain path", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("effect-bgm1 preset:cave");
    await env.runCommand("cleareffect-bgm1");
    assertDirect(env, "bgm_1", "after cleareffect");
  });

  it("changing effects replaces the old chain cleanly (no leftover connections)", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("effect-bgm1 preset:cave");
    const old = env.A.effectChains.get("bgm_1");
    await env.runCommand("effect-bgm1 preset:phone");
    const now = env.A.effectChains.get("bgm_1");
    assert.notEqual(old, now);
    assert.equal(env.audio.edgesFrom(old.output || {}).length, 0, "old chain output disconnected");
    assertThroughChain(env, "bgm_1", "after replacing");
  });

  it("fadeeffect-bgm1 preset:underwater 3 fades the wet signal in over 3 s", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("fadeeffect-bgm1 preset:underwater 3");
    const chain = env.A.effectChains.get("bgm_1");
    near(chain._wetMix, 0, 0.05, "starts dry");
    await env.advance(1500);
    assert.ok(chain._wetMix > 0.05, "wet is coming in, got " + chain._wetMix);
    await env.advance(2000);
    assert.ok(chain._wetMix >= chain._targetWetMix - 0.02, "reached target " + chain._targetWetMix + ", got " + chain._wetMix);
  });

  it("fadeouteffect-bgm1 2 fades the effect out, then removes it and restores routing", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("effect-bgm1 preset:cave");
    await env.runCommand("fadeouteffect-bgm1 2");
    await env.advance(1000);
    assert.equal(env.A.effectChains.has("bgm_1"), true, "still present mid fade");
    await env.advance(1300);
    assertDirect(env, "bgm_1", "after fadeouteffect");
  });

  it("crossfadeeffect-bgm1 preset:cave preset:underwater 4 ends with only the new effect", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("effect-bgm1 preset:cave");
    await env.runCommand("crossfadeeffect-bgm1 preset:cave preset:underwater 4");
    await env.advance(4500);
    assertThroughChain(env, "bgm_1", "after crossfade");
    assert.equal(env.track("bgm_1")._effect, "preset:underwater");
    assert.deepEqual(pluginErrors(env), []);
  });

  it("stopping a track tears its effect chain down (nothing left connected)", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("effect-bgm1 preset:cave");
    const chain = env.A.effectChains.get("bgm_1");
    const nodes = [chain.input, chain.output, chain.wetGain, chain.dryGain, ...chain.nodes];
    await env.runCommand("stop-bgm1");
    assert.equal(env.A.effectChains.has("bgm_1"), false);
    assert.equal(chain.input, null, "chain references released");
    for (const n of nodes) {
      assert.equal(env.audio.edgesFrom(n).length, 0, "no outgoing connections left on chain node " + n._kind);
    }
    assert.equal(env.audio.audibleSources().length, 0);
  });

  it("the effect survives pause/resume (a new buffer is created on resume)", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("effect-bgm1 preset:cave");
    await env.runCommand("pause-bgm1");
    await env.runCommand("resume-bgm1");
    await env.settle();
    assertThroughChain(env, "bgm_1", "after resume");
  });

  it("the effect survives (loop:N) restarts of the same buffer", async () => {
    const env = await boot(b);
    await play(env, "play-se1 Hit 90 (loop:2)");
    await env.runCommand("effect-se1 preset:cave");
    await env.advance(1300); // second play has started
    assertThroughChain(env, "se_1", "after a repeat");
  });

  it("stopall with active effects leaves no audible sources", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme");
    await env.runCommand("play-bgs1 Rain");
    await env.settle();
    await env.runCommand("effect-bgm1 preset:cave");
    await env.runCommand("effect-bgs1 preset:underwater");
    await env.runCommand("stopall");
    assert.deepEqual(keys(env), []);
    assert.equal(env.audio.audibleSources().length, 0);
    assert.equal(env.A.effectChains.size, 0);
  });
});

forEachBackend("effects: every documented raw effect and preset builds and routes", (b) => {
  for (const type of DOC_EFFECTS) {
    it(`raw effect '${type}' with default parameters`, async () => {
      const env = await boot(b);
      await play(env, "play-bgm1 Theme 90");
      await env.runCommand(`effect-bgm1 ${type}`);
      assertThroughChain(env, "bgm_1", type);
      assert.deepEqual(pluginErrors(env), []);
    });
  }

  it("documented parameterised examples: reverb 3 0.8 / lowpass 800 2 / distortion 30 / bitcrusher 8 0.5", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    for (const c of ["reverb 3 0.8", "lowpass 800 2", "distortion 30", "bitcrusher 8 0.5"]) {
      await env.runCommand(`effect-bgm1 ${c}`);
      assertThroughChain(env, "bgm_1", c);
    }
  });

  it("documented recipe: effect-bgm multitap 0.2 0.35 0.4 0.25", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("effect-bgm multitap 0.2 0.35 0.4 0.25");
    assertThroughChain(env, "bgm_1", "multitap recipe");
  });

  const presets = docPresets();
  it("the Docs list a sensible number of presets (parser sanity check)", () => {
    assert.ok(presets.length >= 60, "parsed " + presets.length + " preset names from the Docs");
  });

  it("every preset named in the Docs exists and builds a routed chain", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    const missing = presets.filter((n) => !env.run(`!!AudioEffects.getPreset(${JSON.stringify(n)})`));
    assert.deepEqual(missing, [], "documented presets that do not exist");
    const broken = [];
    for (const n of presets) {
      await env.runCommand(`effect-bgm1 preset:${n}`);
      const r = routing(env, "bgm_1");
      if (!r.chain || !r.srcs.every((s) => r.viaChain(s)) || !r.outToGain) broken.push(n);
    }
    assert.deepEqual(broken, [], "presets that failed to build or route");
    assert.deepEqual(pluginErrors(env), []);
  });

  it("every preset that exists in the code is mentioned in the Docs", async () => {
    const env = await boot(b);
    const all = env.run("AudioEffects.getAllPresetNames()");
    const undocumented = Array.from(all).filter((n) => !presets.includes(n));
    assert.deepEqual(undocumented, [], "presets missing from the Docs list");
  });
});
