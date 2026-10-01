"use strict";
/**
 * The Sound Garden demo (demo/): every event's plugin commands are run through the engine's real
 * event-command dispatch (MV code 356 / MZ code 357, exactly as the generated map stores them),
 * and the main stations are checked on the audio graph. Also checks that every asset the map
 * refers to exists and that demo/install.js produces a working project layout.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { it, describe } = require("node:test");
const assert = require("node:assert/strict");
const { REPO_ROOT } = require("../harness/env");
const { forEachBackend, boot, keys, gainOf, panOf, truePos, startedCount, pluginErrors } = require("./support");
const { buildGarden, START, ID, SWITCHES } = require("../../demo/tools/garden");
const { SOUNDS, LOOP_SECONDS } = require("../../demo/tools/synth");

const GAME = path.join(REPO_ROOT, "demo", "game");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || "value"}: expected ${b} +/- ${tol}, got ${a}`);
const DURATION = { bgm: LOOP_SECONDS, bgs: 10, me: 4.2, se: 0.2 };

const AUDIO_CODES = new Set([356, 357]);
/** Every FugsAudio command text in a command list (both engines' forms). */
function commandTexts(list) {
  const out = [];
  for (const c of list) {
    if (c.code === 356) out.push(c.parameters[0]);
    if (c.code === 357) {
      const a = c.parameters[3];
      out.push(...(a.command != null ? [a.command] : a.commands.split("\n")));
    }
  }
  return out;
}
/** The commands inside choice `index` of the first Show Choices in `list`. */
function choiceBranch(list, index) {
  const start = list.findIndex((c) => c.code === 402 && c.parameters[0] === index);
  assert.ok(start >= 0, "choice " + index + " exists");
  const indent = list[start].indent;
  const end = list.findIndex((c, i) => i > start && c.indent === indent && (c.code === 402 || c.code === 404));
  return list.slice(start + 1, end);
}

async function bootGarden(b) {
  const map = buildGarden(b.id.startsWith("mz") ? "mz" : "mv");
  const env = await boot(b, {
    files(e) {
      for (const [folder, name] of SOUNDS) e.addAudio(folder, name, { duration: name === "GardenRadio" ? 8 : DURATION[folder] });
    },
  });
  for (const ev of map.events.filter(Boolean)) {
    env.run(`$dataMap.events[${ev.id}] = { id: ${ev.id} }; $gameMap._events[${ev.id}] = { _realX: ${ev.x}, _realY: ${ev.y} };`);
  }
  movePlayer(env, START.x, START.y);
  return { env, map };
}
function movePlayer(env, x, y) {
  env.run(`$gamePlayer.x = ${x}; $gamePlayer.y = ${y}; $gamePlayer._realX = ${x}; $gamePlayer._realY = ${y};`);
}
/**
 * Run a command list the way the interpreter would, minus the message boxes: plugin commands go
 * through the engine's own dispatch, switches and waits are applied. Branches are NOT evaluated.
 */
async function runList(env, list) {
  for (const c of list) {
    if (AUDIO_CODES.has(c.code)) {
      env.sandbox.__evcmd = c;
      env.run(`
        (function () {
          var it = new Game_Interpreter();
          it.setup([Object.assign({}, window.__evcmd, { indent: 0 }), { code: 0, indent: 0, parameters: [] }], 1);
          it.update();
        })();
      `);
      await env.settle(300);
    } else if (c.code === 121) {
      env.run(`$gameSwitches.setValue(${c.parameters[0]}, ${c.parameters[2] === 0})`);
      await env.settle(100);
    } else if (c.code === 230) {
      await env.advance(c.parameters[0] * (1000 / 60));
    }
  }
}
const page = (map, id, n) => map.events[id].pages[n || 0].list;

