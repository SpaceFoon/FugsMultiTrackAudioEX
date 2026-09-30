"use strict";
/**
 * The dev-only in-game suite (FugsAudio8Test, `test("...")` in the F8 console) is advertised in
 * the README, so it has to work on both engines too. Here it runs against every backend inside the
 * harness; each group must finish with zero failed assertions.
 *
 * Not runnable here: tests that read a REAL audio signal through an AnalyserNode (the fake Web
 * Audio graph is silent) and the file-logging "run everything" mode (needs NW.js' fs).
 */
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { forEachBackend, boot, runInGameTests } = require("./support");

const PACK = ["core", "docs", "effects", "spatial", "dynamics", "switch", "aliases", "compat", "test"];
const NEEDS_REAL_AUDIO = ["fade:pitch:analyze"];

// group -> minimum number of passed assertions (guards against a group silently running nothing)
const GROUPS = [
  ["unit", 700],
  ["minimal", 480],
  ["play", 10],
  ["stop", 5],
  ["fade", 15],
  ["crossfade", 3],
  ["effect", 5],
  ["preset", 600],
  ["duck", 3],
  ["spatial", 2],
  ["pause", 2],
  ["save", 3],
  ["load", 4],
  ["se", 1],
  ["me", 1],
  ["layers", 2],
  ["pool", 14],
  ["playall", 5],
  ["memory", 3],
  ["stress", 20],
  ["coverage", 4],
  ["diag", 6],
];

forEachBackend("Dev test runner (FugsAudio8Test)", (b) => {
  it("is registered as window.test and lists its tests", async () => {
    const env = await boot(b, { pack: PACK });
    assert.equal(typeof env.run("window.test"), "function");
    const before = env.logs.all.length;
    await env.run('window.test("?")');
    const listing = env.logs.all.slice(before).join("\n");
    assert.match(listing, /Available Tests/);
    assert.match(listing, /unit:parse/);
    assert.ok(env.run("TestRunner.tests.size") >= 90, "the whole suite is registered");
  });

  for (const [group, minPassed] of GROUPS) {
    it(`test("${group}") has no failing assertions`, async () => {
      const env = await boot(b, { pack: PACK });
      const r = await runInGameTests(env, group, { exclude: NEEDS_REAL_AUDIO });
      assert.deepEqual(r.failedTests, [], `failed assertions in group "${group}"`);
      assert.equal(r.failed, 0);
      assert.ok(r.passed >= minPassed, `group "${group}" ran only ${r.passed} assertions (expected >= ${minPassed})`);
    });
  }

  it("cleanup() frees every track buffer on this engine (no leaked nodes or decoded data)", async () => {
    const env = await boot(b, { pack: PACK });
    await env.runCommand("play-bgm1 Theme 90");
    await env.runCommand("play-bgm2 BattleTheme 90");
    await env.settle(500);
    const bufs = [env.track("bgm_1"), env.track("bgm_2")];
    assert.ok(bufs.every(Boolean));
    env.sandbox.__t = env.run("TestRunner");
    let done = false;
    Promise.resolve(env.run("TestRunner.cleanup()")).then(() => (done = true));
    for (let i = 0; i < 200 && !done; i++) await env.advance(50, { map: false });
    assert.ok(done, "cleanup finished");
    assert.equal(env.run("FugsAudio.tracks.size"), 0);
    for (const buf of bufs) {
      assert.equal(buf._gainNode, null, "gain node released");
      assert.equal(env.A.engine.sourceNodes(buf).length, 0, "no live source nodes left");
    }
  });
});
