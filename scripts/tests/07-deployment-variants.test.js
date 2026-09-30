"use strict";
/**
 * Deployment shapes beyond "NW.js desktop, whole file decoded at once":
 *  - MZ served over http(s) (itch.io etc.): audio is FETCHED IN CHUNKS and MZ decodes the
 *    growing data repeatedly, re-creating the source nodes each time.
 *  - MV on Android Chrome: BGM would normally use the shared Html5Audio element.
 *  - encrypted/renamed player agents, mobile user agents.
 */
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createEnv } = require("../harness/env");
const {
  forEachBackend, boot, keys, audibleSourcesOf, gainOf, truePos, pluginErrors,
} = require("./support");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || "value"}: expected ${b} +/- ${tol}, got ${a}`);

// A 40 s music file downloaded in 8 chunks, 700 ms apart (~600 KB): MZ decodes it progressively.
const STREAMED = { duration: 40, padBytes: 600000, chunks: 8, chunkDelayMs: 700, latencyMs: 30 };
// A 6 s jingle streamed the same way.
const STREAMED_ME = { duration: 6, padBytes: 300000, chunks: 3, chunkDelayMs: 600, latencyMs: 30 };

forEachBackend("MZ over http: chunked download + progressive decode", (b) => {
  if (b.cfg.engine !== "mz") return;
  const web = () =>
    boot(b, {
      envOpts: { web: true },
      files: (env) => {
        env.addAudio("bgm", "Streamed", STREAMED);
        env.addAudio("me", "StreamedJingle", STREAMED_ME);
      },
    });

  it("really streams: the engine decodes partial data more than once", async () => {
    const env = await web();
    await env.runCommand("play-bgm1 Streamed 90");
    let decodes = 0;
    let last = 0;
    for (let i = 0; i < 90; i++) {
      await env.advance(100);
      const buf = env.track("bgm_1");
      if (buf && buf._totalTime !== last) {
        decodes++;
        last = buf._totalTime;
      }
    }
    assert.ok(decodes >= 2, "expected several progressive decodes, saw " + decodes + " (harness precondition)");
    assert.ok(env.track("bgm_1")._isLoaded, "fully loaded eventually");
  });

  it("plays while downloading and keeps ONE continuous song through the node refreshes", async () => {
    const env = await web();
    await env.runCommand("play-bgm1 Streamed 90");
    await env.advance(3000); // first partial data has been decoded and is playing
    const p1 = truePos(env, "bgm_1");
    assert.ok(p1 !== null && p1 > 0, "audible while still downloading");
    await env.advance(5000);
    const p2 = truePos(env, "bgm_1");
    assert.ok(p2 > p1 + 3, `position keeps advancing across decode refreshes (${p1} -> ${p2})`);
    assert.equal(audibleSourcesOf(env, "bgm_1").length >= 1, true);
    near(gainOf(env, "bgm_1"), 0.9, 1e-6, "volume kept");
  });

  it("a streamed one-shot is not cut off at the length of the FIRST partial decode", async () => {
    const env = await web();
    await env.runCommand("play-me1 StreamedJingle 90");
    await env.advance(3000); // partial decodes so far cover only part of the 6 s
    assert.equal(audibleSourcesOf(env, "me_1").length >= 1, true, "still playing after the first partial duration");
    await env.advance(6500);
    assert.deepEqual(keys(env), [], "finished and cleaned up once the whole jingle has played");
  });

  it("an effect stays routed through the chain when the engine re-creates source nodes", async () => {
    const env = await web();
    await env.runCommand("play-bgm1 Streamed 90");
    await env.advance(1500);
    await env.runCommand("effect-bgm1 preset:cave");
    for (let i = 0; i < 12; i++) {
      await env.advance(600); // several more progressive decodes happen in here
      const buf = env.track("bgm_1");
      const chain = env.A.effectChains.get("bgm_1");
      assert.ok(chain, "chain present");
      for (const s of audibleSourcesOf(env, "bgm_1")) {
        const ctx = env.audio;
        assert.ok(ctx.edgesFrom(s).some((e) => e.to === chain.input), "source feeds chain (step " + i + ")");
        assert.ok(!ctx.edgesFrom(s).some((e) => e.to === buf._gainNode), "no dry bypass (step " + i + ")");
      }
    }
    assert.deepEqual(pluginErrors(env), []);
  });

  it("a pitch fade while streaming keeps the rate on every re-created source node", async () => {
    const env = await web();
    await env.runCommand("play-bgm1 Streamed 90");
    await env.advance(1500);
    await env.runCommand("fade-bgm1 90 2 0 150");
    await env.advance(6000);
    near(env.track("bgm_1")._pitch, 1.5, 1e-6, "buffer pitch");
    for (const s of audibleSourcesOf(env, "bgm_1")) {
      near(s.playbackRate.valueAt(env.audio.currentTime), 1.5, 0.02, "source playbackRate");
    }
  });

  it("stop while still downloading releases everything (no zombie, no late sound)", async () => {
    const env = await web();
    await env.runCommand("play-bgm1 Streamed 90");
    await env.advance(1000);
    await env.runCommand("stop-bgm1");
    await env.advance(8000);
    assert.deepEqual(keys(env), []);
    assert.equal(env.audio.audibleSources().length, 0, "nothing starts playing after the stop");
  });

  it("pause/resume works on a streamed track", async () => {
    const env = await web();
    await env.runCommand("play-bgm1 Streamed 90");
    await env.advance(6000);
    const before = truePos(env, "bgm_1"); // playback only began after the first partial decode
    assert.ok(before > 2, "playing before the pause, got " + before);
    await env.runCommand("pause-bgm1");
    assert.equal(env.audio.audibleSources().length, 0);
    await env.advance(1000);
    const sourcesBefore = env.audio.nodesOfKind("BufferSource").length;
    await env.runCommand("resume-bgm1");
    await env.advance(4000); // the file is fetched again, so audio restarts after the first partial decode
    assert.equal(audibleSourcesOf(env, "bgm_1").length >= 1, true, "audible again");
    const first = env.audio.nodesOfKind("BufferSource")[sourcesBefore];
    assert.ok(first, "a new source node was created by the resume");
    near(first._startOffset, before, 0.15, "the resumed playback starts where it was paused");
  });
});

forEachBackend("MV on Android Chrome (shared Html5Audio element)", (b) => {
  if (b.cfg.engine !== "mv" || b.cfg.real) return; // needs the model's Html5Audio
  const androidUA = "Mozilla/5.0 (Linux; Android 9; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36";

  it("the engine would really hand out the shared Html5Audio singleton here (harness precondition)", async () => {
    const env = await boot(b, { envOpts: { userAgent: androidUA } });
    assert.equal(env.run("AudioManager.shouldUseHtml5Audio()"), true);
    assert.equal(env.run("AudioManager.createBuffer('bgm', 'Theme') === Html5Audio"), true);
  });

  it("Fugs BGM tracks are independent WebAudio tracks and never hijack Html5Audio", async () => {
    const env = await boot(b, { envOpts: { userAgent: androidUA } });
    const setupsBefore = env.run("Html5Audio._setupCalls");
    await env.runCommand("play-bgm1 Theme 90");
    await env.runCommand("play-bgm2 Bass 70");
    await env.settle();
    assert.equal(env.run("Html5Audio._setupCalls"), setupsBefore, "the game's own BGM element was not touched");
    assert.notEqual(env.track("bgm_1"), env.track("bgm_2"), "two BGM tracks are two different buffers");
    assert.equal(env.audio.audibleSources().length, 2);
    near(gainOf(env, "bgm_1"), 0.9, 1e-6);
    near(gainOf(env, "bgm_2"), 0.7, 1e-6);
    // mobile agents get .m4a from the engine's own extension logic
    assert.ok(env.requests.some((u) => /audio\/bgm\/Theme\.m4a$/.test(u)), JSON.stringify(env.requests));
  });
});

forEachBackend("audio context timing", (b) => {
  it("commands issued after the engine created its AudioContext work", async () => {
    const env = await createEnv(b.cfg);
    env.addDefaultAudio();
    env.loadPack();
    env.bootAudio();
    env.enterMap();
    await env.runCommand("play-bgm1 Theme 90");
    await env.settle();
    assert.deepEqual(keys(env), ["bgm_1"]);
  });

  it("with audio disabled (no AudioContext) commands are harmless", async () => {
    const env = await createEnv(b.cfg);
    env.addDefaultAudio();
    env.loadPack();
    // never call bootAudio(): WebAudio._context stays null (e.g. the "noaudio" option)
    env.enterMap();
    await env.runCommand("play-bgm1 Theme 90");
    await env.runCommand("effect-bgm1 preset:cave");
    await env.runCommand("fade-bgm1 50 1");
    await env.runCommand("stop-bgm1");
    await env.advance(500);
    assert.deepEqual(env.logs.error.filter((l) => /TypeError|Cannot read/.test(l)), []);
  });
});
