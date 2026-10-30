"use strict";
/**
 * Boot + "Event -> Plugin Command" entry points.
 * The README/Docs promise: "All commands go in Event -> Plugin Command", with the
 * same grammar in MV and MZ, plus the FugsAudio script-call API.
 */
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createEnv } = require("../harness/env");
const { forEachBackend, boot, play, keys, audibleSourcesOf, pluginErrors, gainOf } = require("./support");

// Every function the Docs plugin lists under "SCRIPT CALLS".
const DOCUMENTED_API = [
  "play", "stop", "fade", "crossfade",
  "duck", "duckAll", "startPump", "stopPump",
  "setProximity", "clearProximity",
  "setEffect", "fadeInEffect", "fadeOutEffectOnTrack", "crossfadeEffects", "removeEffect",
  "sweepPan", "stopSweepPan",
  "sync",
  "pause", "resume", "pauseAll", "resumeAll", "stopAll",
  "save", "load",
  "chain", "list",
  "registerAlias", "playAlias", "unregisterAlias", "listAliases",
  "testCommand",
];

forEachBackend("boot", (b) => {
  it("loads Core + every satellite without throwing and without console errors", async () => {
    const env = await createEnv(b.cfg);
    env.addDefaultAudio();
    env.loadPack(); // Plugin Manager order; the engine creates the audio context AFTER this
    assert.ok(env.A, "window.FugsAudio is exported");
    assert.equal(env.A, env.run("window.FugsMultiTrackAudioEX"), "back-compat alias");
    assert.deepEqual(env.logs.error, [], "console.error during plugin load:\n" + env.logs.error.join("\n"));
  });

  it("exposes every documented script-call function once the pack is loaded", async () => {
    const env = await boot(b);
    const missing = DOCUMENTED_API.filter((name) => typeof env.A[name] !== "function");
    assert.deepEqual(missing, []);
  });

  it("Effects picks up the WebAudio context that the engine creates after plugin load", async () => {
    const env = await boot(b);
    await env.runCommand("play-bgm1 Theme 90");
    await env.settle();
    assert.equal(env.run("!!AudioEffects.context || !!WebAudio._context"), true);
    assert.deepEqual(pluginErrors(env), []);
  });
});

forEachBackend("plugin command entry", (b) => {
  it("play-bgm1 starts a looping BGM by requesting the right audio file", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    assert.ok(
      env.requests.includes("audio/bgm/Theme.ogg"),
      "expected a request for audio/bgm/Theme.ogg, got: " + JSON.stringify(env.requests)
    );
    assert.deepEqual(keys(env), ["bgm_1"]);
    const srcs = audibleSourcesOf(env, "bgm_1");
    assert.equal(srcs.length, 1, "exactly one audible source");
    assert.equal(srcs[0].loop, true, "BGM loops by default");
    assert.ok(Math.abs(gainOf(env, "bgm_1") - 0.9) < 1e-6, "volume 90 -> gain 0.9, got " + gainOf(env, "bgm_1"));
  });

  it("every audio type maps to its own folder (bgm/bgs/me/se)", async () => {
    const env = await boot(b);
    await env.runCommand("play-bgm1 Theme");
    await env.runCommand("play-bgs1 Rain");
    await env.runCommand("play-me1 Fanfare");
    await env.runCommand("play-se1 Hit");
    await env.settle();
    for (const url of ["audio/bgm/Theme.ogg", "audio/bgs/Rain.ogg", "audio/me/Fanfare.ogg", "audio/se/Hit.ogg"]) {
      assert.ok(env.requests.includes(url), `missing request ${url}; got ${JSON.stringify(env.requests)}`);
    }
  });

  it('quoted file names with spaces work: play-bgm1 "Battle Theme" 80', async () => {
    const env = await boot(b);
    await play(env, 'play-bgm1 "Battle Theme" 80');
    assert.ok(
      env.requests.includes("audio/bgm/Battle%20Theme.ogg") || env.requests.includes("audio/bgm/Battle Theme.ogg"),
      "expected the full quoted name to be requested, got " + JSON.stringify(env.requests)
    );
    assert.equal(env.track("bgm_1")._name, "Battle Theme");
  });

  it("unknown commands warn but never throw", async () => {
    const env = await boot(b);
    await env.runCommand("frobnicate-bgm1 Theme");
    await env.runCommand("play-nope1 Theme");
    await env.runCommand("play-bgm1"); // no file name
    assert.deepEqual(keys(env), []);
  });

  it("track ids beyond 1 are independent tracks (unlimited tracks)", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Drums 90");
    await env.runCommand("play-bgm2 Bass 70");
    await env.runCommand("play-bgm3 Pads 50");
    await env.runCommand("play-bgs1 Rain 60");
    await env.runCommand("play-bgs2 Wind 40");
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1", "bgm_2", "bgm_3", "bgs_1", "bgs_2"]);
    assert.equal(env.audio.audibleSources().length, 5, "five simultaneous tracks are audible");
  });
});

