import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'icons');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function blend(rgba, size, x, y, r, g, b, a) {
  if (a <= 0) return;
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= size || py >= size) return;
  const i = (py * size + px) * 4;
  const sa = Math.min(1, a);
  const inv = 1 - sa;
  rgba[i] = Math.round(r * sa + rgba[i] * inv);
  rgba[i + 1] = Math.round(g * sa + rgba[i + 1] * inv);
  rgba[i + 2] = Math.round(b * sa + rgba[i + 2] * inv);
  rgba[i + 3] = 255;
}

function fillCircle(rgba, size, cx, cy, radius, r, g, b, alpha = 1) {
  const minX = Math.max(0, Math.floor(cx - radius - 1));
  const maxX = Math.min(size - 1, Math.ceil(cx + radius + 1));
  const minY = Math.max(0, Math.floor(cy - radius - 1));
  const maxY = Math.min(size - 1, Math.ceil(cy + radius + 1));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      const edge = radius - dist;
      if (edge > 0) blend(rgba, size, x, y, r, g, b, alpha * Math.min(1, edge));
    }
  }
}

function strokeCircle(rgba, size, cx, cy, radius, width, r, g, b, alpha = 1) {
  const pad = width / 2 + 1;
  const minX = Math.max(0, Math.floor(cx - radius - pad));
  const maxX = Math.min(size - 1, Math.ceil(cx + radius + pad));
  const minY = Math.max(0, Math.floor(cy - radius - pad));
  const maxY = Math.min(size - 1, Math.ceil(cy + radius + pad));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      const edge = width / 2 - Math.abs(dist - radius);
      if (edge > 0) blend(rgba, size, x, y, r, g, b, alpha * Math.min(1, edge));
    }
  }
}

function drawIcon(size, safeScale) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const reach = (size / 2) * safeScale;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const dist = Math.hypot(x - cx, y - cy) / (size / 2);
      const glow = Math.max(0, 1 - dist * 1.15);
      rgba[i] = Math.round(12 + glow * 18);
      rgba[i + 1] = Math.round(18 + glow * 36);
      rgba[i + 2] = Math.round(32 + glow * 52);
      rgba[i + 3] = 255;
    }
  }

  const rings = [0.36, 0.58, 0.8];
  const stroke = Math.max(size * 0.012, 1.6);
  for (const ring of rings) {
    strokeCircle(rgba, size, cx, cy, reach * ring, stroke, 56, 189, 248, ring === 0.8 ? 0.55 : 0.9);
  }

  const inner = [
    [0, -0.36],
    [0.36, 0],
    [0, 0.36],
    [-0.36, 0],
  ];
  for (const [nx, ny] of inner) {
    const x = cx + nx * reach;
    const y = cy + ny * reach;
    const steps = Math.max(8, Math.hypot(x - cx, y - cy));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const px = cx + (x - cx) * t;
      const py = cy + (y - cy) * t;
      blend(rgba, size, px, py, 125, 211, 252, 0.95);
      blend(rgba, size, px + 1, py, 125, 211, 252, 0.45);
      blend(rgba, size, px - 1, py, 125, 211, 252, 0.45);
    }
    fillCircle(rgba, size, x, y, Math.max(size * 0.045, 2.2), 224, 242, 254, 1);
    fillCircle(rgba, size, x, y, Math.max(size * 0.02, 1.2), 14, 165, 233, 1);
  }

  const outerCount = 6;
  for (let n = 0; n < outerCount; n += 1) {
    const angle = -Math.PI / 2 + (n * Math.PI * 2) / outerCount;
    const x = cx + Math.cos(angle) * reach * 0.8;
    const y = cy + Math.sin(angle) * reach * 0.8;
    fillCircle(rgba, size, x, y, Math.max(size * 0.034, 1.8), 56, 189, 248, 1);
  }

  fillCircle(rgba, size, cx, cy, Math.max(size * 0.09, 3), 224, 242, 254, 1);
  fillCircle(rgba, size, cx, cy, Math.max(size * 0.045, 1.8), 2, 132, 199, 1);
  return rgba;
}

mkdirSync(outDir, { recursive: true });

const icons = [
  ['icon-512.png', 512, 0.9],
  ['icon-192.png', 192, 0.9],
  ['apple-touch-icon.png', 180, 0.9],
  ['favicon-32.png', 32, 0.88],
  ['icon-maskable-512.png', 512, 0.72],
];

for (const [name, size, scale] of icons) {
  writeFileSync(path.join(outDir, name), encodePng(size, size, drawIcon(size, scale)));
}
