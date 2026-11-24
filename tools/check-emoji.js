/* 检查 SVG 中 emoji 字段是否损坏 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '..', 'public', 'img');
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.svg'))) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = s.match(/<text[^>]*font-size="\d{2,}"[^>]*>([^<]*)<\/text>/);
  const txt = m ? m[1] : '';
  const cps = [...txt].map((c) => c.codePointAt(0).toString(16)).join(' ');
  const broken = txt.includes('?');
  console.log(`${broken ? 'BROKEN' : 'OK    '}  ${f.padEnd(20)} emoji="${txt}" U+${cps}`);
}