// ---------------------------------------------------------------- MZ specifics
forEachBackend("MZ plugin-command registration", (b) => {
  if (b.cfg.engine !== "mz") return;

  it("registers a native MZ plugin command under the core file name", async () => {
    const env = await boot(b);
    const registered = env.run("Object.keys(PluginManager._commands)");
    assert.ok(
      registered.some((k) => k.startsWith("FugsMultiTrackAudioEX:")),
      "no PluginManager.registerCommand() for FugsMultiTrackAudioEX; got " + JSON.stringify(registered)
    );
  });

  it("native command 'run' executes the same grammar as the classic plugin command", async () => {
    const env = await boot(b);
    await env.runCommand("play-bgm1 Theme 90", { via: "native" });
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1"]);
    assert.ok(env.requests.includes("audio/bgm/Theme.ogg"));
  });

  it("native command keeps quoted names intact", async () => {
    const env = await boot(b);
    await env.runCommand('play-bgm1 "Battle Theme" 80', { via: "native" });
    await env.settle();
    assert.equal(env.track("bgm_1")._name, "Battle Theme");
  });

  it("legacy 'Plugin Command (MV)' events (imported MV projects) still work in MZ", async () => {
    const env = await boot(b);
    await env.runCommand("play-bgm1 Theme 90", { via: "legacy" });
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1"]);
    assert.ok(env.requests.includes("audio/bgm/Theme.ogg"), "requested " + JSON.stringify(env.requests));
    assert.equal(audibleSourcesOf(env, "bgm_1").length, 1, "and it is actually audible");
  });

  it("legacy MV-style events keep quoted names intact in MZ (MZ has no this._params)", async () => {
    const env = await boot(b);
    await env.runCommand('play-bgm1 "Battle Theme" 80', { via: "legacy" });
    await env.settle();
    assert.equal(env.track("bgm_1")._name, "Battle Theme", "name was split at the space");
  });

  it("still works when the user renames the core plugin file", async () => {
    const env = await createEnv(b.cfg);
    env.addDefaultAudio();
    env.loadPlugin("FugsMultiTrackAudioEX.js", "MyRenamedAudioCore");
    env.bootAudio();
    env.enterMap();
    await env.runCommand("play-bgm1 Theme 90", { via: "native", pluginName: "MyRenamedAudioCore" });
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1"], "command registered under the renamed file's name");
  });

  it("switch:N gated commands work through the native command", async () => {
    const env = await boot(b);
    await env.runCommand("play-bgm1 DangerTheme 80 switch:15", { via: "native" });
    await env.settle();
    assert.deepEqual(keys(env), [], "gated: nothing plays until the switch is ON");
    env.run("$gameSwitches.setValue(15, true)");
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1"]);
    env.run("$gameSwitches.setValue(15, false)");
    await env.settle();
    assert.deepEqual(keys(env), []);
  });
});

forEachBackend("plugin parameters", (b) => {
  const PARAMS = { "Default Persistence Mode": "always", "Default Pause Mode": "never", "Scene Fadeout Time": "1.5" };

  it("are read under the file name the Core was loaded as (renamed Core, or the bundle's own name)", async () => {
    const env = await createEnv(b.cfg);
    env.addDefaultAudio();
    env.loadPlugin("FugsMultiTrackAudioEX.js", "MyRenamedAudioCore", PARAMS);
    env.bootAudio();
    const cfg = env.A.config;
    assert.equal(cfg.defaultPersistenceMode, "always");
    assert.equal(cfg.defaultPauseMode, "never");
    assert.equal(cfg.sceneFadeoutTime, 1.5);
  });

  it("are still read under the default file name", async () => {
    const env = await createEnv(b.cfg);
    env.addDefaultAudio();
    env.loadPlugin("FugsMultiTrackAudioEX.js", "FugsMultiTrackAudioEX", PARAMS);
    env.bootAudio();
    assert.equal(env.A.config.defaultPersistenceMode, "always");
    assert.equal(env.A.config.sceneFadeoutTime, 1.5);
  });

  it("and FugsAudio1Core (the documented alternative name) is honoured too", async () => {
    const env = await createEnv(b.cfg);
    env.addDefaultAudio();
    env.loadPlugin("FugsMultiTrackAudioEX.js", "FugsAudio1Core", PARAMS);
    env.bootAudio();
    assert.equal(env.A.config.defaultPauseMode, "never");
  });

  it("fall back to the defaults when nothing is configured", async () => {
    const env = await boot(b);
    const cfg = env.A.config;
    assert.equal(cfg.defaultPersistenceMode, "scene");
    assert.equal(cfg.defaultPauseMode, "battle");
    assert.equal(cfg.sceneFadeoutTime, 0.5);
  });
});

forEachBackend("MV plugin command specifics", (b) => {
  if (b.cfg.engine !== "mv") return;

  it("an MV project carrying a PluginManager.registerCommand shim is still driven as MV", async () => {
    const env = await createEnv(b.cfg);
    env.addDefaultAudio();
    // Some MV projects load a shim that adds MZ's registerCommand so MZ-style plugins can run.
    env.run("window.__shimCalls = 0; PluginManager.registerCommand = function () { window.__shimCalls++; };");
    env.loadPack();
    env.bootAudio();
    env.enterMap();
    await env.advance(5000);
    assert.equal(env.A.engine.name, "MV");
    await env.runCommand("play-bgm1 Theme 90");
    await env.settle();
    assert.ok(
      env.requests.includes("audio/bgm/Theme.ogg"),
      "MV folder form ('bgm', no trailing slash) expected; got " + JSON.stringify(env.requests)
    );
    assert.deepEqual(keys(env), ["bgm_1"]);
    assert.equal(env.run("window.__shimCalls"), 0, "no MZ command registration is attempted on MV");
    assert.deepEqual(pluginErrors(env), []);
  });

  it("does not require (or choke on) MZ-only APIs", async () => {
    const env = await boot(b);
    assert.equal(env.run("typeof PluginManager.registerCommand"), "undefined", "MV has no registerCommand");
    await env.runCommand("play-bgm1 Theme 90");
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1"]);
    assert.deepEqual(pluginErrors(env), []);
  });
});
