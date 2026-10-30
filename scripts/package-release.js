/**
 * Build the release zip for the plugin pack. No dependencies (Node 18+).
 *
 * Usage: node scripts/package-release.js <version> [--out <dir>]
 *   e.g. node scripts/package-release.js 2.3.0   ->  release/FugsMultiTrackAudioEX-v2.3.0.zip
 *
 * Rebuilds dist/FugsMultiTrackAudioEX.bundle.js first, and refuses to package when a plugin's
 * @plugindesc version does not match <version> (2.3.0 needs "v2.3"). Run the tests first:
 * the Docker image's "release" command (see Dockerfile) runs verify-all.js and then this script.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const SHORT_NAME = "FugsMultiTrackAudioEX";

const PLUGINS = [
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
const FILES = PLUGINS.concat(["dist/FugsMultiTrackAudioEX.bundle.js", "LICENSE", "README.md"]);

const INSTALL_NOTES = [
  "Fugs MultiTrack Audio EX v{VERSION} - RPG Maker MV 1.6+ and MZ",
  "",
  "1. Copy the FugsAudio*.js files and FugsMultiTrackAudioEX.js into your project's js/plugins/.",
  "2. Enable Core (FugsMultiTrackAudioEX.js) first in Plugin Manager.",
  "3. Enable FugsAudio0Docs for the in-editor playbook.",
  "4. Enable optional satellites 2-7 as needed. Put FugsAudio7Compat after OcRam if used.",
  "5. Do not enable the all-in-one bundle (dist/) and satellites 2-7 at the same time.",
  "6. Keep FugsAudio8Test off in shipped builds.",
  "",
  "Full guide: README.md",
  "",
].join("\r\n");

function fail(msg) {
  console.error("package-release: " + msg);
  process.exit(1);
}

// ---- arguments ---------------------------------------------------------------------------------
const args = process.argv.slice(2);
const version = String(args[0] || "").replace(/^v/i, "");
if (!/^\d+\.\d+(\.\d+)?$/.test(version)) fail("usage: node scripts/package-release.js <version> [--out <dir>]");
const outIdx = args.indexOf("--out");
const outDir = path.resolve(outIdx > -1 && args[outIdx + 1] ? args[outIdx + 1] : path.join(root, "release"));

// ---- checks ------------------------------------------------------------------------------------
const majorMinor = version.split(".").slice(0, 2).join(".");
const wrong = [];
for (const file of PLUGINS) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  const m = /@plugindesc\s+v(\d+\.\d+)/.exec(src);
  if (!m || m[1] !== majorMinor) wrong.push(`${file} (${m ? "v" + m[1] : "no version"})`);
}
if (wrong.length) fail(`plugin headers do not say v${majorMinor}: ${wrong.join(", ")}`);

const built = spawnSync(process.execPath, [path.join("scripts", "build-bundle.js")], { cwd: root, encoding: "utf8" });
if (built.status !== 0) fail("bundle build failed:\n" + (built.stdout || "") + (built.stderr || ""));

// ---- zip writer (deflate, no external tools) ---------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed timestamp (2000-01-01 00:00) so the same sources always give the same zip bytes.
const DOS_TIME = 0;
const DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1;

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + packed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat(centrals, [end]));
}

// ---- package -----------------------------------------------------------------------------------
const folder = `${SHORT_NAME}-v${version}/`;
const entries = FILES.map((file) => ({ name: folder + file, data: fs.readFileSync(path.join(root, file)) }));
entries.push({ name: folder + "INSTALL.txt", data: Buffer.from(INSTALL_NOTES.replace("{VERSION}", version), "utf8") });

fs.mkdirSync(outDir, { recursive: true });
const zipPath = path.join(outDir, `${SHORT_NAME}-v${version}.zip`);
fs.writeFileSync(zipPath, buildZip(entries));
console.log(`Wrote ${zipPath} (${entries.length} files, ${fs.statSync(zipPath).size} bytes)`);
