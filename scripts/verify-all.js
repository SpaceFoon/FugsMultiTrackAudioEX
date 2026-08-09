/**
 * Full offline verification gate for the modular pack.
 * Usage: node scripts/verify-all.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
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

let failed = 0;

function run(label, args) {
  console.log("\n=== " + label + " ===");
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (r.status !== 0) {
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

console.log("\n==============================");
if (failed) {
  console.error("VERIFY FAILED (" + failed + " step(s))");
  process.exit(1);
}
console.log("VERIFY ALL PASSED");
process.exit(0);
