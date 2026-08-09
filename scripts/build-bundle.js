/**
 * Build a soft-transition all-in-one MV plugin (Option A).
 *
 * Output: dist/FugsMultiTrackAudioEX.bundle.js
 *
 * Concatenates Core + production satellites (no Docs playbook, no Test).
 * One Plugin Manager entry; params still read as FugsMultiTrackAudioEX /
 * FugsAudio1Core. Prefer the modular pack for development.
 *
 * Usage: node scripts/build-bundle.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const outFile = path.join(distDir, "FugsMultiTrackAudioEX.bundle.js");

const PARTS = [
  { file: "FugsMultiTrackAudioEX.js", role: "core" },
  { file: "FugsAudio2Effects.js", role: "satellite" },
  { file: "FugsAudio3Spatial.js", role: "satellite" },
  { file: "FugsAudio4Dynamics.js", role: "satellite" },
  { file: "FugsAudio5Switch.js", role: "satellite" },
  { file: "FugsAudio6Aliases.js", role: "satellite" },
  { file: "FugsAudio7Compat.js", role: "satellite" },
];

function stripPluginMeta(src) {
  // Remove //=== banner + /*: ... */ Plugin Manager block
  let out = src.replace(/^\/\/=+\/\/[\s\S]*?\n\/\*:[\s\S]*?\*\/\s*/m, "");
  out = out.replace(/^\/\*:[\s\S]*?\*\/\s*/m, "");
  return out.trim() + "\n";
}

function rewriteCoreHeader(src) {
  // Keep params; clarify this file is the all-in-one bundle.
  return src
    .replace(
      /@plugindesc[^\n]*/,
      "@plugindesc v2.2 Fugs MultiTrack Audio — ALL-IN-ONE BUNDLE (Core+Effects+Spatial+Dynamics+Switch+Aliases+Compat)"
    )
    .replace(
      /Fugs MultiTrack Audio — CORE/,
      "Fugs MultiTrack Audio — ALL-IN-ONE BUNDLE"
    )
    .replace(
      /Optional satellites \(load BELOW this plugin\):[\s\S]*?Load order tip:[^\n]*/,
      "This file is a concatenated soft-transition bundle.\n" +
        " * Prefer the modular pack (FugsMultiTrackAudioEX + FugsAudio2…7) for development.\n" +
        " * Docs: install FugsAudio0Docs separately. Dev tests: FugsAudio8Test separately.\n" +
        " * Do NOT also enable the individual satellite plugins when using this bundle."
    );
}

function main() {
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  const chunks = [];
  chunks.push(
    "//=======================================================================//\n" +
      "//            FugsMultiTrackAudioEX.bundle.js (GENERATED)               //\n" +
      "//  Do not edit — rebuild with: node scripts/build-bundle.js           //\n" +
      "//=======================================================================//\n"
  );

  for (const part of PARTS) {
    const full = path.join(root, part.file);
    if (!fs.existsSync(full)) {
      console.error("Missing: " + part.file);
      process.exit(1);
    }
    let src = fs.readFileSync(full, "utf8");
    if (part.role === "core") {
      src = rewriteCoreHeader(src);
      // Drop the original banner; we already wrote a generated one.
      src = src.replace(/^\/\/=+\/\/[\s\S]*?\/\/=+\/\/\s*/m, "");
      chunks.push(src.trim() + "\n");
    } else {
      chunks.push("\n/* ---- " + part.file + " ---- */\n");
      chunks.push(stripPluginMeta(src));
    }
  }

  const out = chunks.join("\n");
  fs.writeFileSync(outFile, out, "utf8");
  const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(1);
  console.log("Wrote " + path.relative(root, outFile) + " (" + kb + " KB)");
  console.log("Parts: " + PARTS.map((p) => p.file).join(" + "));
}

main();
