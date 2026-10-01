/**
 * Original pixel art for the Sound Garden demo, drawn from code: one ground sheet (A5), one
 * decoration sheet (B), a sheet of villagers and a sheet of animated props. Same 48 px grid and
 * sheet layouts as RPG Maker MV/MZ, so the files drop straight into img/tilesets and
 * img/characters. Everything is GPL-3.0 like the rest of the repo.
 */
"use strict";

const { Canvas } = require("./png");

const T = 48;
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// ---------------------------------------------------------------- tile ids
/** A5 ground tiles: tileId = 1536 + index. `solid` = impassable. */
const GROUND = {
  GRASS: { i: 0, solid: false },
  FLOWERS: { i: 1, solid: false },
  GRAVEL: { i: 2, solid: false },
  PLAZA: { i: 3, solid: false },
  CAVE: { i: 4, solid: false },
  WATER: { i: 5, solid: true },
  CLIFF: { i: 6, solid: true },
  HEDGE: { i: 7, solid: true },
  DECK: { i: 8, solid: false },
};
/** B decorations: tileId = index (0 is the engine's "nothing"). flag: 0 walkable, 15 solid, 16 drawn above the player. */
const DECOR = {
  TREE_TOP: { i: 1, flag: 0x10 },
  TREE_TRUNK: { i: 2, flag: 0x0f },
  BUSH: { i: 3, flag: 0x0f },
  BOULDER: { i: 4, flag: 0x0f },
  TUFT: { i: 5, flag: 0x00 },
  STALAGMITE: { i: 6, flag: 0x0f },
  MUSHROOMS: { i: 7, flag: 0x00 },
  FENCE: { i: 8, flag: 0x0f },
  CAVE_ARCH: { i: 9, flag: 0x10 },
};
const A5 = (name) => 1536 + GROUND[name].i;
const B = (name) => DECOR[name].i;

