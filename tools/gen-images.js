'use strict';
/** 生成商品占位图 / 轮播图（SVG），输出到 public/img */
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.resolve(__dirname, '..', 'public', 'img');
fs.mkdirSync(OUT, { recursive: true });

const LIST = [
  { f: 'item-phone', e: '📱', t: 'iPhone 13', c1: '#4facfe', c2: '#00f2fe' },
  { f: 'item-laptop', e: '💻', t: '笔记本电脑', c1: '#43e97b', c2: '#38f9d7' },
  { f: 'item-headphone', e: '🎧', t: '降噪耳机', c1: '#fa709a', c2: '#fee140' },
  { f: 'item-book', e: '📚', t: '高数教材', c1: '#f6d365', c2: '#fda085' },
  { f: 'item-notes', e: '📖', t: '考研真题', c1: '#a18cd1', c2: '#fbc2eb' },
  { f: 'item-lamp', e: '💡', t: '护眼台灯', c1: '#ffecd2', c2: '#fcb69f' },
  { f: 'item-desk', e: '🪑', t: '宿舍小方桌', c1: '#89f7fe', c2: '#66a6ff' },
  { f: 'item-jacket', e: '🧥', t: '摇粒绒外套', c1: '#667eea', c2: '#764ba2' },
  { f: 'item-shoes', e: '👟', t: '跑鞋 42码', c1: '#f093fb', c2: '#f5576c' },
  { f: 'item-ukulele', e: '🎸', t: '尤克里里', c1: '#ffd89b', c2: '#19547b' },
  { f: 'item-makeup', e: '💄', t: '眼影盘', c1: '#ff9a9e', c2: '#fecfef' },
  { f: 'item-plant', e: '🌵', t: '多肉盆栽', c1: '#96e6a1', c2: '#d4fc79' },
  { f: 'banner-1', e: '🎁', t: '新生季 · 闲置 5 折起', c1: '#6a11cb', c2: '#2575fc', w: 750, h: 300, fs: 44 },
  { f: 'banner-2', e: '📚', t: '考研教材专场', c1: '#ff512f', c2: '#dd2476', w: 750, h: 300, fs: 44 },
  { f: 'banner-3', e: '🔄', t: '当面交易 · 安全省心', c1: '#11998e', c2: '#38ef7d', w: 750, h: 300, fs: 44 },
  { f: 'logo', e: '🛒', t: '校园闲置', c1: '#2b8cff', c2: '#5f3bff', w: 240, h: 240, fs: 40 },
];

function svg({ f, e, t, c1, c2, w = 600, h = 600, fs: font = 44 }) {
  const isBanner = w !== h;
  const emojiSize = isBanner ? Math.round(h * 0.42) : Math.round(w * 0.3);
  const titleY = isBanner ? Math.round(h * 0.66) : Math.round(h * 0.78);
  const subY = isBanner ? Math.round(h * 0.87) : Math.round(h * 0.88);
  const titleFont = isBanner ? font : Math.round(w * 0.073);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="r" cx="0.28" cy="0.18" r="0.95">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect width="${w}" height="${h}" fill="url(#r)"/>
  <circle cx="${Math.round(w * 0.82)}" cy="${Math.round(h * 0.2)}" r="${Math.round(h * 0.22)}" fill="#ffffff" opacity="0.13"/>
  <circle cx="${Math.round(w * 0.15)}" cy="${Math.round(h * 0.85)}" r="${Math.round(h * 0.28)}" fill="#ffffff" opacity="0.1"/>
  <text x="${Math.round(w / 2)}" y="${Math.round(h * (isBanner ? 0.4 : 0.44))}" font-size="${emojiSize}" text-anchor="middle" dominant-baseline="central">${e}</text>
  <text x="${Math.round(w / 2)}" y="${titleY}" font-size="${titleFont}" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-weight="700" fill="#ffffff" text-anchor="middle" opacity="0.96">${t}</text>
  ${isBanner ? '' : `<text x="${Math.round(w / 2)}" y="${subY}" font-size="${Math.round(w * 0.04)}" font-family="Microsoft YaHei, PingFang SC, sans-serif" fill="#ffffff" text-anchor="middle" opacity="0.75">校园闲置 · 当面交易</text>`}
</svg>
`;
}

let n = 0;
for (const item of LIST) {
  fs.writeFileSync(path.join(OUT, `${item.f}.svg`), svg(item), 'utf8');
  n += 1;
}
console.log(`[gen-images] 已生成 ${n} 张 SVG 到 ${OUT}`);
