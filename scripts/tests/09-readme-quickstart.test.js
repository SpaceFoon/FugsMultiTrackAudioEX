"use strict";
/**
 * The README's "Quick start" promises, run VERBATIM on every backend and checked on the audio
 * graph: the plugin-command examples, the satellite examples and the Script API block.
 * (An example that only "runs without error" is not enough: the README's original
 * FugsAudio.play({...}) line silently played nothing.)
 */
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { forEachBackend, boot, play, keys, audibleSourcesOf, gainOf, pluginErrors } = require("./support");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || "value"}: expected ${b} +/- ${tol}, got ${a}`);

function setEvent(env, id, x, y) {
  env.run(`$dataMap.events[${id}] = { id: ${id} }; $gameMap._events[${id}] = { _realX: ${x}, _realY: ${y} };`);
}
function setPlayer(env, x, y) {
  env.run(`$gamePlayer.x = ${x}; $gamePlayer.y = ${y}; $gamePlayer._realX = ${x}; $gamePlayer._realY = ${y};`);
}

forEachBackend("README quick start: plugin commands", (b) => {
  it("play-bgm1 ThemeA 90 2 fades in to 90%, fade-bgm1 0 2 fades it out", async () => {
    const env = await boot(b);
    await env.runCommand("play-bgm1 ThemeA 90 2");
    await env.advance(400);
    const early = gainOf(env, "bgm_1");
    assert.ok(early > 0 && early < 0.45, "still fading in after 0.4 s, got " + early);
    await env.advance(2200);
    near(gainOf(env, "bgm_1"), 0.9, 0.01, "faded in");
    await env.runCommand("fade-bgm1 0 2");
    await env.advance(2300);
    near(gainOf(env, "bgm_1"), 0, 0.01, "faded out");
    assert.deepEqual(pluginErrors(env), []);
  });

  it("crossfade-bgm1 BattleTheme 3 hands the music over; stop-bgm1 1 ends it", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 ThemeA 90");
    await env.runCommand("crossfade-bgm1 BattleTheme 3");
    await env.advance(3600);
    const files = keys(env).map((k) => env.track(k)._name);
    assert.ok(files.includes("BattleTheme"), "the new song is playing: " + files);
    assert.ok(!files.includes("ThemeA"), "the old song is gone: " + files);
    const next = keys(env).find((k) => env.track(k)._name === "BattleTheme");
    near(gainOf(env, next), 0.9, 0.02, "new song at full volume");

    await env.runCommand("stop-bgm1 1");
    await env.runCommand("stop-bgm2 1");
    await env.advance(1300);
    assert.deepEqual(keys(env), [], "everything stopped");
    assert.deepEqual(pluginErrors(env), []);
  });
});

forEachBackend("README quick start: with satellites enabled", (b) => {
  it("effect / proximity / duckall / registeralias / alias:Name examples all take effect", async () => {
    const env = await boot(b);
    setEvent(env, 5, 10, 5);
    setPlayer(env, 5, 5);
    await play(env, "play-bgm1 ThemeA 90");
    await env.runCommand("play-bgs1 Waterfall 100");
    await env.settle();

    await env.runCommand("effect-bgm1 preset:cave");
    await env.settle();
    assert.ok(env.A.effectChains.has("bgm_1"), "cave preset chain is installed on bgm1");
    assert.ok(audibleSourcesOf(env, "bgm_1").length >= 1, "bgm1 is still audible through the chain");

    await env.runCommand("proximity-bgs1 {event:5, maxDistance:10}");
    await env.advance(150);
    near(gainOf(env, "bgs_1"), 0.5, 0.03, "half way to the event");

    await env.runCommand("duckall 0.3 0.5 2");
    await env.advance(700);
    near(gainOf(env, "bgm_1"), 0.3, 0.02, "bgm ducked to level 0.3");

    await env.runCommand("registeralias Footstep {pool:[Step1,Step2], volumeJitter:5}");
    assert.equal(env.A.sfxAliases.has("Footstep"), true);
    await env.runCommand("play-se1 alias:Footstep");
    await env.advance(120);
    assert.ok(["Step1", "Step2"].includes(env.track("se_1")._name), "alias picked one of its pool files");
    assert.ok(audibleSourcesOf(env, "se_1").length >= 1, "the alias sound is audible");
    assert.deepEqual(pluginErrors(env), []);
  });
});

forEachBackend("README quick start: Script API", (b) => {
  it("FugsAudio.play({...}), FugsAudio.fade(...), FugsAudio.stop(...) exactly as written", async () => {
    const env = await boot(b);
    env.run(`FugsAudio.play({ type: "bgm", trackId: 1, name: "ThemeA", volume: 90, fadein: 2 });`);
    await env.advance(400);
    assert.deepEqual(keys(env), ["bgm_1"]);
    assert.equal(env.track("bgm_1")._name, "ThemeA");
    assert.ok(gainOf(env, "bgm_1") < 0.45, "fading in");
    await env.advance(2200);
    near(gainOf(env, "bgm_1"), 0.9, 0.01, "faded in to 90");

    env.run(`FugsAudio.fade("bgm", 1, { volume: 0, duration: 2 });`);
    await env.advance(2300);
    near(gainOf(env, "bgm_1"), 0, 0.01, "faded to 0");

    env.run(`FugsAudio.stop("bgm", 1, 1);`);
    await env.advance(1300);
    assert.deepEqual(keys(env), []);
    assert.deepEqual(pluginErrors(env), []);
  });

  it("the positional form documented in the Docs plugin works too", async () => {
    const env = await boot(b);
    env.run(`FugsAudio.play("bgs", 2, "Rain", { volume: 60, pan: -50 });`);
    await env.advance(300);
    assert.deepEqual(keys(env), ["bgs_2"]);
    near(gainOf(env, "bgs_2"), 0.6, 0.01);
    env.run(`FugsAudio.runCommandText("play-bgm1 ThemeA 90 2\\n// a comment\\nstop-bgs2");`);
    await env.advance(400);
    assert.deepEqual(keys(env), ["bgm_1"], "runCommandText ran both lines, skipping the comment");
  });

  it("FugsAudio.play with no name warns instead of playing 'undefined'", async () => {
    const env = await boot(b);
    env.run(`FugsAudio.play({ type: "bgm", trackId: 1, volume: 90 });`);
    await env.advance(300);
    assert.deepEqual(keys(env), []);
    assert.ok(!env.requests.some((u) => /undefined/.test(u)), "no request for a file called undefined");
  });
});

forEachBackend("multi-line command text (MZ 'Run Commands', FugsAudio.runCommandText)", (b) => {
  it("a {config} that the Docs wrap over two lines is still one command; the next command is not swallowed", async () => {
    const env = await boot(b);
    const text = [
      "registeralias FootstepGrass {pool:[step1,step2,step3], volumeJitter:5,",
      "  pitchJitter:8}",
      "",
      "// a comment between commands",
      "play-bgm1 ThemeA 80",
    ].join("\n");
    env.run(`FugsAudio.runCommandText(${JSON.stringify(text)});`);
    await env.advance(300);
    assert.equal(env.A.sfxAliases.has("FootstepGrass"), true, "alias registered from the wrapped config");
    assert.equal(env.A.sfxAliases.get("FootstepGrass").pitchJitter, 8, "the continuation line was part of the config");
    assert.deepEqual(keys(env), ["bgm_1"], "the command after it ran");
    assert.deepEqual(pluginErrors(env), []);
  });

  it("an unclosed { never swallows the commands that follow it", async () => {
    const env = await boot(b);
    env.run(`FugsAudio.runCommandText(${JSON.stringify("proximity-bgs1 {event:5\nplay-bgm1 ThemeA 80")});`);
    await env.advance(300);
    assert.deepEqual(keys(env), ["bgm_1"], "play-bgm1 still ran");
  });

  it("MZ native 'Run Commands (one per line)' takes the same text", async () => {
    if (b.cfg.engine !== "mz") return;
    const env = await boot(b);
    await env.runCommand("play-bgm1 ThemeA 90\nplay-bgs1 Rain 60\n# a comment", { via: "native", multi: true });
    await env.advance(300);
    assert.deepEqual(keys(env), ["bgm_1", "bgs_1"]);
  });
});
