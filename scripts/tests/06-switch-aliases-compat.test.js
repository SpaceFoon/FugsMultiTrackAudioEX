"use strict";
/**
 * FugsAudio5Switch (switch:N gating), FugsAudio6Aliases (SFX pools + humanizer),
 * FugsAudio7Compat (OcRam guard) and the debug helpers (list / testCommand).
 */
const { it } = require("node:test");
const assert = require("node:assert/strict");
const {
  forEachBackend, boot, play, keys, audibleSourcesOf, gainOf, rateOf, startedCount, pluginErrors,
} = require("./support");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || "value"}: expected ${b} +/- ${tol}, got ${a}`);

forEachBackend("switch-controlled audio", (b) => {
  it("play-bgm DangerTheme switch:15 plays when switch 15 turns ON and stops when it turns OFF", async () => {
    const env = await boot(b);
    await env.runCommand("play-bgm DangerTheme switch:15");
    await env.settle();
    assert.deepEqual(keys(env), [], "armed only");
    env.run("$gameSwitches.setValue(15, true)");
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1"]);
    assert.equal(audibleSourcesOf(env, "bgm_1").length, 1);
    env.run("$gameSwitches.setValue(15, false)");
    await env.settle();
    assert.deepEqual(keys(env), []);
    env.run("$gameSwitches.setValue(15, true)");
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1"], "fires again next time it turns ON");
  });

  it("running the event again while the switch is already ON does not restart the music", async () => {
    const env = await boot(b);
    env.run("$gameSwitches.setValue(15, true)");
    await env.runCommand("play-bgm DangerTheme 80 switch:15");
    await env.settle();
    const started = startedCount(env);
    await env.runCommand("play-bgm DangerTheme 80 switch:15"); // event re-run
    await env.settle();
    assert.equal(startedCount(env), started, "same command re-registered: no restart");
  });

  it("a switch that is already ON when the command runs fires immediately", async () => {
    const env = await boot(b);
    env.run("$gameSwitches.setValue(15, true)");
    await env.runCommand("play-bgm DangerTheme 80 switch:15");
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1"]);
  });
});

forEachBackend("SFX aliases", (b) => {
  it("registeralias + play-se alias:Name picks from the pool with the configured jitter", async () => {
    const env = await boot(b);
    await env.runCommand("registeralias FootstepGrass {pool:[step1,step2,step3], volumeJitter:5, pitchJitter:8}");
    assert.equal(env.A.sfxAliases.has("FootstepGrass"), true);
    const files = new Set();
    for (let i = 0; i < 40; i++) {
      await env.runCommand("play-se alias:FootstepGrass");
      await env.advance(80);
      const src = audibleSourcesOf(env, "se_1")[0];
      assert.ok(src, "audible");
      const g = gainOf(env, "se_1");
      const r = rateOf(env, "se_1");
      assert.ok(g >= 0.85 - 1e-6 && g <= 0.95 + 1e-6, "volume within 90 +/- 5: " + g);
      assert.ok(r >= 0.92 - 1e-6 && r <= 1.08 + 1e-6, "pitch within 100 +/- 8: " + r);
      files.add(env.track("se_1")._name);
    }
    assert.ok(files.size >= 2, "random pool selection used several files: " + Array.from(files));
    for (const f of files) assert.ok(["step1", "step2", "step3"].includes(f), "only pool files, got " + f);
  });

  it("cooldown suppresses rapid repeats; unregisteralias removes the alias", async () => {
    const env = await boot(b);
    env.run("FugsAudio.registerAlias('Hit', { pool: ['Hit'], cooldown: 500 })");
    assert.equal(env.run("FugsAudio.playAlias('Hit')"), true);
    assert.equal(env.run("FugsAudio.playAlias('Hit')"), false, "inside the 500 ms cooldown");
    await env.advance(600);
    assert.equal(env.run("FugsAudio.playAlias('Hit')"), true);
    await env.runCommand("unregisteralias Hit");
    assert.equal(env.A.sfxAliases.has("Hit"), false);
  });

  it("listaliases / FugsAudio.list() print without errors", async () => {
    const env = await boot(b);
    await env.runCommand("registeralias A {pool:[step1]}");
    await env.runCommand("listaliases");
    await play(env, "play-bgm1 Theme");
    const rows = env.run("FugsAudio.list()");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].key, "bgm_1");
    assert.deepEqual(pluginErrors(env), []);
  });
});

forEachBackend("compat and console helpers", (b) => {
  it("OcRam guard: fadeOutBgs with an empty BGS name no longer recurses forever", async () => {
    const { createEnv } = require("../harness/env");
    const env = await createEnv(b.cfg);
    env.addDefaultAudio();
    env.loadPlugin("FugsMultiTrackAudioEX.js", "FugsMultiTrackAudioEX");
    // pretend OcRam_Audio_EX is installed with its buggy fadeOutBgs
    env.run(`
      window.OcRam_Audio_EX = {};
      AudioManager.fadeOutBgs = function (duration, name) {
        if (!name) return this.fadeOutBgs(duration, this._currentBgs.name); // recurses when name is ""
        this._bgsBuffer.fadeOut(duration);
      };
    `);
    env.loadPlugin("FugsAudio7Compat.js", "FugsAudio7Compat");
    env.run(`
      window.__faded = false;
      AudioManager._currentBgs = { name: "" };
      AudioManager._bgsBuffer = { fadeOut: function () { window.__faded = true; } };
    `);
    assert.doesNotThrow(() => env.run("AudioManager.fadeOutBgs(1)"));
    assert.equal(env.run("window.__faded"), true);
    assert.equal(env.run("AudioManager._currentBgs"), null);
  });

  it("without OcRam the compat plugin is idle and harmless", async () => {
    const env = await boot(b);
    assert.equal(env.run("!!AudioManager._fugsOcRamFadeOutBgsPatched"), false);
    assert.deepEqual(pluginErrors(env), []);
  });

  it("FugsAudio.testCommand('play-bgm1 Battle1 90') runs a command string from the console", async () => {
    const env = await boot(b);
    env.run("FugsAudio.testCommand('play-bgm1 Battle1 90')");
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1"]);
    assert.ok(env.requests.includes("audio/bgm/Battle1.ogg"));
  });

  it("satellites loaded in the wrong order fail loudly, missing satellites fail softly", async () => {
    const { createEnv } = require("../harness/env");
    // 1. Effects BEFORE Core -> console.error, no crash
    let env = await createEnv(b.cfg);
    env.loadPlugin("FugsAudio2Effects.js", "FugsAudio2Effects");
    assert.ok(env.logs.error.some((l) => /must be ON and ABOVE/.test(l)), JSON.stringify(env.logs.error));
    // 2. Core only: satellite commands warn instead of throwing
    env = await createEnv(b.cfg);
    env.addDefaultAudio();
    env.loadPack(["core"]);
    env.bootAudio();
    env.enterMap();
    await env.runCommand("play-bgm1 Theme 90");
    await env.settle();
    await env.runCommand("effect-bgm1 preset:cave");
    await env.runCommand("duck-bgm1 0.3 1 1");
    await env.runCommand("proximity-bgs1 {event:1}");
    assert.deepEqual(keys(env), ["bgm_1"], "Core alone still plays");
    assert.ok(env.logs.warn.some((l) => /requires FugsAudio2Effects/.test(l)));
  });
});
