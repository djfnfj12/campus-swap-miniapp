/* 生成三张图示的 SVG（功能结构图 / 数据流图 0 层 / E-R 图），并输出为 HTML 供浏览器渲染截图 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.resolve(__dirname, '..', 'public');
const FONT = "font-family='Microsoft YaHei, SimHei, sans-serif'";

/* ---------- 通用 SVG 片段 ---------- */
const MARKER = `<defs><marker id="arr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
<path d="M0,0 L10,3.5 L0,7 z" fill="#5A6B7D"/></marker></defs>`;

function line(x1, y1, x2, y2, color) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color || '#5A6B7D'}" stroke-width="1.6" marker-end="url(#arr)"/>`;
}
function conn(x1, y1, x2, y2) { // 无箭头连接线（结构图用）
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7FA6D9" stroke-width="1.4"/>`;
}
function label(x, y, text, anchor) {
  return `<text x="${x}" y="${y}" font-size="11.5" fill="#333" text-anchor="${anchor || 'middle'}" ${FONT}>${text}</text>`;
}
function rect(x, y, w, h, fill, stroke, rx) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx || 6}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
}
function svg(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${MARKER}${inner}</svg>`;
}
function htmlOf(svgStr) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0}body{width:max-content;background:#fff}svg{display:block}</style></head><body>${svgStr}</body></html>`;
}

/* ================= 图 1 功能结构图 ================= */
function funcDiagram() {
  const W = 1000;
  let s = '';
  const rootW = 320, rootH = 48, rootX = (W - rootW) / 2, rootY = 14;
  s += rect(rootX, rootY, rootW, rootH, '#2B8CFF', '#1E6FD9', 8);
  s += `<text x="${W / 2}" y="${rootY + 31}" font-size="17" font-weight="bold" fill="#fff" text-anchor="middle" ${FONT}>校园闲置物品交易小程序</text>`;

  const modules = [
    { name: '用户模块', subs: ['注册 / 登录', '资料与密码维护', '个人统计', '公开用户主页'] },
    { name: '商品模块', subs: ['分类与检索', '商品详情', '发布与编辑', '上下架管理', '图片上传', '收藏管理'] },
    { name: '交易模块', subs: ['下单', '订单状态流转', '订单列表', '交易评价'] },
    { name: '消息模块', subs: ['发起会话', '会话列表', '收发消息', '已读回执'] },
    { name: '系统模块', subs: ['健康检查', '未读统计', '静态资源服务'] },
  ];
  const colW = 160, modY = 112, modH = 44, subY0 = 184, subH = 32, subStep = 40;
  const centers = [100, 300, 500, 700, 900];

  // 主干
  s += conn(500, rootY + rootH, 500, 88);
  s += conn(centers[0], 88, centers[centers.length - 1], 88);
  centers.forEach((cx) => { s += conn(cx, 88, cx, modY); });

  modules.forEach((m, i) => {
    const x = centers[i] - colW / 2;
    s += rect(x, modY, colW, modH, '#DCEBFF', '#2B8CFF', 6);
    s += `<text x="${centers[i]}" y="${modY + 28}" font-size="15" font-weight="bold" fill="#1B5FA8" text-anchor="middle" ${FONT}>${m.name}</text>`;
    let prevBottom = modY + modH;
    m.subs.forEach((t, j) => {
      const y = subY0 + j * subStep;
      s += conn(centers[i], prevBottom, centers[i], y);
      s += rect(x, y, colW, subH, '#F5F9FF', '#9EC3F0', 5);
      s += `<text x="${centers[i]}" y="${y + 21}" font-size="12.5" fill="#2B3A4D" text-anchor="middle" ${FONT}>${t}</text>`;
      prevBottom = y + subH;
    });
  });
  return svg(W, 432, s);
}