// -------------------------------------------------------------- textures
function speckle(c, x0, y0, base, dots, seed, density) {
  const r = rng(seed);
  c.rect(x0, y0, T, T, base);
  for (let k = 0; k < T * T * density; k++) {
    const col = dots[Math.floor(r() * dots.length)];
    c.rect(x0 + Math.floor(r() * T), y0 + Math.floor(r() * T), 1 + Math.floor(r() * 2), 1, col);
  }
}
function drawGround(c, name, x0, y0) {
  const r = rng(GROUND[name].i * 97 + 5);
  switch (name) {
    case "GRASS":
      speckle(c, x0, y0, "#5d9e45", ["#4f8c3a", "#6fb553", "#78bf5b"], 1, 0.12);
      for (let k = 0; k < 10; k++) {
        const x = x0 + 2 + Math.floor(r() * 44), y = y0 + 4 + Math.floor(r() * 42);
        c.rect(x, y - 3, 1, 3, "#437a31");
        c.rect(x + 2, y - 2, 1, 2, "#437a31");
      }
      break;
    case "FLOWERS":
      drawGround(c, "GRASS", x0, y0);
      for (let k = 0; k < 6; k++) {
        const x = x0 + 5 + Math.floor(r() * 38), y = y0 + 5 + Math.floor(r() * 38);
        const col = ["#f4e04d", "#f08ab4", "#ffffff", "#9fc3ff"][k % 4];
        c.rect(x - 1, y, 3, 1, col);
        c.rect(x, y - 1, 1, 3, col);
        c.set(x, y, "#e8a33a");
      }
      break;
    case "GRAVEL":
      speckle(c, x0, y0, "#b5a283", ["#9c8a6b", "#cbb995", "#8a7a5e", "#d8c9a8"], 2, 0.35);
      break;
    case "PLAZA":
      c.rect(x0, y0, T, T, "#a9a49a");
      for (const [x, y, w, h] of [[0, 0, 24, 24], [24, 0, 24, 24], [0, 24, 24, 24], [24, 24, 24, 24]]) {
        c.rect(x0 + x + 1, y0 + y + 1, w - 2, h - 2, "#bdb8ad");
        c.rect(x0 + x + 1, y0 + y + h - 3, w - 2, 2, "#9b968c");
      }
      break;
    case "CAVE":
      speckle(c, x0, y0, "#4b4652", ["#403b47", "#57525e", "#38343e"], 3, 0.25);
      break;
    case "WATER":
      c.rect(x0, y0, T, T, "#3f7fc4");
      for (let k = 0; k < 7; k++) {
        const x = x0 + Math.floor(r() * 40), y = y0 + 3 + Math.floor(r() * 42);
        c.rect(x, y, 6 + Math.floor(r() * 4), 1, "#7fb2e8");
      }
      break;
    case "CLIFF":
      c.rect(x0, y0, T, T, "#6b5f55");
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 3; col++) {
          const off = row % 2 ? 8 : 0;
          c.rect(x0 + col * 16 + off - 6, y0 + row * 12 + 1, 14, 10, "#7d7064");
          c.rect(x0 + col * 16 + off - 6, y0 + row * 12 + 9, 14, 2, "#544a42");
        }
      break;
    case "HEDGE":
      c.rect(x0, y0, T, T, "#2f6b2c");
      for (let k = 0; k < 14; k++) c.ellipse(x0 + 4 + r() * 40, y0 + 4 + r() * 40, 7, 6, k % 2 ? "#3c8238" : "#2a5f27");
      break;
    case "DECK":
      c.rect(x0, y0, T, T, "#a0703f");
      for (let y = 0; y < T; y += 12) {
        c.rect(x0, y0 + y + 10, T, 2, "#7a5330");
        c.rect(x0 + ((y / 12) % 2 ? 30 : 14), y0 + y, 1, 10, "#7a5330");
      }
      break;
  }
}
function drawDecor(c, name, x0, y0) {
  const r = rng(DECOR[name].i * 31 + 7);
  switch (name) {
    case "TREE_TOP":
      c.ellipse(x0 + 24, y0 + 30, 22, 18, "#2e6e2b");
      c.ellipse(x0 + 20, y0 + 24, 14, 12, "#3f8a39");
      c.ellipse(x0 + 30, y0 + 34, 12, 9, "#357c31");
      for (let k = 0; k < 12; k++) c.rect(x0 + 8 + r() * 30, y0 + 16 + r() * 26, 2, 2, "#5aa84f");
      c.ellipse(x0 + 24, y0 + 47, 18, 6, "#2e6e2b");
      break;
    case "TREE_TRUNK":
      c.ellipse(x0 + 24, y0 + 6, 18, 8, "#2e6e2b");
      c.ellipse(x0 + 24, y0 + 42, 12, 4, "#00000040");
      c.rect(x0 + 18, y0 + 8, 12, 34, "#6b4a2c");
      c.rect(x0 + 18, y0 + 8, 3, 34, "#83603b");
      c.rect(x0 + 26, y0 + 8, 2, 34, "#523820");
      break;
    case "BUSH":
      c.ellipse(x0 + 24, y0 + 42, 16, 4, "#00000040");
      c.ellipse(x0 + 24, y0 + 28, 18, 14, "#2f7a2e");
      c.ellipse(x0 + 18, y0 + 24, 9, 8, "#43943d");
      c.rect(x0 + 28, y0 + 22, 3, 3, "#e05050");
      c.rect(x0 + 16, y0 + 31, 3, 3, "#e05050");
      break;
    case "BOULDER":
      c.ellipse(x0 + 24, y0 + 42, 17, 5, "#00000040");
      c.ellipse(x0 + 24, y0 + 30, 18, 14, "#8a857e");
      c.ellipse(x0 + 19, y0 + 25, 8, 6, "#a6a199");
      break;
    case "TUFT":
      for (let k = 0; k < 7; k++) {
        const x = x0 + 12 + r() * 24, y = y0 + 22 + r() * 18;
        c.line(x, y, x - 2, y - 7, "#3f7d2f");
        c.line(x, y, x + 2, y - 8, "#4f9a3b");
      }
      break;
    case "STALAGMITE":
      c.ellipse(x0 + 24, y0 + 43, 13, 4, "#00000060");
      c.poly([[x0 + 14, y0 + 44], [x0 + 34, y0 + 44], [x0 + 26, y0 + 8], [x0 + 22, y0 + 8]], "#6f6878");
      c.poly([[x0 + 16, y0 + 44], [x0 + 22, y0 + 44], [x0 + 23, y0 + 10]], "#857e8e");
      break;
    case "MUSHROOMS":
      for (const [x, y, s] of [[18, 34, 6], [30, 30, 5], [24, 40, 4]]) {
        c.rect(x0 + x - 1, y0 + y, 3, 6, "#e8dcc8");
        c.ellipse(x0 + x, y0 + y, s, s * 0.6, "#5fd0e0");
        c.set(x0 + x - 2, y0 + y - 1, "#c8f6ff");
      }
      break;
    case "FENCE":
      c.rect(x0, y0 + 20, T, 4, "#8b6038");
      c.rect(x0, y0 + 32, T, 4, "#8b6038");
      for (const x of [6, 38]) c.rect(x0 + x, y0 + 14, 5, 28, "#6b4a2c");
      break;
    case "CAVE_ARCH":
      c.rect(x0, y0, T, 14, "#544a42");
      c.rect(x0, y0 + 10, T, 4, "#3d3530");
      break;
  }
}

