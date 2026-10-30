/**
 * Minimal RGBA canvas + PNG encoder (Node built-ins only), used to draw the demo's tiles and
 * sprites from code.
 */
"use strict";

const zlib = require("zlib");

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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** "#rrggbb" or "#rrggbbaa" -> [r,g,b,a] */
function rgba(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4, 6].map((i) => (i < h.length ? parseInt(h.slice(i, i + 2), 16) : 255));
}

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
  }
  /** Alpha-blended pixel write. */
  set(x, y, color) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const k0 = this.clip;
    if (k0 && (x < k0.x || y < k0.y || x >= k0.x + k0.w || y >= k0.y + k0.h)) return;
    const [r, g, b, a] = typeof color === "string" ? rgba(color) : color;
    const i = (y * this.w + x) * 4, k = a / 255, ia = this.px[i + 3] / 255;
    const oa = k + ia * (1 - k);
    if (oa === 0) return;
    for (const [j, v] of [[0, r], [1, g], [2, b]]) this.px[i + j] = (v * k + this.px[i + j] * ia * (1 - k)) / oa;
    this.px[i + 3] = oa * 255;
  }
  rect(x, y, w, h, color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }
  ellipse(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, color);
      }
  }
  /** Filled polygon (even-odd scanline). pts = [[x,y],...] */
  poly(pts, color) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        const yc = y + 0.5;
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, color);
    }
  }
  line(x1, y1, x2, y2, color, width) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2 + 1, w = width || 1;
    for (let s = 0; s <= steps; s++) {
      const x = x1 + ((x2 - x1) * s) / steps, y = y1 + ((y2 - y1) * s) / steps;
      this.rect(Math.round(x - w / 2), Math.round(y - w / 2), w, w, color);
    }
  }
  /** Darken a 1px outline around every opaque area inside the box (sprite readability). */
  outline(x0, y0, w, h, color) {
    const solid = (x, y) => x >= x0 && y >= y0 && x < x0 + w && y < y0 + h && this.px[(y * this.w + x) * 4 + 3] > 100;
    const marks = [];
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) marks.push([x, y]);
    for (const [x, y] of marks) this.set(x, y, color);
  }
  toPNG() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 4 + 1)] = 0;
      Buffer.from(this.px.buffer, y * this.w * 4, this.w * 4).copy(raw, y * (this.w * 4 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

module.exports = { Canvas, rgba };
