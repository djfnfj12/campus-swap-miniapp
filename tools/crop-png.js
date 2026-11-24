/* 零依赖 PNG 裁剪工具：node:zlib 解码/编码 PNG
 * 用法 A（区域裁剪）：node crop-png.js <in> <out> <x> <y> <w> <h>
 * 用法 B（自动裁白底）：node crop-png.js <in> <out> <contentHeightPx> [scale]
 */
'use strict';
const fs = require('node:fs');
const zlib = require('node:zlib');

const [, , IN, OUT, A1, A2, A3, A4] = process.argv;
const regionMode = A3 !== undefined;
let cx = 0, cy = 0, cw = 0, chh = 0;
const contentH = parseInt(A1, 10);
const scale = A2 ? Number(A2) : 2;
if (regionMode) {
  cx = parseInt(A1, 10); cy = parseInt(A2, 10);
  cw = parseInt(A3, 10); chh = parseInt(A4, 10);
}

const buf = fs.readFileSync(IN);
if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG 文件');

// ---------- 读取 chunks ----------
let off = 8;
let ihdr = null;
const idat = [];
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 'IHDR') {
    ihdr = {
      width: data.readUInt32BE(0), height: data.readUInt32BE(4),
      bitDepth: data[8], colorType: data[9], interlace: data[12],
    };
  } else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  off += 12 + len;
}
if (!ihdr || ihdr.bitDepth !== 8 || ihdr.interlace !== 0) throw new Error('仅支持 8 位非隔行 PNG');
const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType];
if (!ch) throw new Error('不支持的色型 ' + ihdr.colorType);
const { width: W, height: H } = ihdr;

// ---------- 解压 + 去滤波 ----------
const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = W * ch;
const img = Buffer.alloc(H * stride);
let p = 0;
for (let y = 0; y < H; y += 1) {
  const ft = raw[p++];
  const row = img.subarray(y * stride, (y + 1) * stride);
  const prev = y > 0 ? img.subarray((y - 1) * stride, y * stride) : null;
  for (let x = 0; x < stride; x += 1) {
    const a = x >= ch ? row[x - ch] : 0;
    const b = prev ? prev[x] : 0;
    const c = prev && x >= ch ? prev[x - ch] : 0;
    let v = raw[p + x];
    switch (ft) {
      case 0: break;
      case 1: v += a; break;
      case 2: v += b; break;
      case 3: v += (a + b) >> 1; break;
      case 4: {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        break;
      }
      default: throw new Error('未知滤波 ' + ft);
    }
    row[x] = v & 0xff;
  }
  p += stride;
}

// ---------- 确定裁剪区域 ----------
let top, left, outW, outH;
if (regionMode) {
  left = cx; top = cy; outW = cw; outH = chh;
  if (left < 0 || top < 0 || left + outW > W || top + outH > H) {
    throw new Error(`区域越界: (${left},${top},${outW},${outH}) 图为 ${W}x${H}`);
  }
} else {
  // 自底向上找最后一条非白行，最多裁到 contentH*scale
  function rowIsWhite(y) {
    for (let x = 0; x < W; x += 1) {
      const i = y * stride + x * ch;
      if (img[i] < 250 || img[i + 1] < 250 || img[i + 2] < 250) return false;
    }
    return true;
  }
  const limit = Math.min(H, Math.round(contentH * scale));
  let bottom = limit;
  while (bottom > 1 && rowIsWhite(bottom - 1)) bottom -= 1;
  left = 0; top = 0; outW = W; outH = bottom - top;
}
console.log(`原图 ${W}x${H} -> 裁剪为 ${outW}x${outH} @(${left},${top})`);

// ---------- 重新编码（filter 0） ----------
const outStride = outW * ch;
const raw2 = Buffer.alloc(outH * (outStride + 1));
for (let y = 0; y < outH; y += 1) {
  raw2[y * (outStride + 1)] = 0;
  const srcStart = (y + top) * stride + left * ch;
  img.copy(raw2, y * (outStride + 1) + 1, srcStart, srcStart + outStride);
}
const crcTable = [];
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i += 1) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const ihdr2 = Buffer.alloc(13);
ihdr2.writeUInt32BE(outW, 0);
ihdr2.writeUInt32BE(outH, 4);
ihdr2[8] = 8; ihdr2[9] = ihdr.colorType; ihdr2[10] = 0; ihdr2[11] = 0; ihdr2[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr2),
  chunk('IDAT', zlib.deflateSync(raw2, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(OUT, png);
console.log('已写出:', OUT, png.length, 'bytes');