/** Tilesets.json "flags" for this tileset (8192 entries, indexed by tileId). */
function tilesetFlags() {
  const flags = new Array(8192).fill(0);
  for (let i = 0; i < 256; i++) flags[i] = 0x10; // empty B tiles: no effect on passage
  for (const d of Object.values(DECOR)) flags[d.i] = d.flag;
  for (const g of Object.values(GROUND)) flags[1536 + g.i] = g.solid ? 0x0f : 0;
  return flags;
}

function drawTilesets() {
  const a5 = new Canvas(8 * T, 16 * T);
  for (const [name, g] of Object.entries(GROUND)) {
    const x = (g.i % 8) * T, y = Math.floor(g.i / 8) * T;
    a5.clip = { x, y, w: T, h: T }; // keep every tile's texture inside its own cell
    drawGround(a5, name, x, y);
  }
  a5.clip = null;
  const b = new Canvas(16 * T, 16 * T);
  for (const [name, d] of Object.entries(DECOR)) {
    const sx = (Math.floor(d.i / 128) % 2) * 8 + (d.i % 8), sy = Math.floor((d.i % 256) / 8) % 16;
    b.clip = { x: sx * T, y: sy * T, w: T, h: T };
    drawDecor(b, name, sx * T, sy * T);
  }
  b.clip = null;
  return { A5: a5, B: b };
}

// ------------------------------------------------------------- characters
// Character sheets: 4 x 2 blocks of 3 frames x 4 directions (down, left, right, up).
const DIRS = ["down", "left", "right", "up"];
function eachFrame(c, block, fn) {
  const bx = (block % 4) * 3 * T, by = Math.floor(block / 4) * 4 * T;
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < 3; f++) fn(bx + f * T, by + row * T, dir, f, row);
  });
}

