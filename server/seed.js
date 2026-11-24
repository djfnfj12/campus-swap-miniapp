'use strict';
/**
 * 演示数据初始化脚本
 * 用法：
 *   node server/seed.js           # 已有数据则跳过
 *   node server/seed.js --reset   # 清空后重新灌入演示数据
 */
const { db, get, run, now, close } = require('./lib/db');
const { hashPassword } = require('./lib/auth');

const RESET = process.argv.includes('--reset');

if (RESET) {
  db.exec(`
    DELETE FROM messages; DELETE FROM conversations; DELETE FROM reviews;
    DELETE FROM orders;   DELETE FROM favorites;  DELETE FROM items;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
} else if (Number(get('SELECT COUNT(*) AS n FROM users').n) > 0) {
  console.log('[seed] 数据库已有演示数据，跳过初始化。如需重置请加 --reset');
  process.exit(0);
}

const base = Date.now();
function ago(minutes) {
  const d = new Date(base - minutes * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

console.log('[seed] 正在写入演示数据 ...');

/* ---------------- 用户 ---------------- */
const USERS = [
  ['20230101', '张小满', '计算机学院', '13800000001', '软件工程大三，出闲置回血～'],
  ['20230102', '李子墨', '外国语学院', '13800000002', '英语专业，教材和生活好物转让'],
  ['20230103', '王大锤', '机械工程学院', '13800000003', '机械男，运动装备多多关照'],
  ['20230104', '陈雨桐', '经济管理学院', '13800000004', '经管萌新，收各种考研资料'],
];
const userIds = {};
USERS.forEach(([sid, nickname, college, phone, bio]) => {
  const r = run(
    'INSERT INTO users (student_id, nickname, password_hash, avatar, college, phone, bio, created_at) VALUES (?,?,?,?,?,?,?,?)',
    sid, nickname, hashPassword('123456'), '', college, phone, bio, ago(60 * 24 * 30)
  );
  userIds[nickname] = r.lastInsertRowid;
});

/* ---------------- 商品 ---------------- */
const ITEMS = [
  { s: '张小满', t: 'iPhone 13 128G 星光色 95新', c: '数码电器', p: 2600, o: 4599, cd: '95新', im: '/img/item-phone.svg',
    d: '自用一年多，无拆无修，电池健康 89%，配原装充电线。因换新机出售，支持校内当面验机。', sp: '三食堂门口', v: 328, h: 30 },
  { s: '张小满', t: '联想小新 Pro14 笔记本 i5 16G 512G', c: '数码电器', p: 3200, o: 5499, cd: '9成新', im: '/img/item-laptop.svg',
    d: '大一入学买的，主要写作业用，屏幕无坏点，带原装电源和鼠标。', sp: '图书馆一楼大厅', v: 210, h: 50 },
  { s: '张小满', t: '索尼 WH-1000XM4 头戴降噪耳机', c: '数码电器', p: 650, o: 1999, cd: '9成新', im: '/img/item-headphone.svg',
    d: '降噪效果依旧能打，耳罩无脱皮，带收纳盒。', sp: '三食堂门口', v: 176, h: 60 },
  { s: '李子墨', t: '高等数学（第七版）上下册 + 习题全解', c: '教材书籍', p: 28, o: 78, cd: '99新', im: '/img/item-book.svg',
    d: '几乎全新，只有前两章做过笔记，笔记对期末复习很有用，可小刀。', sp: '二教 101', v: 96, h: 120 },
  { s: '李子墨', t: '考研英语一真题 2010-2025 全套', c: '教材书籍', p: 45, o: 128, cd: '95新', im: '/img/item-notes.svg',
    d: '含黄皮书真题 + 单词书，已做完 2010-2022，2023-2025 未动。', sp: '图书馆自习区', v: 143, h: 180 },
  { s: '李子墨', t: '宿舍护眼台灯 三档色温 USB 供电', c: '生活用品', p: 35, o: 89, cd: '99新', im: '/img/item-lamp.svg',
    d: '用了两个月，熄灯后学习不刺眼，附 USB 线。', sp: '6 号楼楼下', v: 55, h: 200 },
  { s: '王大锤', t: '宜家拉克小方桌 全新未拆', c: '生活用品', p: 60, o: 99, cd: '全新', im: '/img/item-desk.svg',
    d: '买多了，全新未拆封，50cm x 50cm，适合宿舍放电脑。', sp: '12 号楼楼下', v: 61, h: 300 },
  { s: '王大锤', t: '优衣库摇粒绒外套 男 M 藏青', c: '服饰鞋包', p: 80, o: 199, cd: '95新', im: '/img/item-jacket.svg',
    d: '洗过两次，尺码买大了，无破损无污渍。', sp: '体育馆西侧', v: 47, h: 400 },
  { s: '王大锤', t: 'Nike Air Zoom 跑鞋 42 码', c: '运动户外', p: 180, o: 699, cd: '9成新', im: '/img/item-shoes.svg',
    d: '跑了大概 80 公里，鞋底磨损轻微，鞋面干净，脚感还在。', sp: '田径场看台', v: 88, h: 500 },
  { s: '王大锤', t: '尤克里里 21 寸 单板 含琴包拨片', c: '乐器手办', p: 260, o: 499, cd: '99新', im: '/img/item-ukulele.svg',
    d: '入门时买的，练了两个月吃灰了，音准好，送琴包、拨片和调音器。', sp: '大学生活动中心', v: 73, h: 620 },
  { s: '陈雨桐', t: '完美日记眼影盘 仅试色两次', c: '美妆个护', p: 40, o: 129, cd: '99新', im: '/img/item-makeup.svg',
    d: '色号不适合我，仅手臂试色两次，附小镜子。', sp: '4 号楼楼下', v: 39, h: 700 },
  { s: '陈雨桐', t: '桌面绿植多肉三盆 含陶瓷盆', c: '其他', p: 30, o: 66, cd: '全新', im: '/img/item-plant.svg',
    d: '毕业学姐送的，养护很省心，买花盆送三盆多肉。', sp: '南门快递点', v: 34, h: 800 },
];
const itemId = {};
ITEMS.forEach((it, idx) => {
  const t = ago(it.h);
  const r = run(
    `INSERT INTO items (seller_id, title, description, category, price, original_price, condition, images, spot, status, view_count, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,'on_sale',?,?,?)`,
    userIds[it.s], it.t, it.d, it.c, it.p, it.o, it.cd,
    JSON.stringify([it.im]), it.sp, it.v, t, t
  );
  itemId[it.t] = r.lastInsertRowid;
});

/* ---------------- 收藏 ---------------- */
const FAV = [
  ['王大锤', 'iPhone 13 128G 星光色 95新'],
  ['陈雨桐', 'iPhone 13 128G 星光色 95新'],
  ['陈雨桐', '索尼 WH-1000XM4 头戴降噪耳机'],
  ['张小满', '考研英语一真题 2010-2025 全套'],
  ['李子墨', '尤克里里 21 寸 单板 含琴包拨片'],
];
FAV.forEach(([u, t]) => run('INSERT OR IGNORE INTO favorites (user_id, item_id, created_at) VALUES (?,?,?)', userIds[u], itemId[t], ago(100)));

/* ---------------- 订单（覆盖 已完成 / 待确认 / 已取消 三种状态） ---------------- */
// 订单 1：已完成 + 已评价
const o1 = run(
  `INSERT INTO orders (item_id, buyer_id, seller_id, price, spot, note, status, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?, ?,?)`,
  itemId['iPhone 13 128G 星光色 95新'], userIds['王大锤'], userIds['张小满'],
  2600, '三食堂门口', '晚自习后 21:00 见', 'completed', ago(2880), ago(1440)
);
run(`UPDATE items SET status='sold' WHERE id=?`, itemId['iPhone 13 128G 星光色 95新']);
run('INSERT INTO reviews (order_id, buyer_id, seller_id, rating, content, created_at) VALUES (?,?,?,?,?,?)',
  o1.lastInsertRowid, userIds['王大锤'], userIds['张小满'], 5, '学姐人超好，手机和描述完全一致，还送了数据线！', ago(1400));

// 订单 2：待卖家确认
const o2 = run(
  `INSERT INTO orders (item_id, buyer_id, seller_id, price, spot, note, status, created_at, updated_at)
   VALUES (?,?,?,?,?,?,'pending',?,?)`,
  itemId['高等数学（第七版）上下册 + 习题全解'], userIds['陈雨桐'], userIds['李子墨'],
  28, '二教 101', '请问笔记可以拍照给我先看看吗？', ago(90), ago(90)
);
run(`UPDATE items SET status='trading' WHERE id=?`, itemId['高等数学（第七版）上下册 + 习题全解']);

// 订单 3：已取消
run(
  `INSERT INTO orders (item_id, buyer_id, seller_id, price, spot, note, status, created_at, updated_at)
   VALUES (?,?,?,?,?,?,'cancelled',?,?)`,
  itemId['Nike Air Zoom 跑鞋 42 码'], userIds['李子墨'], userIds['王大锤'],
  180, '田径场看台', '想问问还能便宜点吗', ago(720), ago(700)
);

/* ---------------- 会话与消息 ---------------- */
function conv(itemTitle, buyer, seller, msgs) {
  const item = itemId[itemTitle];
  let c = get('SELECT * FROM conversations WHERE item_id=? AND buyer_id=?', item, userIds[buyer]);
  if (!c) {
    const r = run('INSERT INTO conversations (item_id, buyer_id, seller_id, last_message, last_time, created_at) VALUES (?,?,?,?,?,?)',
      item, userIds[buyer], userIds[seller], '', '', ago(2000));
    c = get('SELECT * FROM conversations WHERE id=?', r.lastInsertRowid);
  }
  let t = base - msgs.length * 5 * 60 * 1000;
  msgs.forEach(([from, text], i) => {
    const ts = new Date(t + i * 5 * 60 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${ts.getFullYear()}-${p(ts.getMonth() + 1)}-${p(ts.getDate())} ${p(ts.getHours())}:${p(ts.getMinutes())}:${p(ts.getSeconds())}`;
    run('INSERT INTO messages (conv_id, sender_id, content, kind, is_read, created_at) VALUES (?,?,?,?,?,?)',
      c.id, userIds[from], text, 'text', from === seller || from === '陈雨桐' ? 1 : 0, stamp);
    run('UPDATE conversations SET last_message=?, last_time=? WHERE id=?', text, stamp, c.id);
  });
}

conv('iPhone 13 128G 星光色 95新', '王大锤', '张小满', [
  ['王大锤', '学姐你好，iPhone 13 还在吗？'],
  ['张小满', '在的～电池健康 89%，可以当面验机'],
  ['王大锤', '2600 能包个手机壳不哈哈，今晚 9 点三食堂门口交易？'],
  ['张小满', '哈哈可以，手机壳送你，到时候微信联系'],
  ['王大锤', '好的谢谢学姐！'],
]);

conv('高等数学（第七版）上下册 + 习题全解', '陈雨桐', '李子墨', [
  ['陈雨桐', '同学，高数教材还有笔记在吗？'],
  ['李子墨', '在的，笔记我都整理过，重点都划了'],
  ['陈雨桐', '那我下单啦，二教 101 见～'],
]);

console.log('[seed] 完成 ✔');
console.log('[seed] 演示账号（密码统一为 123456）：');
USERS.forEach(([sid, nickname, college]) => console.log(`        ${sid}  ${nickname}  ${college}`));
close();
