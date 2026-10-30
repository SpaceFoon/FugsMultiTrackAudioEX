"use strict";
/**
 * The in-editor playbook (FugsAudio0Docs.js) is what users copy from. Every CONCRETE example in it
 * must actually be accepted by the plugin on both engines: no unknown command, no parse failure, no
 * console error, no exception. The examples are extracted from the Docs text at test time, so a
 * new or edited example is covered automatically (and one that stops working fails here).
 *
 * Templates (`[Type]`, `<x>`, `...`, `FugsAudio.play(type, trackId, ...)`) are skipped; a `{config}`
 * that the Docs wrap over several lines is joined back into the one line a user would type.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createEnv } = require("../harness/env");
const { forEachBackend, boot } = require("./support");

const DOCS = fs.readFileSync(path.join(__dirname, "..", "..", "FugsAudio0Docs.js"), "utf8");
const HELP_LINES = DOCS.slice(DOCS.indexOf("/*:"), DOCS.indexOf("*/") + 2)
  .split(/\r?\n/)
  .map((l) => l.replace(/^\s*\*\s?/, ""));

// Commands written without a "-" (everything else is recognised by its dash: play-bgm1, fade-bgs2, ...)
const BARE_COMMANDS = new Set([
  "registeralias", "unregisteralias", "listaliases", "saveall", "loadall", "stopall", "pauseall",
  "resumeall", "fadeall", "duckall", "duckpump", "stoppump", "pitchbendall", "syncplay", "chain",
]);
const balance = (t, c) => t.split(c).length - 1;
const withoutComment = (t) => t.replace(/\s+\/\/.*$/, "");

function commandExamples(isKnown) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < HELP_LINES.length; i++) {
    let line = withoutComment(HELP_LINES[i].trim());
    const word = line.split(/\s+/)[0];
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(word)) continue; // commands are lowercase, prose is not
    if (!word.includes("-") && !BARE_COMMANDS.has(word)) continue;
    if (!isKnown(word)) continue;
    while (balance(line, "{") > balance(line, "}") && i + 1 < HELP_LINES.length) line += " " + HELP_LINES[++i].trim();
    if (/<|>|\.\.\./.test(line)) continue; // template
    if (/\[[A-Za-z][A-Za-z0-9 _-]*\]\??/.test(line)) continue; // [Type] / [duckLevel]? placeholders
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
  return out;
}

function scriptCallExamples() {
  const out = [];
  const seen = new Set();
  const parses = (t) => {
    try {
      new vm.Script(t);
      return true;
    } catch (_e) {
      return false;
    }
  };
  for (let i = 0; i < HELP_LINES.length; i++) {
    if (!/^FugsAudio\.[A-Za-z]+\(/.test(HELP_LINES[i].trim())) continue;
    let stmt = withoutComment(HELP_LINES[i].trim());
    let n = i;
    while (!parses(stmt) && n + 1 < HELP_LINES.length && n - i < 6) stmt += " " + withoutComment(HELP_LINES[++n].trim());
    if (parses(stmt) && !seen.has(stmt)) {
      seen.add(stmt);
      out.push(stmt);
    }
  }
  return out;
}

/** test('...') calls printed in the Docs (the dev console section). */
function consoleTestCalls() {
  const out = [];
  for (const line of HELP_LINES) {
    const m = /^test\((?:'([^']*)'|"([^"]*)")?\)/.exec(line.trim());
    if (m) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : "");
  }
  return out;
}

