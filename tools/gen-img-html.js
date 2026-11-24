/* 生成图片转换网格页（供浏览器渲染后截图裁剪为 PNG）
 * 输出 public/_pnggrid-item.html（12 张商品图 4×3 网格）
 *      public/_pnggrid-banner.html（3 banner + logo）
 * 坐标约定（逻辑 px，DPR=2 截图后 ×2）：
 *   item 页：每张 500×500，4 列，x=col*500, y=row*500
 *   banner 页：banner 600×240 横排 x=j*600, y=0；logo 500×500 x=0,y=240
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const IMG_DIR = '/img';
const OUT_DIR = path.resolve(__dirname, '..', 'public');

const items = ['item-book', 'item-desk', 'item-headphone', 'item-jacket',
  'item-lamp', 'item-laptop', 'item-makeup', 'item-notes',
  'item-phone', 'item-plant', 'item-shoes', 'item-ukulele'];
const banners = ['banner-1', 'banner-2', 'banner-3'];

function page(bodyHtml, w, h) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}body{width:${w}px;height:${h}px;position:relative;background:#fff}
img{position:absolute;display:block}</style></head><body>${bodyHtml}</body></html>`;
}

// item 页：4 列 × 3 行
let itemHtml = '';
items.forEach((name, i) => {
  const col = i % 4, row = Math.floor(i / 4);
  itemHtml += `<img src="${IMG_DIR}/${name}.svg" style="left:${col * 500}px;top:${row * 500}px;width:500px;height:500px">`;
});
fs.writeFileSync(path.join(OUT_DIR, '_pnggrid-item.html'), page(itemHtml, 2000, 1500), 'utf8');

// banner 页：3 banner 横排 + logo
let bannerHtml = '';
banners.forEach((name, j) => {
  bannerHtml += `<img src="${IMG_DIR}/${name}.svg" style="left:${j * 600}px;top:0;width:600px;height:240px">`;
});
bannerHtml += `<img src="${IMG_DIR}/logo.svg" style="left:0;top:240px;width:500px;height:500px">`;
fs.writeFileSync(path.join(OUT_DIR, '_pnggrid-banner.html'), page(bannerHtml, 1800, 740), 'utf8');

console.log('item order:', JSON.stringify(items));
console.log('banner order:', JSON.stringify(banners));
console.log('grid pages written');
