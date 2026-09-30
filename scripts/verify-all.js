/**
 * Full offline verification gate for the plugin pack (RPG Maker MV + MZ).
 *
 * Usage: node scripts/verify-all.js [--fast]
 *   --fast   skip the second engine-scenario run against the all-in-one bundle
 *
 * Needs Node 18+. Optional: set RMMZ_JS_DIR to the js/ folder of an MZ project to ALSO run every
 * scenario against the real MZ engine scripts (see README, "Verification").
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const fast = process.argv.includes("--fast");
const plugins = [
  "FugsMultiTrackAudioEX.js",
  "FugsAudio0Docs.js",
  "FugsAudio2Effects.js",
  "FugsAudio3Spatial.js",
  "FugsAudio4Dynamics.js",
  "FugsAudio5Switch.js",
  "FugsAudio6Aliases.js",
  "FugsAudio7Compat.js",
  "FugsAudio8Test.js",
];
const scenarioFiles = fs
  .readdirSync(path.join(root, "scripts", "tests"))
  .filter((f) => /\.test\.js$/.test(f))
  .sort()
  .map((f) => path.join("scripts", "tests", f));

let failed = 0;

function run(label, args, env) {
  console.log("\n=== " + label + " ===");
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: Object.assign({}, process.env, env || {}),
  });
  if (r.status !== 0) {
    failed++;
    console.error("FAILED: " + label);
  }
}

if (Number(process.versions.node.split(".")[0]) < 18) {
  console.error("verify-all needs Node 18 or newer (found " + process.version + ")");
  process.exit(1);
}

/**
 * Run `node --test` on the engine scenarios. Prints only a summary when everything passes and the
 * complete report when something fails (the raw TAP stream is several thousand lines).
 */
function runScenarios(label, env) {
  console.log("\n=== " + label + " ===");
  const [major, minor] = process.versions.node.split(".").map(Number);
  const reporter = major > 18 || (major === 18 && minor >= 15) ? ["--test-reporter=tap"] : [];
  const r = spawnSync(process.execPath, ["--test"].concat(reporter, scenarioFiles), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: Object.assign({}, process.env, env || {}),
  });
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.status === 0) {
    console.log(out.split(/\r?\n/).filter((l) => /^# (tests|suites|pass|fail|skipped|duration_ms)/.test(l)).join("\n"));
  } else {
    process.stdout.write(out);
    failed++;
    console.error("FAILED: " + label);
  }
}

for (const file of plugins) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error("Missing plugin: " + file);
    failed++;
    continue;
  }
  run("syntax " + file, ["--check", file]);
}

run("modular smoke", [path.join("scripts", "smoke.js")]);
run("bundle build + smoke", [path.join("scripts", "smoke-bundle.js")]);

// The bundle is rebuilt above, so this also scans the fresh dist file.
run("MV 1.6 compatibility scanner self-test", [path.join("scripts", "check-mv-compat.js"), "--self-test"]);
run("MV 1.6 (Chromium 65) syntax/API compatibility", [path.join("scripts", "check-mv-compat.js")]);

const realMZ = process.env.RMMZ_JS_DIR
  ? "+ real MZ scripts from " + process.env.RMMZ_JS_DIR
  : "(set RMMZ_JS_DIR to also run against real MZ scripts)";
runScenarios("engine scenarios: MV model + MZ model " + realMZ);
if (!fast) {
  runScenarios("engine scenarios against the all-in-one bundle", { HARNESS_BUNDLE: "1" });
}

console.log("\n==============================");
if (failed) {
  console.error("VERIFY FAILED (" + failed + " step(s))");
  process.exit(1);
}
console.log("VERIFY ALL PASSED");
process.exit(0);
