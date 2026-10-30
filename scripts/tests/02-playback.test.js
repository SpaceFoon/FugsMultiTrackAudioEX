"use strict";
/**
 * Core playback promised by the Docs: play / stop / fade / crossfade / pause /
 * resume / syncplay / global commands / chains, measured on the fake audio graph.
 */
const { it } = require("node:test");
const assert = require("node:assert/strict");
const {
  forEachBackend, boot, play, keys, sourcesOf, audibleSourcesOf, gainOf, panOf, rateOf, truePos, startedCount,
  pluginErrors,
} = require("./support");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || "value"}: expected ${b} +/- ${tol}, got ${a}`);

forEachBackend("playback basics", (b) => {
  it("defaults: volume 90, pan 0, pitch 100, BGM loops from the start", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme");
    const [src] = audibleSourcesOf(env, "bgm_1");
    assert.ok(src, "audible source");
    assert.equal(src.loop, true);
    assert.equal(src._startOffset, 0);
    near(gainOf(env, "bgm_1"), 0.9, 1e-6, "gain");
    near(panOf(env, "bgm_1"), 0, 1e-6, "pan");
    near(rateOf(env, "bgm_1"), 1, 1e-6, "playbackRate");
  });

  it("volume / fadein / pan / pitch arguments: play-bgm1 Theme 50 0 -30 120", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 50 0 -30 120");
    near(gainOf(env, "bgm_1"), 0.5, 1e-6, "gain");
    near(panOf(env, "bgm_1"), -0.3, 1e-6, "pan");
    near(rateOf(env, "bgm_1"), 1.2, 1e-6, "playbackRate");
  });

  it("fade-in: play-bgs1 Rain 60 2 ramps from silence to 60% over 2 seconds", async () => {
    const env = await boot(b);
    await env.runCommand("play-bgs1 Rain 60 2");
    await env.advance(60); // loaded, fade just started
    assert.ok(gainOf(env, "bgs_1") < 0.1, "starts (nearly) silent, got " + gainOf(env, "bgs_1"));
    await env.advance(1000);
    const mid = gainOf(env, "bgs_1");
    assert.ok(mid > 0.15 && mid < 0.45, "about half way after ~1s, got " + mid);
    await env.advance(1500);
    near(gainOf(env, "bgs_1"), 0.6, 0.01, "final gain");
  });

  it("SE and ME do not loop and remove themselves when they finish", async () => {
    const env = await boot(b);
    await play(env, "play-se1 Hit");
    await env.runCommand("play-me1 Fanfare");
    await env.settle();
    assert.equal(audibleSourcesOf(env, "se_1")[0].loop, false, "SE does not loop");
    assert.equal(audibleSourcesOf(env, "me_1")[0].loop, false, "ME does not loop");
    await env.advance(1500); // Hit is 1 s
    assert.deepEqual(keys(env), ["me_1"], "SE cleaned up, ME still playing");
    await env.advance(6000); // Fanfare is 6 s
    assert.deepEqual(keys(env), []);
    assert.equal(env.audio.audibleSources().length, 0);
  });

  it("(loop:never) makes a BGM one-shot and it cleans itself up", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90 (loop:never)");
    assert.equal(audibleSourcesOf(env, "bgm_1")[0].loop, false);
    await env.advance(31000);
    assert.deepEqual(keys(env), []);
  });

  it("(loop:2) plays once plus two repeats, then stops", async () => {
    const env = await boot(b);
    await play(env, "play-se1 Hit 90 (loop:2)");
    await env.advance(4500);
    assert.equal(startedCount(env), 3, "started 3 times (1 + 2 repeats)");
    assert.deepEqual(keys(env), [], "cleaned up afterwards");
  });

  it("(start:12.5) begins playback at 12.5 seconds", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90 (start:12.5)");
    const [src] = audibleSourcesOf(env, "bgm_1");
    near(src._startOffset, 12.5, 1e-6, "start offset");
    near(env.track("bgm_1").seek(), 12.5 + 0.3, 0.2, "seek()");
  });

  it("playing a track id that is already in use replaces the old track", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    const first = sourcesOf(env, "bgm_1")[0];
    await play(env, "play-bgm1 ThemeA 70");
    assert.equal(first.isAudible(), false, "old source stopped");
    assert.equal(audibleSourcesOf(env, "bgm_1").length, 1);
    near(gainOf(env, "bgm_1"), 0.7, 1e-6, "new volume");
  });

  it("stop-bgm1 2 fades out over 2s, then stops and releases the track", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 80");
    await env.runCommand("stop-bgm1 2");
    await env.advance(1000);
    assert.ok(gainOf(env, "bgm_1") < 0.75 && gainOf(env, "bgm_1") > 0.05, "fading, got " + gainOf(env, "bgm_1"));
    assert.equal(audibleSourcesOf(env, "bgm_1").length, 1, "still playing mid-fade");
    await env.advance(1300);
    assert.deepEqual(keys(env), []);
    assert.equal(env.audio.audibleSources().length, 0);
  });

  it("stop-bgm1 (no fade) is immediate", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 80");
    await env.runCommand("stop-bgm1");
    assert.deepEqual(keys(env), []);
    assert.equal(env.audio.audibleSources().length, 0);
  });

  it("a missing audio file does not leave a zombie track or a busy timer loop", async () => {
    const env = await boot(b);
    await env.runCommand("play-se1 DoesNotExist");
    await env.advance(15000);
    assert.deepEqual(keys(env), [], "failed loads are dropped");
    assert.ok(
      env.logs.error.some((l) => /DoesNotExist/.test(l)),
      "the failure is reported (console.error) so typos are discoverable; got: " + JSON.stringify(env.logs.error)
    );
    assert.equal(env.clock.pendingTimers() < 5, true, "no runaway polling timers: " + env.clock.pendingTimers());
  });

  it("play-bgm1 with no file name is rejected instead of requesting 'undefined'", async () => {
    const env = await boot(b);
    await env.runCommand("play-bgm1");
    await env.settle();
    assert.deepEqual(keys(env), []);
    assert.ok(!env.requests.some((u) => /undefined/.test(u)), "requests: " + JSON.stringify(env.requests));
  });
});

forEachBackend("fades and pitch", (b) => {
  it("fade-bgm1 20 2 50 fades volume to 20% and pan to +50", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("fade-bgm1 20 2 50");
    await env.advance(2300);
    near(gainOf(env, "bgm_1"), 0.2, 0.01, "gain");
    near(panOf(env, "bgm_1"), 0.5, 0.01, "pan");
  });

  it("every documented curve name (positional and (curve:name) tag forms) reaches the exact target", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    for (const curve of ["linear", "exponential", "logarithmic", "smooth", "sharp", "gentle", "ease-in", "ease-out", "ease-in-out"]) {
      await env.runCommand(`fade-bgm1 40 0.3 (curve:${curve})`);
      await env.advance(450);
      near(gainOf(env, "bgm_1"), 0.4, 0.01, `tag form, curve ${curve}`);
      await env.runCommand(`fade-bgm1 70 0.3 0 100 ${curve}`); // volume duration pan pitch curve
      await env.advance(450);
      near(gainOf(env, "bgm_1"), 0.7, 0.01, `positional form, curve ${curve}`);
    }
  });

  it("pitch fade changes the playback rate smoothly WITHOUT restarting the song", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.advance(2000);
    const before = startedCount(env);
    const posBefore = truePos(env, "bgm_1");
    await env.runCommand("fade-bgm1 90 3 0 150"); // volume, duration, pan, pitch
    await env.advance(3500);
    assert.equal(startedCount(env), before, "no new playback was started (song did not restart)");
    near(rateOf(env, "bgm_1"), 1.5, 0.01, "playbackRate");
    assert.ok(truePos(env, "bgm_1") > posBefore + 3.5, "position kept advancing, was " + truePos(env, "bgm_1"));
    assert.deepEqual(pluginErrors(env), []);
  });

  it("seek() stays accurate after pitch changes (pause/resume/save use it)", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.advance(2000);
    await env.runCommand("pitch-bgm1 200"); // instant
    await env.advance(4000);
    const real = truePos(env, "bgm_1");
    near(env.track("bgm_1").seek(), real, 0.25, "engine seek() vs real audio position");
  });

  it("pitch-bgm1 / pan-bgm1 shorthand commands", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("pitch-bgm1 75");
    await env.runCommand("pan-bgm1 -50");
    await env.advance(300);
    near(rateOf(env, "bgm_1"), 0.75, 0.01, "rate");
    near(panOf(env, "bgm_1"), -0.5, 0.01, "pan");
  });

  it("a non-looping sound played at low pitch is not cut off by a stale end timer", async () => {
    const env = await boot(b);
    await play(env, "play-me1 Fanfare 90"); // 6 s at pitch 1
    await env.advance(1000);
    await env.runCommand("pitch-me1 50"); // now needs ~2x longer
    await env.advance(7000); // > 6 s total, but audio is only ~1 + 7*0.5 = 4.5 s in
    assert.equal(audibleSourcesOf(env, "me_1").length, 1, "still audible; engine end-timer should follow the new pitch");
  });
});

forEachBackend("crossfade", (b) => {
  it("crossfade-bgm1 BattleTheme 3 moves the music to bgm2 and fades bgm1 out", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("crossfade-bgm1 BattleTheme 3");
    await env.advance(1500);
    const g1 = gainOf(env, "bgm_1");
    const g2 = gainOf(env, "bgm_2");
    assert.ok(g1 > 0.2 && g1 < 0.7, "old track mid-fade, got " + g1);
    assert.ok(g2 > 0.2 && g2 < 0.7, "new track mid-fade, got " + g2);
    await env.advance(2200);
    assert.deepEqual(keys(env), ["bgm_2"]);
    near(gainOf(env, "bgm_2"), 0.9, 0.01, "final volume");
  });

  it("crossfade-bgm1 bgm3 Scene2 2 linear 70 uses the explicit destination, curve and volume", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("crossfade-bgm1 bgm3 Scene2 2 linear 70");
    await env.advance(2600);
    assert.deepEqual(keys(env), ["bgm_3"]);
    near(gainOf(env, "bgm_3"), 0.7, 0.01, "volume");
    assert.ok(env.requests.includes("audio/bgm/Scene2.ogg"));
  });
});

forEachBackend("pause and resume", (b) => {
  it("pause keeps the position; resume continues from it (paused time is not counted)", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.advance(5000);
    await env.runCommand("pause-bgm1");
    assert.equal(env.audio.audibleSources().length, 0, "silent while paused");
    await env.advance(3000);
    await env.runCommand("resume-bgm1");
    await env.settle();
    const pos = truePos(env, "bgm_1");
    near(pos, 5.3 + 0.3, 0.6, "resumed near where it was paused (5.3s)");
    near(gainOf(env, "bgm_1"), 0.9, 0.01, "volume restored");
  });

  it("pause position is right even after a pitch change", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.advance(2000);
    await env.runCommand("pitch-bgm1 200");
    await env.advance(4000); // audio is now ~2.3 + 8 = ~10.3 s in
    const real = truePos(env, "bgm_1");
    await env.runCommand("pause-bgm1");
    await env.advance(1000);
    await env.runCommand("resume-bgm1");
    await env.settle();
    near(truePos(env, "bgm_1"), real + 0.3 * 2, 0.8, "resume position");
  });

  it("pause with fadeout fades then stops, and resume can interrupt it", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("pause-bgm1 2");
    await env.advance(1000);
    assert.equal(audibleSourcesOf(env, "bgm_1").length, 1, "still playing during the fade");
    await env.advance(1300);
    assert.equal(env.audio.audibleSources().length, 0, "stopped after the fade");
    await env.runCommand("resume-bgm1");
    await env.settle();
    assert.equal(audibleSourcesOf(env, "bgm_1").length, 1);
  });

  it("pauseall / resumeall affect every track", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme");
    await env.runCommand("play-bgs1 Rain");
    await env.settle();
    await env.runCommand("pauseall");
    assert.equal(env.audio.audibleSources().length, 0);
    await env.runCommand("resumeall");
    await env.settle();
    assert.equal(env.audio.audibleSources().length, 2);
  });
});

forEachBackend("stems and global commands", (b) => {
  it("syncplay-bgm S1 S2 S3 90 60 0 starts three stems together at the given volumes", async () => {
    const env = await boot(b);
    await play(env, "syncplay-bgm S1 S2 S3 90 60 0");
    assert.deepEqual(keys(env), ["bgm_1", "bgm_2", "bgm_3"]);
    assert.equal(env.audio.audibleSources().length, 3);
    near(gainOf(env, "bgm_1"), 0.9, 1e-6);
    near(gainOf(env, "bgm_2"), 0.6, 1e-6);
    near(gainOf(env, "bgm_3"), 0.0, 1e-6);
    const starts = [1, 2, 3].map((i) => audibleSourcesOf(env, "bgm_" + i)[0]._startWhen);
    near(Math.max(...starts) - Math.min(...starts), 0, 0.02, "stems start at the same audio-clock time");
  });

  it("syncplay defaults: first stem 90, the rest silent but playing", async () => {
    const env = await boot(b);
    await play(env, "syncplay-bgm Drums Bass Pads Lead");
    assert.deepEqual(keys(env), ["bgm_1", "bgm_2", "bgm_3", "bgm_4"]);
    near(gainOf(env, "bgm_1"), 0.9, 1e-6);
    for (const k of ["bgm_2", "bgm_3", "bgm_4"]) near(gainOf(env, k), 0, 1e-6, k);
    assert.equal(env.audio.audibleSources().length, 4, "silent stems are still playing (that is how they stay in sync)");
  });

  it("stems can be faded in afterwards: fade-bgm3 70 2", async () => {
    const env = await boot(b);
    await play(env, "syncplay-bgm Drums Bass Pads Lead");
    await env.runCommand("fade-bgm3 70 2");
    await env.advance(2300);
    near(gainOf(env, "bgm_3"), 0.7, 0.01);
  });

  it("stopall 1 fades and stops everything; stopall-bgs 1 only stops BGS", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme");
    await env.runCommand("play-bgs1 Rain");
    await env.runCommand("play-se1 Hit (loop:forever)");
    await env.settle();
    await env.runCommand("stopall-bgs 1");
    await env.advance(1300);
    assert.deepEqual(keys(env), ["bgm_1", "se_1"]);
    await env.runCommand("stopall 1");
    await env.advance(1300);
    assert.deepEqual(keys(env), []);
  });

  it("fadeall 50 3 and fadeall-bgm 30 2", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("play-bgs1 Rain 90");
    await env.settle();
    await env.runCommand("fadeall-bgm 30 2");
    await env.advance(2300);
    near(gainOf(env, "bgm_1"), 0.3, 0.01, "bgm");
    near(gainOf(env, "bgs_1"), 0.9, 0.01, "bgs untouched");
    await env.runCommand("fadeall 50 3");
    await env.advance(3300);
    near(gainOf(env, "bgm_1"), 0.5, 0.01, "bgm");
    near(gainOf(env, "bgs_1"), 0.5, 0.01, "bgs");
  });

  it("pitchbendall-bgm 80 2 bends every BGM without restarting anything", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme");
    await env.runCommand("play-bgm2 Bass");
    await env.runCommand("play-bgs1 Rain");
    await env.settle();
    const before = startedCount(env);
    await env.runCommand("pitchbendall-bgm 80 2");
    await env.advance(2500);
    assert.equal(startedCount(env), before, "nothing restarted");
    near(rateOf(env, "bgm_1"), 0.8, 0.01);
    near(rateOf(env, "bgm_2"), 0.8, 0.01);
    near(rateOf(env, "bgs_1"), 1, 0.01, "BGS unaffected");
  });

  it("chain-bgm1 runs timed command sequences", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("chain-bgm1 fade 50 2; wait 3; fade 90 2; wait 5; stop 2");
    await env.advance(2400);
    near(gainOf(env, "bgm_1"), 0.5, 0.02, "after first fade");
    await env.advance(3000); // t = 5.4
    near(gainOf(env, "bgm_1"), 0.9, 0.02, "after second fade");
    await env.advance(5200); // t = 10.6
    assert.deepEqual(keys(env), [], "stopped by the last chain step");
  });

  it("pauseall-bgm / resumeall-bgm only touch BGM (Docs: pauseall-[Type] / resumeall-[Type])", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme");
    await env.runCommand("play-bgs1 Rain");
    await env.settle();
    await env.runCommand("pauseall-bgm");
    assert.equal(audibleSourcesOf(env, "bgm_1").length, 0, "BGM paused");
    assert.equal(audibleSourcesOf(env, "bgs_1").length, 1, "BGS keeps playing");
    await env.runCommand("resumeall-bgm");
    await env.settle();
    assert.equal(audibleSourcesOf(env, "bgm_1").length, 1);
  });
});
