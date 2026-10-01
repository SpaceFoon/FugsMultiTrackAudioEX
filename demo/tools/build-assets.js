/**
 * Regenerate the demo's audio and images into demo/game/ from code.
 *
 *   node demo/tools/build-assets.js            (needs ffmpeg with libvorbis on PATH)
 *   docker build -t fugs-demo demo && docker run --rm -v "$PWD:/repo" fugs-demo
 *
 * The generated files are committed, so you only need this after changing synth.js or art.js.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { SR, SOUNDS } = require("./synth");
const { drawAll } = require("./art");

const out = path.resolve(__dirname, "..", "game");
const only = process.argv.slice(2); // optional: names to rebuild

function wav(data) {
  const pcm = Buffer.alloc(data.length * 2);
  for (let i = 0; i < data.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y"].concat(args), { stdio: "inherit" });
  if (r.error || r.status !== 0) throw new Error("ffmpeg failed (is it installed with libvorbis?): " + args.join(" "));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fugs-demo-"));
try {
  for (const [folder, name, render] of SOUNDS) {
    if (only.length && !only.includes(name)) continue;
    const dir = path.join(out, "audio", folder);
    fs.mkdirSync(dir, { recursive: true });
    const w = path.join(tmp, name + ".wav");
    fs.writeFileSync(w, wav(render()));
    // .ogg for MZ and MV; .m4a only matters for MV web builds on browsers without Ogg support
    ffmpeg(["-i", w, "-c:a", "libvorbis", "-q:a", "4", "-map_metadata", "-1", path.join(dir, name + ".ogg")]);
    ffmpeg(["-i", w, "-c:a", "aac", "-b:a", "96k", "-map_metadata", "-1", path.join(dir, name + ".m4a")]);
    console.log("audio/" + folder + "/" + name);
  }
  for (const [folder, name, canvas] of drawAll()) {
    if (only.length && !only.includes(name)) continue;
    fs.mkdirSync(path.join(out, folder), { recursive: true });
    fs.writeFileSync(path.join(out, folder, name + ".png"), canvas.toPNG());
    console.log(folder + "/" + name);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
