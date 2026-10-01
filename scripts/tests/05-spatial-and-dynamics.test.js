"use strict";
/**
 * FugsAudio3Spatial (proximity, doppler, pan sweeps) and
 * FugsAudio4Dynamics (duck, duckall, sidechain, pump), measured on the audio graph.
 */
const { it } = require("node:test");
const assert = require("node:assert/strict");
const {
  forEachBackend, boot, play, keys, audibleSourcesOf, gainOf, panOf, rateOf, startedCount, pluginErrors,
} = require("./support");

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || "value"}: expected ${b} +/- ${tol}, got ${a}`);

function setEvent(env, id, x, y) {
  env.run(`$dataMap.events[${id}] = { id: ${id} }; $gameMap._events[${id}] = { _realX: ${x}, _realY: ${y} };`);
}
function setPlayer(env, x, y) {
  env.run(`$gamePlayer.x = ${x}; $gamePlayer.y = ${y}; $gamePlayer._realX = ${x}; $gamePlayer._realY = ${y};`);
}

forEachBackend("proximity", (b) => {
  it("proximity-bgs1 {event:5, maxDistance:10}: linear falloff with distance", async () => {
    const env = await boot(b);
    setEvent(env, 5, 10, 5);
    setPlayer(env, 5, 5);
    await play(env, "play-bgs1 Waterfall 100");
    await env.runCommand("proximity-bgs1 {event:5, maxDistance:10}");
    await env.advance(100);
    near(gainOf(env, "bgs_1"), 0.5, 0.02, "distance 5 of 10");
    setPlayer(env, 7.5, 5);
    await env.advance(100);
    near(gainOf(env, "bgs_1"), 0.75, 0.02, "distance 2.5");
    setPlayer(env, 25, 5);
    await env.advance(100);
    near(gainOf(env, "bgs_1"), 0, 0.02, "beyond maxDistance is silent");
  });

  it("an event that moves while the player stands still updates the volume", async () => {
    const env = await boot(b);
    setEvent(env, 5, 10, 5);
    setPlayer(env, 5, 5);
    await play(env, "play-bgs1 Waterfall 100");
    await env.runCommand("proximity-bgs1 {event:5, maxDistance:10}");
    await env.advance(100);
    near(gainOf(env, "bgs_1"), 0.5, 0.02);
    setEvent(env, 5, 6, 5); // event walks towards the (idle) player
    await env.advance(100);
    near(gainOf(env, "bgs_1"), 0.9, 0.02);
  });

  it("smooth movement (sub-tile) changes the volume smoothly", async () => {
    const env = await boot(b);
    setEvent(env, 5, 10, 5);
    setPlayer(env, 5, 5);
    await play(env, "play-bgs1 Waterfall 100");
    await env.runCommand("proximity-bgs1 {event:5, maxDistance:10}");
    const seen = [];
    for (let i = 0; i < 6; i++) {
      env.run(`$gamePlayer._realX += 0.25;`); // still inside the same tile
      await env.advance(50);
      seen.push(gainOf(env, "bgs_1"));
    }
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1], "monotonic increase " + JSON.stringify(seen));
  });

  it("pan:true pans towards the source; curve:smooth and minVolume are honoured", async () => {
    const env = await boot(b);
    setEvent(env, 5, 10, 5);
    setPlayer(env, 5, 5);
    await play(env, "play-bgs1 Waterfall 100");
    await env.runCommand("proximity-bgs1 {event:5, maxDistance:10, curve:smooth, pan:true, minVolume:0.2}");
    await env.advance(100);
    near(gainOf(env, "bgs_1"), 0.5, 0.02, "smoothstep(0.5) = 0.5");
    near(panOf(env, "bgs_1"), 0.5, 0.02, "source is to the right");
    setPlayer(env, 20, 5);
    await env.advance(100);
    near(gainOf(env, "bgs_1"), 0.2, 0.02, "far away: clamped to minVolume");
  });

  it("fixed position source {x:..., y:...}", async () => {
    const env = await boot(b);
    setPlayer(env, 5, 5);
    await play(env, "play-bgs1 Waterfall 100");
    await env.runCommand("proximity-bgs1 {x:5, y:10, maxDistance:10}");
    await env.advance(100);
    near(gainOf(env, "bgs_1"), 0.5, 0.02);
  });

  it("custom curve points (the documented flat list form)", async () => {
    const env = await boot(b);
    setEvent(env, 5, 10, 5);
    setPlayer(env, 5, 5);
    await play(env, "play-bgs1 Waterfall 100");
    await env.runCommand("proximity-bgs1 {event:5, maxDistance:10, curve:custom, points:[0,1,0.5,0.8,1,0]}");
    await env.advance(100);
    near(gainOf(env, "bgs_1"), 0.8, 0.02, "curve value at 0.5");
  });

  it("proximity is per-track and removed when the track stops", async () => {
    const env = await boot(b);
    setEvent(env, 5, 10, 5);
    await play(env, "play-bgs1 Waterfall 100");
    await env.runCommand("proximity-bgs1 {event:5}");
    assert.equal(env.A.proximityData.has("bgs_1"), true);
    await env.runCommand("stop-bgs1");
    assert.equal(env.A.proximityData.has("bgs_1"), false);
  });

  it("a bad config never throws (logged and ignored)", async () => {
    const env = await boot(b);
    await play(env, "play-bgs1 Waterfall 100");
    await env.runCommand("proximity-bgs1 event:5");
    await env.runCommand("proximity-bgs1 {oops}");
    assert.deepEqual(keys(env), ["bgs_1"]);
  });

  it("doppler: approaching raises the pitch smoothly and NEVER restarts the sound", async () => {
    const env = await boot(b);
    setEvent(env, 5, 30, 5);
    setPlayer(env, 5, 5);
    await play(env, "play-bgs1 Waterfall 100");
    const before = startedCount(env);
    await env.runCommand("proximity-bgs1 {event:5, maxDistance:40, doppler:true, dopplerScale:2}");
    for (let i = 0; i < 90; i++) {
      env.run(`$gamePlayer._realX += 0.1; $gamePlayer.x = Math.round($gamePlayer._realX);`);
      await env.advance(16.7);
    }
    const r = rateOf(env, "bgs_1");
    assert.ok(r > 1.1 && r <= 2.0, "pitch went up while approaching, got " + r);
    assert.equal(startedCount(env), before, "doppler pitch changes must not restart playback");
    assert.deepEqual(pluginErrors(env), []);
  });

  it("doppler command variant: doppler-bgs1 {event:5, maxDistance:10}", async () => {
    const env = await boot(b);
    setEvent(env, 5, 10, 5);
    await play(env, "play-bgs1 Waterfall 100");
    await env.runCommand("doppler-bgs1 {event:5, maxDistance:10}");
    assert.equal(env.A.proximityData.get("bgs_1").doppler, true);
  });
});

forEachBackend("pan sweep", (b) => {
  it("pansweep-bgm -100 100 4 sweeps left/right and stoppansweep-bgm stops it", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("pansweep-bgm -100 100 4");
    await env.advance(2100);
    near(panOf(env, "bgm_1"), 1, 0.05, "half cycle: full right");
    await env.advance(2000);
    near(panOf(env, "bgm_1"), -1, 0.05, "next half: full left");
    await env.runCommand("stoppansweep-bgm");
    const held = panOf(env, "bgm_1");
    await env.advance(2000);
    near(panOf(env, "bgm_1"), held, 0.02, "stays put after stopping");
  });

  it("pansweep-bgm -100 100 4 2 performs exactly two cycles then stops", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("pansweep-bgm -100 100 4 2");
    await env.advance(8300);
    assert.equal(env.A.panSweeps.has("bgm_1"), false, "sweep finished");
    const held = panOf(env, "bgm_1");
    await env.advance(2000);
    near(panOf(env, "bgm_1"), held, 0.02);
  });

  it("FugsAudio.sweepPan / stopSweepPan script calls", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    env.run("FugsAudio.sweepPan('bgm', 1, { duration: 4 })");
    await env.advance(2100);
    near(panOf(env, "bgm_1"), 1, 0.05);
    env.run("FugsAudio.stopSweepPan('bgm', 1)");
    assert.equal(env.A.panSweeps.has("bgm_1"), false);
  });
});

forEachBackend("ducking", (b) => {
  it("duck-bgm1 0.3 0.5 2: drops to 30%, holds, then restores the previous volume", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("duck-bgm1 0.3 0.5 2");
    await env.advance(700);
    near(gainOf(env, "bgm_1"), 0.3, 0.01, "ducked");
    await env.advance(1500);
    near(gainOf(env, "bgm_1"), 0.3, 0.01, "still held");
    await env.advance(1000);
    near(gainOf(env, "bgm_1"), 0.9, 0.01, "restored");
  });

  it("duckall 0.3 0.5 3 ducks every track and restores them", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("play-bgs1 Rain 60");
    await env.settle();
    await env.runCommand("duckall 0.3 0.5 3");
    await env.advance(800);
    near(gainOf(env, "bgm_1"), 0.3, 0.01);
    near(gainOf(env, "bgs_1"), 0.3, 0.01);
    await env.advance(4000);
    near(gainOf(env, "bgm_1"), 0.9, 0.01, "bgm restored");
    near(gainOf(env, "bgs_1"), 0.6, 0.01, "bgs restored");
  });

  it("duckall-bgm only ducks BGM; duckall-sidechain bgm1 ducks everything except bgm1", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("play-bgm2 Bass 90");
    await env.runCommand("play-bgs1 Rain 90");
    await env.settle();
    await env.runCommand("duckall-bgm 0.2 0.3 2");
    await env.advance(500);
    near(gainOf(env, "bgm_1"), 0.2, 0.01);
    near(gainOf(env, "bgm_2"), 0.2, 0.01);
    near(gainOf(env, "bgs_1"), 0.9, 0.01, "bgs untouched");
    await env.advance(3000);
    await env.runCommand("duckall-sidechain bgm1 0.3 1 4");
    await env.advance(1300);
    near(gainOf(env, "bgm_1"), 0.9, 0.01, "excepted track untouched");
    near(gainOf(env, "bgm_2"), 0.3, 0.01);
    near(gainOf(env, "bgs_1"), 0.3, 0.01);
  });

  it("switch-controlled duck: 'duck-bgm 0.3 1 0 switch:20' ducks while switch 20 is ON", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("duck-bgm 0.3 1 0 switch:20");
    near(gainOf(env, "bgm_1"), 0.9, 0.01, "armed but not active yet");
    env.run("$gameSwitches.setValue(20, true)");
    await env.advance(1300);
    near(gainOf(env, "bgm_1"), 0.3, 0.01, "ducked while ON");
    env.run("$gameSwitches.setValue(20, false)");
    await env.advance(1300);
    near(gainOf(env, "bgm_1"), 0.9, 0.01, "restored when OFF");
  });
});

forEachBackend("pump and sidechain", (b) => {
  it("duckpump 80 0.6 heartbeat bgm modulates the BGM level; stoppump restores it", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Theme 90");
    await env.runCommand("play-bgs1 Rain 90");
    await env.settle();
    await env.runCommand("duckpump 80 0.6 heartbeat bgm");
    let min = 1;
    let max = 0;
    for (let i = 0; i < 120; i++) {
      await env.advance(16.7);
      const buf = env.track("bgm_1");
      assert.ok(buf._pumpGainNode, "pump node inserted on the BGM track");
      const v = buf._pumpGainNode.gain.value;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    assert.ok(min < 0.6, "pump ducks (min " + min + ")");
    assert.ok(max > 0.95, "pump releases (max " + max + ")");
    assert.equal(env.track("bgs_1")._pumpGainNode, undefined, "BGS not affected when tracks=bgm");
    const g = env.track("bgm_1")._gainNode;
    const pump = env.track("bgm_1")._pumpGainNode;
    assert.ok(env.audio.pathExists(g, pump) && env.audio.pathExists(pump, env.audio.destination), "gain -> pump -> speakers");
    await env.runCommand("stoppump");
    near(env.track("bgm_1")._pumpGainNode.gain.value, 1, 1e-6, "pump released");
  });

  it("the pump keeps working after a track restarts (repeat loop creates new nodes)", async () => {
    const env = await boot(b);
    await play(env, "play-se1 Hit 90 (loop:1)");
    await env.runCommand("duckpump 120 0.8 square se");
    await env.advance(300);
    await env.advance(1200); // repeat has restarted the buffer
    const buf = env.track("se_1");
    assert.ok(buf, "still playing (repeat)");
    const pump = buf._pumpGainNode;
    assert.ok(pump, "pump node present");
    assert.ok(env.audio.pathExists(buf._gainNode, pump), "pump node is still wired after the restart");
  });

  it("sidechain-bgm 1 2 (track ids): the source track ducks the target while it is loud", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Kick 90");
    await env.runCommand("play-bgm2 Bass 90");
    await env.settle();
    await env.runCommand("sidechain-bgm 1 2 0.05 1 0.01 0.05");
    await env.advance(500);
    const ducked = gainOf(env, "bgm_2");
    assert.ok(ducked < 0.7, "target ducked by the loud source, got " + ducked);
    await env.runCommand("stopsidechain-bgm 1 2");
    await env.advance(200);
    near(gainOf(env, "bgm_2"), 0.9, 0.01, "target restored after stopsidechain");
  });

  it("sidechain-bgm kick bass ...: the documented example (file names instead of ids) works", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Kick 90");
    await env.runCommand("play-bgm2 Bass 90");
    await env.settle();
    await env.runCommand("sidechain-bgm kick bass 0.05 1 0.01 0.05");
    await env.advance(500);
    assert.ok(gainOf(env, "bgm_2") < 0.7, "target ducked, got " + gainOf(env, "bgm_2"));
    await env.runCommand("stopsidechain-bgm kick bass");
    await env.advance(200);
    near(gainOf(env, "bgm_2"), 0.9, 0.01, "restored");
  });

  it("re-issuing a sidechain replaces it (no duplicate followers)", async () => {
    const env = await boot(b);
    await play(env, "play-bgm1 Kick 90");
    await env.runCommand("play-bgm2 Bass 90");
    await env.settle();
    await env.runCommand("sidechain-bgm 1 2 0.05 1 0.01 0.05");
    await env.runCommand("sidechain-bgm 1 2 0.05 1 0.01 0.05");
    assert.equal(env.A.sidechainConnections.size, 1);
    assert.equal(env.audio.nodesOfKind("Analyser").filter((a) => env.audio.edgesTo(a).length > 0).length, 1, "one live analyser tap");
  });
});