describe("demo :: assets and data", () => {
  it("every sound the map uses is generated, and every image it shows exists", () => {
    const names = new Set(SOUNDS.map(([folder, name]) => folder + "/" + name));
    for (const [folder, name] of SOUNDS) {
      assert.ok(fs.existsSync(path.join(GAME, "audio", folder, name + ".ogg")), `${folder}/${name}.ogg`);
      assert.ok(fs.existsSync(path.join(GAME, "audio", folder, name + ".m4a")), `${folder}/${name}.m4a`);
    }
    for (const engine of ["mz", "mv"]) {
      const map = buildGarden(engine);
      for (const ev of map.events.filter(Boolean)) {
        for (const p of ev.pages) {
          const img = p.image.characterName;
          if (img) assert.ok(fs.existsSync(path.join(GAME, "img", "characters", img + ".png")), img);
          for (const text of commandTexts(p.list)) {
            for (const word of text.match(/Garden[A-Z][A-Za-z0-9]*/g) || []) {
              if (word === "GardenStep") continue; // the alias name
              assert.ok([...names].some((n) => n.endsWith("/" + word)), `"${text}" refers to ${word}, which is not generated`);
            }
          }
        }
      }
    }
  });

  it("MZ events use the native plugin command, MV events the classic one, and lists are well-formed", () => {
    for (const engine of ["mz", "mv"]) {
      const map = buildGarden(engine);
      assert.equal(map.data.length, map.width * map.height * 6);
      for (const ev of map.events.filter(Boolean)) {
        for (const p of ev.pages) {
          const last = p.list[p.list.length - 1];
          assert.deepEqual([last.code, last.indent], [0, 0], `${ev.name}: list ends with code 0 at indent 0`);
          for (const c of p.list) {
            assert.ok(c.indent >= 0, `${ev.name}: indent`);
            if (engine === "mz") assert.notEqual(c.code, 356, `${ev.name}: MZ map uses code 357`);
            else assert.notEqual(c.code, 357, `${ev.name}: MV map uses code 356`);
            if (c.code === 111 && c.parameters[0] === 12) new Function(c.parameters[1]); // script condition parses
            if (c.code === 401) assert.ok(c.parameters[0].length <= 46, `${ev.name}: message line fits the window: ${c.parameters[0]}`);
          }
        }
      }
    }
  });
});