/** Villagers. Indices match FOLK below. */
const FOLK = { CONDUCTOR: 0, WIZARD: 1, STORYTELLER: 2, GUIDE: 3, SLIME: 4, MONK: 5, KID: 6, RADIO_HOST: 7 };
const LOOKS = [
  { coat: "#b8323a", trim: "#f2d16b", hair: "#3a2a20", hat: "top" },
  { coat: "#6b3fa8", trim: "#e8c95a", hair: "#d8d8e8", hat: "wizard", beard: "#e8e8f0" },
  { coat: "#3d7a46", trim: "#c9a46a", hair: "#e8e8e8", hat: null, beard: "#f0f0f0" },
  { coat: "#2f6fb0", trim: "#f0f0f0", hair: "#8a5a2b", hat: "straw" },
  null, // slime
  { coat: "#d9822b", trim: "#7a3b12", hair: null, hat: null },
  { coat: "#e0b23a", trim: "#9a6a1a", hair: "#5a3520", hat: "cap" },
  { coat: "#2b2b38", trim: "#e05a8a", hair: "#e05a8a", hat: "phones" },
];
function drawPerson(c, x, y, dir, f, look) {
  const step = f === 1 ? 0 : f === 0 ? -1 : 1;
  c.ellipse(x + 24, y + 44, 10, 3, "#00000050");
  // legs
  const lx = dir === "left" || dir === "right" ? [21, 25] : [19, 26];
  c.rect(x + lx[0], y + 36 + (step < 0 ? -2 : 0), 4, 7, "#3a3040");
  c.rect(x + lx[1], y + 36 + (step > 0 ? -2 : 0), 4, 7, "#3a3040");
  // robe
  c.poly([[x + 15, y + 40], [x + 33, y + 40], [x + 30, y + 23], [x + 18, y + 23]], look.coat);
  c.rect(x + 18, y + 23, 12, 2, look.trim);
  if (dir === "down") c.rect(x + 23, y + 25, 2, 15, look.trim);
  // arms (swing with the step)
  if (dir !== "right") c.rect(x + 13, y + 25 + step, 4, 10, look.coat);
  if (dir !== "left") c.rect(x + 31, y + 25 - step, 4, 10, look.coat);
  // head
  c.ellipse(x + 24, y + 16, 8, 8, "#f1c9a0");
  if (look.hair) {
    if (dir === "up") c.ellipse(x + 24, y + 15, 8, 8, look.hair);
    else c.rect(x + 16, y + 8, 16, 4, look.hair);
    if (dir === "left") c.rect(x + 26, y + 9, 6, 9, look.hair);
    if (dir === "right") c.rect(x + 16, y + 9, 6, 9, look.hair);
  }
  if (look.beard && dir !== "up") c.poly([[x + 18, y + 18], [x + 30, y + 18], [x + 24, y + 30]], look.beard);
  const eye = "#2a2030";
  if (dir === "down") { c.rect(x + 20, y + 16, 2, 3, eye); c.rect(x + 26, y + 16, 2, 3, eye); }
  if (dir === "left") c.rect(x + 18, y + 16, 2, 3, eye);
  if (dir === "right") c.rect(x + 28, y + 16, 2, 3, eye);
  // hats
  if (look.hat === "top") { c.rect(x + 15, y + 8, 18, 3, "#1e1e24"); c.rect(x + 18, y - 1, 12, 10, "#1e1e24"); c.rect(x + 18, y + 6, 12, 2, look.trim); }
  if (look.hat === "wizard") { c.ellipse(x + 24, y + 9, 13, 3, look.coat); c.poly([[x + 15, y + 9], [x + 33, y + 9], [x + 27, y - 4]], look.coat); c.set(x + 22, y + 4, look.trim); c.set(x + 26, y + 1, look.trim); }
  if (look.hat === "straw") { c.ellipse(x + 24, y + 9, 15, 4, "#e6c66e"); c.ellipse(x + 24, y + 6, 8, 5, "#e6c66e"); c.rect(x + 16, y + 7, 16, 2, "#b8323a"); }
  if (look.hat === "cap") { c.ellipse(x + 24, y + 9, 9, 5, "#2f6fb0"); if (dir === "down") c.rect(x + 18, y + 11, 12, 2, "#2f6fb0"); }
  if (look.hat === "phones") { c.line(x + 15, y + 14, x + 24, y + 6, "#20202a", 2); c.line(x + 24, y + 6, x + 33, y + 14, "#20202a", 2); if (dir !== "right") c.rect(x + 14, y + 13, 4, 6, "#e05a8a"); if (dir !== "left") c.rect(x + 30, y + 13, 4, 6, "#e05a8a"); }
}
function drawSlime(c, x, y, dir, f) {
  const squash = [0, 2, 0][f];
  c.ellipse(x + 24, y + 43, 13, 3, "#00000050");
  c.ellipse(x + 24, y + 33 + squash / 2, 14 + squash, 11 - squash, "#4aa3e0");
  c.ellipse(x + 20, y + 29, 5, 3, "#a8dcff");
  if (dir !== "up") {
    const ox = dir === "left" ? -5 : dir === "right" ? 5 : 0;
    c.rect(x + 19 + ox, y + 32, 3, 4, "#1c2a40");
    c.rect(x + 27 + ox, y + 32, 3, 4, "#1c2a40");
  }
}
function drawFolk() {
  const c = new Canvas(12 * T, 8 * T);
  LOOKS.forEach((look, k) =>
    eachFrame(c, k, (x, y, dir, f) => (look ? drawPerson(c, x, y, dir, f, look) : drawSlime(c, x, y, dir, f)))
  );
  for (let k = 0; k < 8; k++) c.outline((k % 4) * 3 * T, Math.floor(k / 4) * 4 * T, 3 * T, 4 * T, "#1a1420c0");
  return c;
}

