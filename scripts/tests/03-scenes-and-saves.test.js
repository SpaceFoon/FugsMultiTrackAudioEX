"use strict";
/**
 * Scene policy (persistence x pause mode, from the Docs behaviour table) and
 * game save/load integration, driven through the same engine hooks a real
 * game triggers (Scene terminate/start, DataManager.saveGame/loadGame).
 */
const { it } = require("node:test");
const assert = require("node:assert/strict");
const {
  forEachBackend, boot, play, keys, audibleSourcesOf, gainOf, panOf, rateOf, truePos, pluginErrors,
} = require("./support");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || "value"}: expected ${b} +/- ${tol}, got ${a}`);

// From FugsAudio0Docs "Behavior table":  persistence | pauseMode | Menu | Battle
// The 5th column is what must be true AFTER returning from battle. "?" = the Docs do not
// say (e.g. persistence "battle"/"none" tracks are subject to the map-return scene transition),
// so it is deliberately not asserted.
const TABLE = [
  ["none", "never", "Continues", "Stops", "Stops"],
  ["none", "menu", "Pauses", "Stops", "Stops"],
  ["none", "battle", "Continues", "Pauses", "?"],
  ["scene", "never", "Continues", "Stops", "Stops"],
  ["scene", "battle", "Continues", "Pauses", "Continues"],
  ["battle", "never", "Continues", "Continues", "?"],
  ["battle", "battle", "Continues", "Pauses", "?"],
  ["always", "never", "Continues", "Continues", "Continues"],
  ["always", "menu", "Pauses", "Continues", "Continues"],
  ["always", "battle", "Continues", "Pauses", "Continues"],
];

function observe(env, key) {
  const tracked = env.A.tracks.has(key);
  const audible = audibleSourcesOf(env, key).length > 0;
  return { tracked, audible, paused: env.A.pausedTracks.has(key) };
}
function assertState(env, key, expected, where) {
  const s = observe(env, key);
  if (expected === "Continues") {
    assert.ok(s.audible && s.tracked && !s.paused, `${where}: should continue, got ${JSON.stringify(s)}`);
  } else if (expected === "Pauses") {
    assert.ok(s.tracked && s.paused && !s.audible, `${where}: should be paused (silent, still tracked), got ${JSON.stringify(s)}`);
  } else if (expected === "Stops") {
    assert.ok(!s.tracked && !s.audible, `${where}: should be stopped and gone, got ${JSON.stringify(s)}`);
  }
}

forEachBackend("scene policy table", (b) => {
  for (const [persistence, pause, menu, battle, afterBattle] of TABLE) {
    it(`(p:${persistence}) (pause:${pause})  menu=${menu}  battle=${battle}`, async () => {
      const env = await boot(b);
      await play(env, `play-bgm1 Theme 90 (p:${persistence}) (pause:${pause})`);
      assertState(env, "bgm_1", "Continues", "before any transition");

      env.scene.mapToMenu();
      await env.advance(1000);
      assertState(env, "bgm_1", menu, "in the menu");
      env.scene.menuToMap();
      await env.advance(1000);
      if (menu !== "Stops") assertState(env, "bgm_1", "Continues", "back from the menu");

      env.scene.mapToBattle();
      await env.advance(1000);
      assertState(env, "bgm_1", battle, "in battle");
      env.scene.battleToMap();
      await env.advance(1000);
      if (afterBattle !== "?") assertState(env, "bgm_1", afterBattle, "after returning from battle");
    });
  }

  it("default persistence (scene) and pause mode (battle) apply when no tags are given", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    env.scene.mapToBattle();
    await env.advance(1000);
    assertState(env, "bgm_1", "Pauses", "default: pauses in battle");
    env.scene.battleToMap();
    await env.advance(1000);
    assertState(env, "bgm_1", "Continues", "default: resumes after battle");
  });

  it("map transfer: (p:none) stops, (p:always)/(p:scene) continue, (p:battle) stops", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90 (p:none)");
    await env.runCommand("play-bgm2 Bass 90 (p:always)");
    await env.runCommand("play-bgm3 Pads 90 (p:scene)");
    await env.runCommand("play-bgm4 Lead 90 (p:battle)");
    await env.settle();
    env.scene.mapToMap();
    await env.advance(1000);
    assert.deepEqual(keys(env), ["bgm_2", "bgm_3"]);
  });

  it("(pause:scene) pauses on a map change and comes back once the new map is running", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90 (pause:scene) (p:always)");
    env.scene.mapToMap();
    await env.advance(2000);
    assertState(env, "bgm_1", "Continues", "resumed after the scene change");
  });

  it("going back to the title screen stops every track", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90 (p:always)");
    await env.runCommand("play-bgs1 Rain 50 (p:always)");
    await env.settle();
    env.scene.toTitle();
    await env.advance(1500);
    assert.deepEqual(keys(env), []);
    assert.equal(env.audio.audibleSources().length, 0);
  });
});

forEachBackend("game save / load", (b) => {
  it("the save file carries the audio state and stays JSON-safe", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 70");
    await env.saveGame(1);
    const snap = env.run("JSON.stringify(window.FugsAudio.getSaveData())");
    const data = JSON.parse(snap);
    assert.ok(data.auto && data.auto.bgm_1, "auto snapshot with bgm_1 present: " + snap);
    assert.equal(data.auto.bgm_1.name, "Theme");
    near(data.auto.bgm_1.volume, 0.7, 1e-6);
    assert.equal(env.run("JSON.stringify(DataManager.makeSaveContents()).indexOf('fugsAudio') >= 0"), true);
  });

  it("loading a save restores the mix (volume/pan/pitch) and resumes near the saved position", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 70 0 20 110");
    await env.runCommand("play-bgs1 Rain 50");
    await env.settle();
    await env.advance(5000);
    await env.saveGame(1);
    const saved = env.run("window.FugsAudio.namedSnapshots.get('auto').get('bgm_1').currentTime");
    assert.ok(saved > 5, "saved a mid-song position, got " + saved);

    env.scene.toTitle(); // back to title: everything stops
    await env.advance(1500);
    assert.deepEqual(keys(env), []);

    const { ok } = await env.loadGame(1, 1500);
    assert.equal(ok, true, "load succeeded");
    assert.deepEqual(keys(env), ["bgm_1", "bgs_1"]);
    assert.equal(env.audio.audibleSources().length, 2, "both tracks are audible again");
    near(gainOf(env, "bgm_1"), 0.7, 0.01, "bgm volume");
    near(panOf(env, "bgm_1"), 0.2, 0.01, "bgm pan");
    near(rateOf(env, "bgm_1"), 1.1, 0.01, "bgm pitch");
    near(gainOf(env, "bgs_1"), 0.5, 0.01, "bgs volume");
    const pos = truePos(env, "bgm_1");
    assert.ok(pos >= saved - 0.2 && pos <= saved + 2.5, `resumed near ${saved.toFixed(2)}s, got ${pos.toFixed(2)}s`);
  });

  it("a track that was paused when saved comes back paused, with its position", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 80");
    await env.advance(4000);
    await env.runCommand("pause-bgm1");
    await env.saveGame(1);
    env.scene.toTitle();
    await env.advance(1500);
    await env.loadGame(1, 1500);
    assert.ok(env.A.pausedTracks.has("bgm_1"), "restored as paused");
    assert.equal(env.audio.audibleSources().length, 0, "silent");
    await env.runCommand("resume-bgm1");
    await env.settle();
    near(truePos(env, "bgm_1"), 4.3 + 0.3, 0.8, "resumes from where it was paused");
  });

  it("slow disk (MZ loads are asynchronous): audio is still restored from the loaded file", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 60 0 -20");
    await env.advance(3000);
    await env.saveGame(1);
    env.scene.toTitle();
    await env.advance(1500);
    if (b.cfg.engine === "mz") env.run("StorageManager.ioLatencyMs = 350"); // slower than the plugin's old 100 ms guess
    await env.loadGame(1, 2500);
    assert.deepEqual(keys(env), ["bgm_1"], "restored from the file that was actually loaded");
    near(gainOf(env, "bgm_1"), 0.6, 0.01, "volume");
    near(panOf(env, "bgm_1"), -0.2, 0.01, "pan");
  });

  it("loading a save WITHOUT audio state does not replay a stale 'auto' snapshot from another save", async () => {
    const env = await boot(b);
    await env.saveGame(2); // nothing playing -> empty snapshot
    await play(env, "play-bgm1 Theme 80");
    await env.saveGame(1); // this one has music
    env.scene.toTitle();
    await env.advance(1500);
    await env.loadGame(1, 1200);
    assert.deepEqual(keys(env), ["bgm_1"]);
    env.scene.toTitle();
    await env.advance(1500);
    await env.loadGame(2, 1200);
    assert.deepEqual(keys(env), [], "save #2 had no music, so none may start");
  });

  it("no console errors during save/load", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 80");
    await env.saveGame(1);
    env.scene.toTitle();
    await env.advance(1500);
    await env.loadGame(1, 1500);
    assert.deepEqual(pluginErrors(env), []);
  });

  it("saveall / loadall named snapshots restore tracks manually", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 80");
    await env.runCommand("play-bgs1 Rain 40");
    await env.settle();
    await env.advance(2000);
    await env.runCommand("saveall mine");
    await env.runCommand("stopall");
    assert.deepEqual(keys(env), []);
    await env.runCommand("loadall mine");
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1", "bgs_1"]);
    near(gainOf(env, "bgm_1"), 0.8, 0.01);
    near(gainOf(env, "bgs_1"), 0.4, 0.01);
    near(truePos(env, "bgm_1"), 2.3 + 0.3, 0.8, "restores near the saved position");
  });
});