/** A game with music, ambience and an event on the map, so examples have something to act on. */
async function richBoot(b) {
  const env = await createEnv(b.cfg);
  env.addDefaultAudio();
  ["NewSong", "Drums", "Bass", "Lead", "Pads", "ThemeSong", "Exploration", "Forest_Ambience", "kick", "bass"].forEach((n) =>
    env.addAudio("bgm", n, { duration: 30 })
  );
  ["Rain", "Waterfall", "Wind"].forEach((n) => env.addAudio("bgs", n, { duration: 20 }));
  env.loadPack();
  env.bootAudio();
  env.enterMap();
  await env.advance(5000);
  env._errorBase = env.logs.error.length;
  env.run(
    "$dataMap.events[5] = { id: 5 }; $gameMap._events[5] = { _realX: 10, _realY: 5 };" +
      "$gamePlayer.x = 5; $gamePlayer.y = 5; $gamePlayer._realX = 5; $gamePlayer._realY = 5;"
  );
  for (const c of [
    "play-bgm1 ThemeSong 90", "play-bgm2 Bass 90", "play-bgm3 Pads 90", "play-bgm4 Lead 90",
    "play-bgs1 Rain 70", "play-bgs2 Wind 70", "play-se1 Hit 80", "play-me1 Fanfare 80",
  ]) {
    await env.runCommand(c);
  }
  await env.advance(500);
  return env;
}

/** Problems a user would see: console errors and the plugin's "can't understand" warnings. */
function problemsSince(env, e0, w0) {
  const errors = env.logs.error.slice(e0);
  const warnings = env.logs.warn.slice(w0).filter((l) => /Fugs/.test(l) && /Unknown command|Could not understand|Invalid|invalid|failed|must be/.test(l));
  return errors.concat(warnings).map((l) => String(l).slice(0, 200));
}

forEachBackend("Docs examples (FugsAudio0Docs.js)", (b) => {
  it("every concrete plugin-command example is accepted", async () => {
    const probe = await createEnv(b.cfg);
    probe.loadPack();
    const examples = commandExamples((w) => probe.A.isKnownPluginCommand(w));
    assert.ok(examples.length > 60, "the extractor found the command examples (" + examples.length + ")");
    const bad = [];
    for (const line of examples) {
      const env = await richBoot(b);
      const e0 = env.logs.error.length;
      const w0 = env.logs.warn.length;
      let thrown = null;
      try {
        await env.runCommand(line);
        await env.advance(1500);
      } catch (e) {
        thrown = e && e.message;
      }
      const problems = problemsSince(env, e0, w0);
      if (thrown || problems.length) bad.push(`${line}\n      -> ${thrown || problems.slice(0, 2).join(" | ")}`);
    }
    assert.deepEqual(bad, [], "Docs examples that fail:\n  " + bad.join("\n  "));
  });

  it("every concrete FugsAudio.* script-call example runs", async () => {
    const examples = scriptCallExamples();
    assert.ok(examples.length > 25, "the extractor found the script-call examples (" + examples.length + ")");
    const bad = [];
    for (const stmt of examples) {
      const env = await richBoot(b);
      const e0 = env.logs.error.length;
      const w0 = env.logs.warn.length;
      let thrown = null;
      try {
        env.run(stmt);
        await env.advance(1500);
      } catch (e) {
        // `FugsAudio.play(type, trackId, ...)` signature lines mention undefined placeholders
        if (e && e.name !== "ReferenceError") thrown = e.name + ": " + e.message;
      }
      const problems = problemsSince(env, e0, w0);
      if (thrown || problems.length) bad.push(`${stmt.slice(0, 120)}\n      -> ${thrown || problems.slice(0, 2).join(" | ")}`);
    }
    assert.deepEqual(bad, [], "Docs script calls that fail:\n  " + bad.join("\n  "));
  });

  it("every test('...') the Docs list for the F8 console names a registered test or group", async () => {
    const env = await boot(b, {
      pack: ["core", "docs", "effects", "spatial", "dynamics", "switch", "aliases", "compat", "test"],
    });
    const calls = consoleTestCalls();
    assert.ok(calls.length >= 12, "the extractor found the console test calls (" + calls.length + ")");
    const names = Array.from(env.run("TestRunner.tests.keys()"));
    const missing = [];
    for (const pattern of calls) {
      if (pattern === "" || pattern === "*" || pattern.startsWith("?")) continue; // help, list/search, everything
      const first = pattern.split(":")[0];
      const exists = names.some((n) => n === first || n.startsWith(first + ":"));
      if (!exists) missing.push(pattern);
    }
    assert.deepEqual(missing, [], "Docs mention tests that do not exist: " + missing.join(", "));
  });
});