/** Props sheet (file name starts with "!" so the engine does not lift them 6 px). */
const PROP = { CAMPFIRE: 0, RADIO: 1, BEE: 2, LEVER: 3, CRYSTAL: 4, CHEST: 5, SHRINE: 6, CHIMES: 7 };
function drawProps() {
  const c = new Canvas(12 * T, 8 * T);
  eachFrame(c, PROP.CAMPFIRE, (x, y, dir, f) => {
    c.ellipse(x + 24, y + 40, 15, 5, "#5a4a3a");
    c.line(x + 12, y + 41, x + 36, y + 35, "#6b4a2c", 4);
    c.line(x + 12, y + 35, x + 36, y + 41, "#83603b", 4);
    const h = [20, 24, 18][f], w = [9, 8, 10][f];
    c.poly([[x + 24 - w, y + 37], [x + 24 + w, y + 37], [x + 24 + (f - 1) * 3, y + 37 - h]], "#f08a24");
    c.poly([[x + 24 - w / 2, y + 37], [x + 24 + w / 2, y + 37], [x + 24 - (f - 1) * 2, y + 37 - h * 0.6]], "#ffd34a");
    c.rect(x + 18 + f * 4, y + 12 + f, 2, 2, "#ffb04a");
  });
  eachFrame(c, PROP.RADIO, (x, y, dir, f) => {
    c.ellipse(x + 24, y + 42, 14, 3, "#00000050");
    c.rect(x + 11, y + 22, 26, 19, "#8a3b2a");
    c.rect(x + 13, y + 24, 22, 15, "#b85a3a");
    c.ellipse(x + 19, y + 31, 5, 5, "#3a2a24");
    c.rect(x + 27, y + 26, 6, 2, "#f0e0b0");
    c.rect(x + 27, y + 31, 6, 2, "#f0e0b0");
    c.line(x + 33, y + 22, x + 38, y + 10, "#c0c0c8");
    const ny = [8, 4, 6][f], nx = [6, 4, 8][f];
    c.ellipse(x + nx + 2, y + ny + 9, 2.5, 2, "#1e1e24");
    c.rect(x + nx + 4, y + ny, 1, 9, "#1e1e24");
    c.rect(x + nx + 4, y + ny, 4, 1, "#1e1e24");
  });
  eachFrame(c, PROP.BEE, (x, y, dir, f) => {
    c.ellipse(x + 24, y + 44, 6, 2, "#00000040");
    const side = dir === "left" || dir === "right";
    c.ellipse(x + 24, y + 22, side ? 9 : 7, 7, "#f2c230");
    c.rect(x + (side ? 20 : 18), y + 18, 2, 9, "#2a2020");
    c.rect(x + (side ? 25 : 24), y + 17, 2, 10, "#2a2020");
    const flap = f === 1 ? 2 : -2;
    c.ellipse(x + 17, y + 13 + flap, 6, 4, "#e8f6ffd0");
    c.ellipse(x + 31, y + 13 + flap, 6, 4, "#e8f6ffd0");
    if (dir === "down") { c.set(x + 21, y + 22, "#000"); c.set(x + 27, y + 22, "#000"); }
    if (dir === "left") c.set(x + 17, y + 21, "#000");
    if (dir === "right") c.set(x + 31, y + 21, "#000");
  });
  eachFrame(c, PROP.LEVER, (x, y, dir, f, row) => {
    // row 0 (down) = OFF, row 3 (up) = ON
    c.ellipse(x + 24, y + 42, 13, 3, "#00000050");
    c.rect(x + 14, y + 32, 20, 10, "#5a5f6a");
    c.rect(x + 14, y + 32, 20, 2, "#7a808c");
    const on = row === 3, tipX = on ? 33 : 15;
    c.line(x + 24, y + 33, x + tipX, y + 16, "#3a3a40", 3);
    c.ellipse(x + tipX, y + 15, 4, 4, on ? "#3ac060" : "#d04040");
  });
  eachFrame(c, PROP.CRYSTAL, (x, y, dir, f) => {
    c.ellipse(x + 24, y + 43, 11, 3, "#00000050");
    c.poly([[x + 24, y + 4 + f], [x + 34, y + 22], [x + 24, y + 42], [x + 14, y + 22]], "#5ac8f0");
    c.poly([[x + 24, y + 4 + f], [x + 24, y + 42], [x + 14, y + 22]], "#8ee0ff");
    c.rect(x + 19 + f * 3, y + 14 + f * 4, 2, 2, "#ffffff");
  });
  eachFrame(c, PROP.CHEST, (x, y, dir, f, row) => {
    const open = row === 3 || (row > 0 && f === 2);
    c.ellipse(x + 24, y + 42, 15, 3, "#00000050");
    c.rect(x + 10, y + 24, 28, 17, "#8b5a2b");
    c.rect(x + 10, y + 30, 28, 3, "#d8b040");
    if (open) {
      c.rect(x + 10, y + 13, 28, 9, "#6b4220");
      c.rect(x + 13, y + 22, 22, 4, "#2a1a10");
      c.rect(x + 19, y + 20, 10, 3, "#ffd84a");
    } else {
      c.rect(x + 10, y + 18, 28, 8, "#a06a34");
      c.rect(x + 22, y + 26, 4, 6, "#ffd84a");
    }
  });
  eachFrame(c, PROP.SHRINE, (x, y, dir, f) => {
    c.ellipse(x + 24, y + 43, 14, 4, "#00000050");
    c.rect(x + 13, y + 10, 22, 32, "#8a8f9a");
    c.ellipse(x + 24, y + 11, 11, 5, "#8a8f9a");
    c.rect(x + 13, y + 38, 22, 4, "#6f7480");
    const glow = ["#7ad0ff", "#b0e8ff", "#7ad0ff"][f];
    c.ellipse(x + 24, y + 24, 6, 6, glow);
    c.ellipse(x + 24, y + 24, 3, 3, "#ffffff");
  });
  eachFrame(c, PROP.CHIMES, (x, y, dir, f) => {
    c.ellipse(x + 24, y + 43, 10, 3, "#00000050");
    c.rect(x + 22, y + 6, 4, 37, "#6b4a2c");
    c.rect(x + 12, y + 8, 24, 3, "#83603b");
    [14, 20, 28, 34].forEach((cx, k) => {
      const sway = ((f + k) % 3) - 1;
      c.line(x + cx, y + 11, x + cx + sway, y + 15, "#202020");
      c.rect(x + cx - 1 + sway, y + 15, 3, 8 + (k % 2) * 4, "#d0d4dc");
    });
  });
  for (let k = 0; k < 8; k++) c.outline((k % 4) * 3 * T, Math.floor(k / 4) * 4 * T, 3 * T, 4 * T, "#1a1420a0");
  return c;
}

const IMAGES = {
  tilesetA5: "FugsGarden_A5",
  tilesetB: "FugsGarden_B",
  folk: "FugsGardenFolk",
  props: "!FugsGardenProps",
};

function drawAll() {
  const ts = drawTilesets();
  return [
    ["img/tilesets", IMAGES.tilesetA5, ts.A5],
    ["img/tilesets", IMAGES.tilesetB, ts.B],
    ["img/characters", IMAGES.folk, drawFolk()],
    ["img/characters", IMAGES.props, drawProps()],
  ];
}

module.exports = { GROUND, DECOR, A5, B, FOLK, PROP, IMAGES, tilesetFlags, drawAll };