forEachBackend("demo :: Sound Garden", (b) => {
  it("every plugin command in every event runs without a plugin error", async () => {
    const { env, map } = await bootGarden(b);
    const order = [ID.INIT].concat(map.events.filter((e) => e && e.id !== ID.INIT).map((e) => e.id));
    for (const id of order) {
      for (const p of map.events[id].pages) {
        await runList(env, p.list);
        assert.deepEqual(pluginErrors(env), [], `errors after "${map.events[id].name}"`);
      }
    }
  });

  it("the opening starts four stems in sync plus ambience, and world sounds follow distance", async () => {
    const { env, map } = await bootGarden(b);
    await runList(env, page(map, ID.INIT));
    await env.settle(1000);
    assert.deepEqual(keys(env), ["bgm_1", "bgm_2", "bgm_3", "bgm_4", "bgm_5", "bgs_1", "bgs_2", "bgs_3"]);
    near(gainOf(env, "bgm_1"), 0, 0.01, "drums start muted");
    near(gainOf(env, "bgm_2"), 0.7, 0.01, "bass");
    near(gainOf(env, "bgm_3"), 0.6, 0.01, "pads");
    near(gainOf(env, "bgm_4"), 0, 0.01, "melody starts muted");
    const pos = [1, 2, 3, 4].map((n) => truePos(env, "bgm_" + n));
    for (const p of pos) near(p, pos[0], 0.02, "stems play in sync");
    assert.ok(env.A.sfxAliases.has("GardenStep"), "footstep alias registered");
    assert.ok(env.A.effectChains.has("bgm_5"), "radio effect on the radio track");

    near(gainOf(env, "bgs_2"), 0, 0.01, "campfire out of earshot from the start point");
    movePlayer(env, 4, 13); // next to the fire, on its right
    await env.advance(200);
    assert.ok(gainOf(env, "bgs_2") > 0.6, "campfire loud up close: " + gainOf(env, "bgs_2"));
    assert.ok(panOf(env, "bgs_2") < 0, "fire is to the player's left");
    movePlayer(env, 20, 13); // next to the radio
    await env.advance(200);
    assert.ok(gainOf(env, "bgm_5") > 0.4, "radio audible up close: " + gainOf(env, "bgm_5"));
    near(gainOf(env, "bgs_2"), 0, 0.01, "campfire silent from the radio");
    assert.deepEqual(pluginErrors(env), []);
  });

  it("the Conductor's mixes fade stems without restarting them", async () => {
    const { env, map } = await bootGarden(b);
    await runList(env, page(map, ID.INIT));
    await env.settle(500);
    const started = startedCount(env);
    await runList(env, choiceBranch(page(map, ID.CONDUCTOR), 2)); // Full band
    await env.advance(2500);
    near(gainOf(env, "bgm_1"), 0.85, 0.02, "drums in");
    near(gainOf(env, "bgm_4"), 0.8, 0.02, "melody in");
    await runList(env, choiceBranch(page(map, ID.CONDUCTOR), 0)); // Just the pads
    await env.advance(2500);
    near(gainOf(env, "bgm_1"), 0, 0.02, "drums out");
    near(gainOf(env, "bgm_3"), 0.7, 0.02, "pads");
    assert.equal(startedCount(env), started, "no stem was restarted");
    const pos = [1, 2, 3, 4].map((n) => truePos(env, "bgm_" + n));
    for (const p of pos) near(p, pos[0], 0.02, "still in sync");
  });

  it("the Wizard's presets and the cave zone put effects on all four stems and take them off", async () => {
    const { env, map } = await bootGarden(b);
    await runList(env, page(map, ID.INIT));
    await runList(env, choiceBranch(page(map, ID.WIZARD), 0)); // cave
    await env.advance(2000);
    for (const n of [1, 2, 3, 4]) assert.ok(env.A.effectChains.has("bgm_" + n), "effect on bgm_" + n);
    await runList(env, choiceBranch(page(map, ID.WIZARD), 5)); // normally
    await env.advance(2500);
    for (const n of [1, 2, 3, 4]) assert.equal(env.A.effectChains.has("bgm_" + n), false, "effect removed from bgm_" + n);
    assert.deepEqual(pluginErrors(env), []);
  });

  it("the Storyteller's switch duck lowers the band while switch 13 is ON and restores it after", async () => {
    const { env, map } = await bootGarden(b);
    await runList(env, page(map, ID.INIT));
    await env.settle(500);
    const list = page(map, ID.STORYTELLER);
    const off = list.findIndex((c) => c.code === 121 && c.parameters[2] === 1);
    await runList(env, list.slice(0, off)); // register + switch ON (the talking happens here)
    await env.advance(1000);
    assert.ok(gainOf(env, "bgm_2") <= 0.26, "bass ducked: " + gainOf(env, "bgm_2"));
    await runList(env, list.slice(off));
    await env.advance(1000);
    near(gainOf(env, "bgm_2"), 0.7, 0.02, "bass restored");
    near(gainOf(env, "bgm_1"), 0, 0.02, "drums back to muted");
  });

  it("ducking leaves stems that are muted (volume 0) silent", async () => {
    const { env, map } = await bootGarden(b);
    await runList(env, page(map, ID.INIT));
    await env.settle(500);
    const list = page(map, ID.STORYTELLER);
    const off = list.findIndex((c) => c.code === 121 && c.parameters[2] === 1);
    await runList(env, list.slice(0, off));
    await env.advance(1000);
    near(gainOf(env, "bgm_1"), 0, 0.02, "muted drums stay muted during the duck");
  });

  it("the storm lever: switch 11 ON starts the rain, the second pull fades it and stops it", async () => {
    const { env, map } = await bootGarden(b);
    await runList(env, page(map, ID.INIT));
    await runList(env, page(map, ID.LEVER, 0));
    await env.advance(3500);
    assert.ok(keys(env).includes("bgs_5"), "rain playing");
    near(gainOf(env, "bgs_5"), 0.8, 0.02, "rain volume");
    assert.equal(env.run(`$gameSwitches.value(${SWITCHES.STORM})`), true);
    await runList(env, page(map, ID.LEVER, 1));
    await env.advance(500);
    assert.equal(keys(env).includes("bgs_5"), false, "rain stopped with the switch");
    assert.deepEqual(pluginErrors(env), []);
  });

  it("the chimes sweep from ear to ear and stop cleanly", async () => {
    const { env, map } = await bootGarden(b);
    await runList(env, page(map, ID.INIT));
    const list = page(map, ID.CHIMES);
    const startIdx = list.findIndex((c) => c.code === 111);
    const elseIdx = list.findIndex((c) => c.code === 411);
    await runList(env, list.slice(startIdx + 1, elseIdx));
    const pans = [];
    for (let i = 0; i < 12; i++) {
      await env.advance(500);
      pans.push(panOf(env, "bgs_4"));
    }
    assert.ok(Math.min(...pans) < -0.5 && Math.max(...pans) > 0.5, "pan sweeps both ways: " + pans.map((p) => p.toFixed(2)));
    await runList(env, list.slice(elseIdx + 1));
    await env.advance(2500);
    assert.equal(keys(env).includes("bgs_4"), false, "chimes stopped");
    assert.deepEqual(pluginErrors(env), []);
  });
});

