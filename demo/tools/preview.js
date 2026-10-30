/**
 * Render the Sound Garden map (tiles + event sprites) to demo/garden-map.png, for the README
 * and for checking map edits without opening the editor.  Usage: node demo/tools/preview.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { Canvas } = require("./png");
const { drawAll, IMAGES } = require("./art");
const { buildGarden } = require("./garden");

const T = 48;
const sheets = {};
for (const [, name, canvas] of drawAll()) sheets[name] = canvas;
const map = buildGarden("mz");
const out = new Canvas(map.width * T, map.height * T);

function blit(src, sx, sy, dx, dy) {
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const i = ((sy + y) * src.w + sx + x) * 4;
      if (src.px[i + 3]) out.set(dx + x, dy + y, [src.px[i], src.px[i + 1], src.px[i + 2], src.px[i + 3]]);
    }
}
function tile(id, dx, dy) {
  if (id >= 1536 && id < 2048) {
    const n = id - 1536;
    blit(sheets[IMAGES.tilesetA5], (n % 8) * T, Math.floor(n / 8) * T, dx, dy);
  } else if (id > 0 && id < 256) {
    blit(sheets[IMAGES.tilesetB], ((Math.floor(id / 128) % 2) * 8 + (id % 8)) * T, (Math.floor(id / 8) % 16) * T, dx, dy);
  }
}
const at = (x, y, z) => map.data[(z * map.height + y) * map.width + x];
for (const z of [0, 1, 2])
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) tile(at(x, y, z), x * T, y * T);
for (const ev of map.events.filter(Boolean)) {
  const img = ev.pages[0].image;
  if (!img.characterName) continue;
  const sheet = sheets[img.characterName];
  const bx = (img.characterIndex % 4) * 3 * T, by = Math.floor(img.characterIndex / 4) * 4 * T;
  const lift = img.characterName.startsWith("!") ? 0 : 6;
  blit(sheet, bx + img.pattern * T, by + (img.direction / 2 - 1) * T, ev.x * T, ev.y * T - lift);
}
for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) tile(at(x, y, 3), x * T, y * T);
const file = path.resolve(__dirname, "..", "garden-map.png");
fs.writeFileSync(file, out.toPNG());
console.log("wrote " + path.relative(process.cwd(), file));