/* ================= 图 2 数据流图（0 层） ================= */
function dfdDiagram() {
  let s = '';
  // 外部实体
  function entity(x, y, w, h, name) {
    return rect(x, y, w, h, '#FFF6E5', '#E6A23C', 4)
      + `<text x="${x + w / 2}" y="${y + h / 2 + 6}" font-size="15" font-weight="bold" fill="#8A5A00" text-anchor="middle" ${FONT}>${name}</text>`;
  }
  // 加工
  function proc(x, y, w, h, text) {
    return rect(x, y, w, h, '#EAF3FF', '#2B8CFF', 22)
      + `<text x="${x + w / 2}" y="${y + h / 2 + 5}" font-size="14" fill="#1B5FA8" text-anchor="middle" ${FONT}>${text}</text>`;
  }
  // 数据存储（左侧双线）
  function store(x, y, w, h, text) {
    return rect(x, y, w, h, '#E9F7EF', '#2E9E5B', 3)
      + `<line x1="${x + 16}" y1="${y}" x2="${x + 16}" y2="${y + h}" stroke="#2E9E5B" stroke-width="1.5"/>`
      + `<text x="${x + 26}" y="${y + h / 2 + 5}" font-size="13.5" fill="#1D6B41" ${FONT}>${text}</text>`;
  }

  s += entity(30, 230, 130, 60, '买家');
  s += entity(30, 450, 130, 60, '卖家');
  s += proc(360, 40, 280, 52, 'P1  商品浏览与检索');
  s += proc(360, 140, 280, 52, 'P2  商品发布与管理');
  s += proc(360, 240, 280, 52, 'P3  订单交易处理');
  s += proc(360, 340, 280, 52, 'P4  即时消息沟通');
  s += proc(360, 440, 280, 52, 'P5  交易评价');
  s += proc(360, 540, 280, 52, 'P6  账号与认证');
  s += store(770, 40, 200, 44, 'D1  商品库');
  s += store(770, 240, 200, 44, 'D2  订单库');
  s += store(770, 340, 200, 44, 'D4  消息库');
  s += store(770, 440, 200, 44, 'D5  评价库');
  s += store(770, 540, 200, 44, 'D3  用户库');

  // 数据流（折线 + 箭头 + 名称）
  function flow(pts, text, tx, ty, anchor) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) d += ` L${pts[i][0]},${pts[i][1]}`;
    let out = `<path d="${d}" fill="none" stroke="#5A6B7D" stroke-width="1.6" marker-end="url(#arr)"/>`;
    if (text) out += label(tx, ty, text, anchor);
    return out;
  }
  s += flow([[160, 248], [280, 248], [280, 66], [356, 66]], '检索条件', 288, 160, 'start');
  s += flow([[360, 84], [322, 84], [322, 276], [160, 276]], '商品列表', 330, 180, 'start');
  s += flow([[644, 62], [766, 58]], '商品查询', 652, 48, 'start');
  s += flow([[160, 462], [240, 462], [240, 166], [356, 166]], '商品资料', 248, 390, 'start');
  s += flow([[644, 152], [710, 152], [710, 78], [766, 70]], '商品记录', 714, 122, 'start');
  s += flow([[160, 262], [356, 266]], '购买请求', 196, 250, 'start');
  s += flow([[160, 486], [356, 292]], '处理请求', 196, 400, 'start');
  s += flow([[644, 262], [766, 258]], '订单记录', 652, 250, 'start');
  s += flow([[644, 250], [730, 250], [730, 84], [766, 80]], '商品状态更新', 646, 224, 'start');
  s += flow([[356, 286], [200, 288]], '状态通知', 214, 304, 'start');
  s += flow([[160, 282], [356, 350]], '聊天内容', 196, 330, 'start');
  s += flow([[160, 494], [356, 384]], '聊天内容', 196, 452, 'start');
  s += flow([[644, 362], [766, 358]], '会话与消息', 652, 350, 'start');
  s += flow([[360, 388], [330, 388], [330, 505], [160, 505]], '新消息提醒', 336, 450, 'start');
  s += flow([[160, 294], [300, 294], [300, 466], [356, 466]], '评分与评价', 306, 392, 'start');
  s += flow([[644, 462], [766, 458]], '评价记录', 652, 450, 'start');
  s += flow([[95, 290], [18, 290], [18, 566], [356, 566]], '', 0, 0);
  s += flow([[95, 510], [95, 562]], '注册 / 登录 / 令牌签发', 104, 540, 'start');
  s += flow([[644, 562], [766, 558]], '用户资料', 652, 550, 'start');

  // 图例
  s += rect(30, 622, 30, 20, '#FFF6E5', '#E6A23C', 2) + label(68, 637, '外部实体', 'start');
  s += `<circle cx="150" cy="632" r="11" fill="#EAF3FF" stroke="#2B8CFF" stroke-width="1.5"/>` + label(168, 637, '加工', 'start');
  s += rect(226, 622, 34, 20, '#E9F7EF', '#2E9E5B', 2) + `<line x1="240" y1="622" x2="240" y2="642" stroke="#2E9E5B" stroke-width="1.4"/>` + label(268, 637, '数据存储', 'start');
  s += `<line x1="360" y1="632" x2="400" y2="632" stroke="#5A6B7D" stroke-width="1.6" marker-end="url(#arr)"/>` + label(408, 637, '数据流', 'start');

  return svg(1000, 660, s);
}

