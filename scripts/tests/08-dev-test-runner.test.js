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

  it("test.mode is the same switch as TestRunner.mode (README: test.mode = \"human\")", async () => {
    const env = await boot(b, { pack: PACK });
    assert.equal(env.run("test.mode"), "robot");
    assert.equal(env.run("TestRunner.t"), 0.25);
    env.run('test.mode = "human"');
    assert.equal(env.run("TestRunner.mode"), "human");
    assert.equal(env.run("TestRunner.t"), 1, "human mode waits for full length");
    env.run('test.mode = "robot"');
    assert.equal(env.run("TestRunner.t"), 0.25);
  });

  it("test('name:param') runs exactly that test with the parameter; a bare group name still runs the group", async () => {
    const env = await boot(b, { pack: PACK });
    const run = async (pattern) => {
      const before = env.logs.all.length;
      const result = await runInGameTests(env, pattern, { exclude: NEEDS_REAL_AUDIO });
      const header = env.logs.all.slice(before).find((l) => /Running \d+ test/.test(l));
      assert.ok(header, `no "Running N test(s)" line for ${pattern}`);
      return { count: Number(/Running (\d+) test/.exec(header)[1]), log: env.logs.all.slice(before).join("\n"), result };
    };

    let r = await run("preset:cave"); // Docs: "Single preset by name"
    assert.equal(r.count, 1);
    assert.match(r.log, /cave applied/);
    assert.doesNotMatch(r.log, /All \d+ presets applied/, "the other preset tests were not dragged in");
    assert.equal(r.result.failed, 0);

    r = await run("fade:curve:smooth"); // test('?') lists fade:curve; the last part is its parameter
    assert.equal(r.count, 1);
    assert.equal(r.result.failed, 0);

    r = await run("playall:bgm"); // a listed name runs just that test
    assert.equal(r.count, 1);

    r = await run("unit:parse");
    assert.equal(r.count, 1);
    assert.ok(r.result.passed > 3 && r.result.failed === 0);

    r = await run("play"); // bare group name: play, play:multi, play:types, play:fadein
    assert.ok(r.count >= 4, "group run picks up the play:* tests too, got " + r.count);
    assert.equal(r.result.failed, 0);
  });

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