describe("demo :: install.js", () => {
  function fakeProject(engine) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fugs-demo-" + engine + "-"));
    fs.mkdirSync(path.join(dir, "js", "plugins"), { recursive: true });
    fs.mkdirSync(path.join(dir, "data"));
    fs.writeFileSync(path.join(dir, "js", engine === "mz" ? "rmmz_core.js" : "rpg_core.js"), "");
    fs.writeFileSync(
      path.join(dir, "js", "plugins.js"),
      '// Generated by RPG Maker.\n// Do not edit this file directly.\nvar $plugins =\n[\n{"name":"SomeOtherPlugin","status":true,"description":"","parameters":{"x":"1"}}\n];\n'
    );
    const json = (f, v) => fs.writeFileSync(path.join(dir, "data", f), JSON.stringify(v));
    json("System.json", { startMapId: 1, startX: 0, startY: 0, switches: new Array(21).fill("") });
    json("MapInfos.json", [null, { id: 1, expanded: false, name: "MAP001", order: 1, parentId: 0, scrollX: 0, scrollY: 0 }]);
    json("Map001.json", { events: [] });
    json("Tilesets.json", [null, { id: 1, name: "Overworld" }, { id: 2, name: "Outside" }]);
    json("Troops.json", [null, { id: 1, name: "Bat*2" }]);
    return dir;
  }
  const install = (dir, extra) =>
    spawnSync(process.execPath, [path.join(REPO_ROOT, "demo", "install.js"), dir].concat(extra || []), { encoding: "utf8" });
  const read = (dir, rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));
  const plugins = (dir) => new Function(fs.readFileSync(path.join(dir, "js", "plugins.js"), "utf8") + "\nreturn $plugins;")();

  for (const engine of ["mz", "mv"]) {
    it(`installs into a new ${engine.toUpperCase()} project, and re-running updates it in place`, () => {
      const dir = fakeProject(engine);
      try {
        const r = install(dir);
        assert.equal(r.status, 0, r.stderr + r.stdout);
        const sys = read(dir, "data/System.json");
        assert.deepEqual([sys.startMapId, sys.startX, sys.startY], [2, START.x, START.y]);
        assert.equal(sys.switches[SWITCHES.STORM], "Garden: storm");
        const map = read(dir, "data/Map002.json");
        assert.equal(map.tilesetId, 3);
        assert.equal(read(dir, "data/Tilesets.json")[3].tilesetNames[4], "FugsGarden_A5");
        assert.equal(read(dir, "data/MapInfos.json")[2].name, "Sound Garden");
        const list = plugins(dir);
        assert.deepEqual(list.map((p) => p.name), [
          "SomeOtherPlugin", "FugsMultiTrackAudioEX", "FugsAudio0Docs", "FugsAudio2Effects", "FugsAudio3Spatial",
          "FugsAudio4Dynamics", "FugsAudio5Switch", "FugsAudio6Aliases", "FugsAudio7Compat",
        ]);
        assert.equal(list[1].parameters["Default Pause Mode"], "battle", "Core parameters filled from the plugin header");
        assert.equal(list[0].parameters.x, "1", "other plugins untouched");
        for (const p of list.slice(1)) assert.ok(fs.existsSync(path.join(dir, "js", "plugins", p.name + ".js")), p.name);
        assert.ok(fs.existsSync(path.join(dir, "audio", "bgm", "GardenDrums.ogg")));
        assert.equal(fs.existsSync(path.join(dir, "audio", "bgm", "GardenDrums.m4a")), engine === "mv", ".m4a only for MV");
        assert.ok(fs.existsSync(path.join(dir, "img", "characters", "!FugsGardenProps.png")));
        assert.equal(map.events[ID.INIT].pages[0].list.some((c) => c.code === (engine === "mz" ? 357 : 356)), true);

        const again = install(dir, ["--dev"]);
        assert.equal(again.status, 0, again.stderr);
        assert.equal(read(dir, "data/MapInfos.json").length, 3, "no second map");
        assert.equal(read(dir, "data/Tilesets.json").length, 4, "no second tileset");
        assert.deepEqual(plugins(dir).slice(-1).map((p) => p.name), ["FugsAudio8Test"], "--dev adds the test runner last");
        assert.equal(plugins(dir).filter((p) => p.name === "FugsMultiTrackAudioEX").length, 1);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it("refuses a folder that is not an RPG Maker project", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fugs-demo-none-"));
    try {
      const r = install(dir);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /not an RPG Maker MZ or MV project/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