/* ================= 图 3 E-R 图 ================= */
function erDiagram() {
  let s = '';
  function entity(x, y, w, h, name, attrs) {
    let out = rect(x, y, w, h, '#EAF3FF', '#2B8CFF', 6);
    out += `<text x="${x + w / 2}" y="${y + 24}" font-size="15" font-weight="bold" fill="#1B5FA8" text-anchor="middle" ${FONT}>${name}</text>`;
    out += `<line x1="${x + 12}" y1="${y + 33}" x2="${x + w - 12}" y2="${y + 33}" stroke="#9EC3F0" stroke-width="1"/>`;
    attrs.forEach((a, i) => {
      out += `<text x="${x + w / 2}" y="${y + 50 + i * 16}" font-size="11.5" fill="#33475E" text-anchor="middle" ${FONT}>${a}</text>`;
    });
    return out;
  }
  function diamond(cx, cy, name) {
    const w = 104, h = 46;
    const pts = `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`;
    return `<polygon points="${pts}" fill="#FFF9EC" stroke="#E6A23C" stroke-width="1.5"/>`
      + `<text x="${cx}" y="${cy + 5}" font-size="13.5" font-weight="bold" fill="#8A5A00" text-anchor="middle" ${FONT}>${name}</text>`;
  }
  function edge(x1, y1, x2, y2, l1, l2) { // 联系连线，l1/l2 为两端基数标注 [x,y,text]
    let out = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5A6B7D" stroke-width="1.6"/>`;
    [l1, l2].forEach((l) => { if (l) out += label(l[0], l[1], l[2]); });
    return out;
  }

  s += entity(60, 40, 168, 100, '用户 users', ['学号*  昵称  密码散列', '学院  手机号  简介']);
  s += entity(700, 40, 168, 100, '商品 items', ['编号*  标题  分类', '价格  成色  状态  图片']);
  s += entity(700, 270, 168, 100, '订单 orders', ['单号*  商品  买家  卖家', '成交价  状态  留言']);
  s += entity(700, 480, 168, 100, '评价 reviews', ['编号*  订单号', '评分  评价内容']);
  s += entity(380, 380, 168, 100, '会话 conversations', ['编号*  商品  买方  卖方', '最后消息摘要']);
  s += entity(90, 480, 168, 100, '消息 messages', ['编号*  所属会话', '发送者  内容  已读']);

  // 用户—商品：发布(1:N)、收藏(N:N)
  s += diamond(452, 62, '发布');
  s += edge(228, 86, 398, 62, [300, 78, '1'], [610, 78, 'N']);
  s += edge(506, 62, 696, 86);
  s += diamond(452, 158, '收藏');
  s += edge(228, 106, 398, 152, [300, 128, 'N'], [610, 128, 'N']);
  s += edge(506, 152, 696, 106);

  // 商品—订单：下单(1:N)
  s += diamond(784, 212, '下单');
  s += edge(784, 142, 784, 188, [800, 168, '1'], [800, 262, 'N']);
  s += edge(784, 236, 784, 266);

  // 订单—评价：评价(1:0..1)
  s += diamond(784, 426, '评价');
  s += edge(784, 372, 784, 402, [802, 394, '1'], [792, 480, '0..1']);
  s += edge(784, 450, 784, 476);

  // 商品—会话：咨询(1:N)
  s += diamond(600, 300, '咨询');
  s += edge(700, 120, 630, 278, [672, 160, '1'], [566, 400, 'N']);
  s += edge(652, 314, 540, 428);

  // 用户—会话：参与(M:N)
  s += diamond(212, 300, '参与');
  s += edge(150, 142, 200, 276, [150, 210, 'M'], [300, 420, 'N']);
  s += edge(232, 322, 376, 430);

  // 会话—消息：包含(1:N)
  s += diamond(462, 540, '包含');
  s += edge(462, 482, 462, 516, [478, 504, '1'], [300, 546, 'N']);
  s += edge(408, 540, 262, 532);

  // 基数图例
  s += label(60, 612, '注：1、N、M 表示实体间联系的基数；实体框内为关键属性（* 为主键）', 'start');
  return svg(1000, 630, s);
}

/* ---------- 输出 ---------- */
const files = [
  ['func.html', funcDiagram()],
  ['dfd.html', dfdDiagram()],
  ['er.html', erDiagram()],
];
for (const [name, content] of files) {
  fs.writeFileSync(path.join(OUT_DIR, name), htmlOf(content), 'utf8');
}
console.log('generated:', files.map((f) => path.join(OUT_DIR, f[0])).join(' | '));
