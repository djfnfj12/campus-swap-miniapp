'use strict';
/**
 * 接口自动化测试（集成测试）
 * 运行：npm test
 * 说明：
 *  1. 测试使用独立的 SQLite 文件，不会污染演示数据库；
 *  2. 使用固定测试账号，避免并发注册导致学号唯一约束冲突；
 *  3. 覆盖认证 / 商品 / 订单状态机 / 消息 / 权限 / 输入校验 / 分页。
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

// 必须在 require server 之前指定测试库
const TEST_DB = path.join(os.tmpdir(), `campus-swap-test-${process.pid}.db`);
for (const f of ['', '-wal', '-shm']) {
  try { fs.unlinkSync(TEST_DB + f); } catch (_) { /* ignore */ }
}
process.env.DB_FILE = TEST_DB;
process.env.QUIET = '1';

const { app } = require('../server/index.js');

let server;
let BASE;

function api(method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(BASE + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => ({
    status: res.status,
    data: await res.json().catch(() => ({})),
  }));
}

/** 固定测试账号 */
const STAMP = Date.now();
const SID = {
  auth: `AU${STAMP}`,        // 认证流程专用
  seller1: `SE${STAMP}`,     // 商品发布 / 权限 / 下单
  seller2: `SL${STAMP}`,     // 收藏 / 取消订单
  buyer1: `BY${STAMP}`,      // 下单 / 收藏
  buyer2: `BZ${STAMP}`,      // 消息 / 非法输入
  stranger: `ST${STAMP}`,    // 越权访问
};
const TOK = {};

async function ensureToken(key) {
  if (TOK[key]) return TOK[key];
  let res = await api('POST', '/api/auth/login', { body: { studentId: SID[key], password: '123456' } });
  if (res.status !== 200) {
    res = await api('POST', '/api/auth/register', {
      body: { studentId: SID[key], nickname: `测试-${key}`, password: '123456', college: '测试学院' },
    });
    assert.strictEqual(res.status, 201, `账号准备失败: ${JSON.stringify(res.data)}`);
  }
  TOK[key] = res.data.token;
  return TOK[key];
}

/** 由指定账号发布一件商品 */
async function createItem(ownerKey, overrides = {}) {
  const token = await ensureToken(ownerKey);
  const res = await api('POST', '/api/items', {
    token,
    body: {
      title: `测试商品-${Math.random().toString(36).slice(2, 8)}`,
      category: '生活用品',
      condition: '99新',
      price: 66,
      images: ['/img/item-lamp.svg'],
      spot: '一食堂门口',
      ...overrides,
    },
  });
  assert.strictEqual(res.status, 201, `发布失败: ${JSON.stringify(res.data)}`);
  return { token, item: res.data.item };
}

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.on('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  await Promise.all(Object.keys(SID).map(ensureToken));
});

after(() => {
  server.close();
  try {
    require('../server/lib/db').close();
    for (const f of ['', '-wal', '-shm']) fs.unlinkSync(TEST_DB + f);
  } catch (_) { /* ignore */ }
});

/* ================= 基础设施 ================= */
test('GET /api/health 服务健康检查', async () => {
  const res = await api('GET', '/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.status, 'ok');
});

test('静态首页可访问且包含应用外壳', async () => {
  const res = await fetch(BASE + '/');
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.match(html, /校园闲置物品交易小程序/);
  assert.match(html, /id="view"/);
});

test('不存在的接口返回 404', async () => {
  const res = await api('GET', '/api/not-exist');
  assert.strictEqual(res.status, 404);
});

/* ================= 认证模块 ================= */
test('注册 → 登录 → 获取当前用户', async () => {
  const reg = await api('POST', '/api/auth/register', {
    body: { studentId: SID.auth + '1', nickname: '新同学', password: '123456', college: '计算机学院' },
  });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.data));
  assert.ok(reg.data.token, '应返回会话 token');

  const login = await api('POST', '/api/auth/login', {
    body: { studentId: SID.auth + '1', password: '123456' },
  });
  assert.strictEqual(login.status, 200);

  const me = await api('GET', '/api/me', { token: login.data.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.data.user.studentId, SID.auth + '1');
  assert.ok(!JSON.stringify(me.data).includes('password_hash'), '不得泄露口令散列');
});

test('重复学号注册返回 409', async () => {
  const res = await api('POST', '/api/auth/register', {
    body: { studentId: SID.auth, nickname: '重复账号', password: '123456' },
  });
  assert.strictEqual(res.status, 409);
});

test('密码错误登录返回 401', async () => {
  const res = await api('POST', '/api/auth/login', {
    body: { studentId: SID.auth, password: 'wrong-pass' },
  });
  assert.strictEqual(res.status, 401);
});

test('未登录访问受保护接口返回 401', async () => {
  const res = await api('POST', '/api/items', { body: { title: 'x' } });
  assert.strictEqual(res.status, 401);
});

test('伪造 / 篡改 token 被拒绝', async () => {
  const forged = await api('GET', '/api/me', { token: 'eyJmYWtlIjp0cnVlfQ.forgedsignature' });
  assert.strictEqual(forged.status, 401);
  const empty = await api('GET', '/api/me', { token: '' });
  assert.strictEqual(empty.status, 401);
});

/* ================= 商品模块 ================= */
test('发布商品 → 关键词检索 → 详情浏览量累加', async () => {
  const { token, item } = await createItem('seller1', {
    title: '测试专用 自行车 9成新',
    category: '运动户外',
    condition: '9成新',
    price: 199,
    originalPrice: 599,
    description: '毕业甩卖，车况良好',
    spot: '南门快递点',
    images: ['/img/item-shoes.svg'],
  });
  assert.strictEqual(item.status, 'on_sale');
  assert.strictEqual(item.seller.nickname, '测试-seller1');

  const list = await api('GET', '/api/items?keyword=自行车&category=运动户外');
  assert.strictEqual(list.status, 200);
  assert.ok(list.data.list.some((i) => i.id === item.id), '关键词检索应命中');

  const before = await api('GET', `/api/items/${item.id}`);
  const after = await api('GET', `/api/items/${item.id}`);
  assert.strictEqual(after.data.item.viewCount, before.data.item.viewCount + 1, '浏览量应累加');
  assert.strictEqual(after.data.isOwner, false, '匿名访问不应视为所有者');

  const ownerView = await api('GET', `/api/items/${item.id}`, { token });
  assert.strictEqual(ownerView.data.isOwner, true);
});

test('价格区间过滤与排序', async () => {
  const list = await api('GET', '/api/items?minPrice=1&maxPrice=100000&sort=price_asc&pageSize=30');
  assert.strictEqual(list.status, 200);
  const prices = list.data.list.map((i) => i.price);
  assert.deepStrictEqual(prices, [...prices].sort((a, b) => a - b), '应按价格升序');
  assert.ok(prices.every((p) => p >= 1 && p <= 100000), '价格应在区间内');
});

test('他人不能修改、下架我的商品；下架后对外不可见', async () => {
  const { token: ownerToken, item } = await createItem('seller1', { title: '仅卖家可编辑的商品', category: '其他' });
  const strangerToken = await ensureToken('stranger');

  const edit = await api('PUT', `/api/items/${item.id}`, { token: strangerToken, body: { title: '恶意修改' } });
  assert.strictEqual(edit.status, 403);

  const del = await api('DELETE', `/api/items/${item.id}`, { token: strangerToken });
  assert.strictEqual(del.status, 403);

  const ownerDel = await api('DELETE', `/api/items/${item.id}`, { token: ownerToken });
  assert.strictEqual(ownerDel.status, 200);

  const gone = await api('GET', `/api/items/${item.id}`, { token: strangerToken });
  assert.strictEqual(gone.status, 404, '下架后对外不可见');
});

test('收藏 / 取消收藏 / 收藏列表', async () => {
  const { item } = await createItem('seller2', { title: '可收藏的台灯', category: '生活用品', price: 30 });
  const buyerToken = await ensureToken('buyer1');

  const fav = await api('POST', `/api/items/${item.id}/favorite`, { token: buyerToken });
  assert.strictEqual(fav.status, 200);
  assert.strictEqual(fav.data.favorited, true);
  assert.ok(fav.data.favCount >= 1);

  const detail = await api('GET', `/api/items/${item.id}`, { token: buyerToken });
  assert.strictEqual(detail.data.item.isFavorite, true);

  const unfav = await api('DELETE', `/api/items/${item.id}/favorite`, { token: buyerToken });
  assert.strictEqual(unfav.status, 200);
  assert.strictEqual(unfav.data.favorited, false);

  const mine = await api('GET', '/api/favorites', { token: buyerToken });
  assert.strictEqual(mine.status, 200);
  assert.ok(Array.isArray(mine.data.list));
});

/* ================= 订单状态机 ================= */
test('完整交易流程：下单 → 卖家确认 → 买家收货 → 评价', async () => {
  const { token: sellerToken, item } = await createItem('seller1', { title: '状态机测试商品', category: '数码电器' });
  const buyerToken = await ensureToken('buyer1');
  const strangerToken = await ensureToken('stranger');

  // 不能购买自己发布的商品
  const self = await api('POST', '/api/orders', { token: sellerToken, body: { itemId: item.id } });
  assert.strictEqual(self.status, 400);

  // 正常下单
  const order = await api('POST', '/api/orders', {
    token: buyerToken, body: { itemId: item.id, spot: '二食堂门口', note: '晚自习后见' },
  });
  assert.strictEqual(order.status, 201, JSON.stringify(order.data));
  const oid = order.data.order.id;
  assert.strictEqual(order.data.order.status, 'pending');
  assert.strictEqual(order.data.order.role, 'buyer');
  assert.strictEqual(order.data.order.price, 66);

  // 下单后商品进入交易中，不可被他人再下单
  const mid = await api('GET', `/api/items/${item.id}`);
  assert.strictEqual(mid.data.item.status, 'trading');
  const blocked = await api('POST', '/api/orders', { token: strangerToken, body: { itemId: item.id } });
  assert.strictEqual(blocked.status, 400);

  // 重复下单也被拒绝
  const dup = await api('POST', '/api/orders', { token: buyerToken, body: { itemId: item.id } });
  assert.strictEqual(dup.status, 400);

  // 买家不能替卖家确认
  const badConfirm = await api('POST', `/api/orders/${oid}/status`, { token: buyerToken, body: { status: 'confirmed' } });
  assert.strictEqual(badConfirm.status, 403);

  // 未确认前不能完成
  const badComplete = await api('POST', `/api/orders/${oid}/status`, { token: buyerToken, body: { status: 'completed' } });
  assert.strictEqual(badComplete.status, 400);

  // 非参与方不能操作
  const byStranger = await api('POST', `/api/orders/${oid}/status`, { token: strangerToken, body: { status: 'cancelled' } });
  assert.strictEqual(byStranger.status, 403);

  // 卖家确认接单
  const conf = await api('POST', `/api/orders/${oid}/status`, { token: sellerToken, body: { status: 'confirmed' } });
  assert.strictEqual(conf.status, 200);
  assert.strictEqual(conf.data.order.status, 'confirmed');

  // 未完成不能评价
  const early = await api('POST', `/api/orders/${oid}/review`, { token: buyerToken, body: { rating: 5 } });
  assert.strictEqual(early.status, 400);

  // 买家确认收货
  const done = await api('POST', `/api/orders/${oid}/status`, { token: buyerToken, body: { status: 'completed' } });
  assert.strictEqual(done.status, 200);
  assert.strictEqual(done.data.order.status, 'completed');
  assert.strictEqual(done.data.order.role, 'buyer');

  // 商品标记为已售出
  const sold = await api('GET', `/api/items/${item.id}`);
  assert.strictEqual(sold.data.item.status, 'sold');

  // 买家评价
  const review = await api('POST', `/api/orders/${oid}/review`, {
    token: buyerToken, body: { rating: 5, content: '卖家很靠谱' },
  });
  assert.strictEqual(review.status, 200);
  assert.strictEqual(review.data.order.reviewed, true);

  // 不能重复评价
  const again = await api('POST', `/api/orders/${oid}/review`, { token: buyerToken, body: { rating: 1 } });
  assert.strictEqual(again.status, 400);

  // 角色视角的订单列表
  const bought = await api('GET', '/api/orders?role=buyer', { token: buyerToken });
  assert.ok(bought.data.list.some((o) => o.id === oid && o.role === 'buyer'));
  const soldList = await api('GET', '/api/orders?role=seller', { token: sellerToken });
  assert.ok(soldList.data.list.some((o) => o.id === oid && o.role === 'seller'));

  // 无权查看详情
  const forbidden = await api('GET', `/api/orders/${oid}`, { token: strangerToken });
  assert.strictEqual(forbidden.status, 403);

  // 已完成订单不能再变更状态
  const stale = await api('POST', `/api/orders/${oid}/status`, { token: buyerToken, body: { status: 'cancelled' } });
  assert.strictEqual(stale.status, 400);
});

test('取消订单后商品恢复在售且可再次下单', async () => {
  const { item } = await createItem('seller2', { title: '可取消的商品', category: '服饰鞋包', price: 50 });
  const buyerToken = await ensureToken('buyer2');

  const order = await api('POST', '/api/orders', { token: buyerToken, body: { itemId: item.id } });
  assert.strictEqual(order.status, 201);

  const cancel = await api('POST', `/api/orders/${order.data.order.id}/status`, {
    token: buyerToken, body: { status: 'cancelled' },
  });
  assert.strictEqual(cancel.status, 200);
  assert.strictEqual(cancel.data.order.status, 'cancelled');

  const after = await api('GET', `/api/items/${item.id}`);
  assert.strictEqual(after.data.item.status, 'on_sale', '取消后应恢复在售');

  const again = await api('POST', '/api/orders', { token: buyerToken, body: { itemId: item.id } });
  assert.strictEqual(again.status, 201);
});

/* ================= 消息模块 ================= */
test('会话创建、收发消息、未读与已读回执', async () => {
  const { token: sellerToken, item } = await createItem('seller1', { title: '可咨询的教材', category: '教材书籍', price: 20, images: ['/img/item-book.svg'] });
  const buyerToken = await ensureToken('buyer2');
  const strangerToken = await ensureToken('stranger');

  const conv = await api('POST', '/api/conversations', { token: buyerToken, body: { itemId: item.id } });
  assert.strictEqual(conv.status, 200, JSON.stringify(conv.data));
  const cid = conv.data.conversation.id;
  assert.strictEqual(conv.data.conversation.role, 'buyer');

  // 重复发起返回同一会话
  const conv2 = await api('POST', '/api/conversations', { token: buyerToken, body: { itemId: item.id } });
  assert.strictEqual(conv2.data.conversation.id, cid);

  // 卖家不能对自己发起会话
  const selfConv = await api('POST', '/api/conversations', { token: sellerToken, body: { itemId: item.id } });
  assert.strictEqual(selfConv.status, 400);

  const send = await api('POST', `/api/conversations/${cid}/messages`, {
    token: buyerToken, body: { content: '同学你好，还在吗？' },
  });
  assert.strictEqual(send.status, 201);

  const reply = await api('POST', `/api/conversations/${cid}/messages`, {
    token: sellerToken, body: { content: '在的，随时可以交易～' },
  });
  assert.strictEqual(reply.status, 201);

  // 卖家收到未读
  const unread = await api('GET', '/api/unread', { token: sellerToken });
  assert.ok(unread.data.count >= 1, '卖家应有未读消息');

  // 买家视角的会话列表带未读与摘要
  const convs = await api('GET', '/api/conversations', { token: buyerToken });
  const mine = convs.data.list.find((c) => c.id === cid);
  assert.ok(mine, '会话应出现在列表中');
  assert.strictEqual(mine.unread, 1, '买家应有 1 条未读');
  assert.ok(mine.item.title.length > 0);

  // 历史消息按时间正序
  const history = await api('GET', `/api/conversations/${cid}/messages`, { token: buyerToken });
  assert.strictEqual(history.status, 200);
  assert.strictEqual(history.data.list.length, 2);
  assert.strictEqual(history.data.list[0].fromMe, true);
  assert.strictEqual(history.data.list[1].content, '在的，随时可以交易～');

  // 增量拉取
  const inc = await api('GET', `/api/conversations/${cid}/messages?afterId=${history.data.list[1].id}`, { token: buyerToken });
  assert.strictEqual(inc.data.list.length, 0);

  // 无关用户无权访问
  const forbidden = await api('GET', `/api/conversations/${cid}/messages`, { token: strangerToken });
  assert.strictEqual(forbidden.status, 403);

  // 空消息被拒绝
  const emptyMsg = await api('POST', `/api/conversations/${cid}/messages`, { token: buyerToken, body: { content: '   ' } });
  assert.strictEqual(emptyMsg.status, 400);

  // 已读回执清零
  await api('POST', `/api/conversations/${cid}/read`, { token: sellerToken });
  const afterRead = await api('GET', '/api/unread', { token: sellerToken });
  assert.strictEqual(afterRead.data.count, 0);
});

/* ================= 输入校验与分页 ================= */
test('非法输入被拒绝', async () => {
  const token = await ensureToken('buyer2');

  const cases = [
    { name: '标题过短', body: { title: '短', category: '其他', condition: '全新', price: 1, images: ['/img/logo.svg'] } },
    { name: '分类不存在', body: { title: '合法标题八个字啊', category: '不存在的分类', condition: '全新', price: 1, images: ['/img/logo.svg'] } },
    { name: '成色不合法', body: { title: '合法标题八个字啊', category: '其他', condition: '全新未拆', price: 1, images: ['/img/logo.svg'] } },
    { name: '价格为 0', body: { title: '合法标题八个字啊', category: '其他', condition: '全新', price: 0, images: ['/img/logo.svg'] } },
    { name: '无图片', body: { title: '合法标题八个字啊', category: '其他', condition: '全新', price: 1, images: [] } },
    { name: '非法图片地址', body: { title: '合法标题八个字啊', category: '其他', condition: '全新', price: 1, images: ['javascript:alert(1)'] } },
    { name: '原价低于售价', body: { title: '合法标题八个字啊', category: '其他', condition: '全新', price: 100, originalPrice: 10, images: ['/img/logo.svg'] } },
  ];
  for (const c of cases) {
    const res = await api('POST', '/api/items', { token, body: c.body });
    assert.strictEqual(res.status, 400, `${c.name} 应返回 400，实际 ${res.status}`);
  }

  // 注册参数校验
  const badRegister = await api('POST', '/api/auth/register', {
    body: { studentId: 'abc', nickname: 'x', password: '123' },
  });
  assert.strictEqual(badRegister.status, 400);

  // 订单参数校验
  const badOrder = await api('POST', '/api/orders', { token, body: { itemId: 0 } });
  assert.strictEqual(badOrder.status, 400);
});

test('分页参数生效且不越界', async () => {
  const token = await ensureToken('seller2');
  const made = [];
  for (let i = 0; i < 6; i += 1) {
    const { item } = await createItem('seller2', { title: `分页测试商品编号 ${i}`, price: 10 + i });
    made.push(item.id);
  }

  const p1 = await api('GET', '/api/items?page=1&pageSize=4&sort=new');
  const p2 = await api('GET', '/api/items?page=2&pageSize=4&sort=new');
  assert.strictEqual(p1.status, 200);
  assert.ok(p1.data.list.length > 0, '第一页应有数据');
  assert.strictEqual(p1.data.page, 1);
  assert.strictEqual(p1.data.pageSize, 4);
  assert.ok(p1.data.hasMore, '第一页应标记还有下一页');

  const ids1 = p1.data.list.map((i) => i.id);
  const ids2 = p2.data.list.map((i) => i.id);
  assert.strictEqual(new Set([...ids1, ...ids2]).size, ids1.length + ids2.length, '分页数据不应重复');
  assert.ok(made.some((id) => ids1.includes(id) || ids2.includes(id)), '新建商品应能被检索到');

  const huge = await api('GET', '/api/items?pageSize=9999');
  assert.ok(huge.data.pageSize <= 30, 'pageSize 应被上限约束');

  const mineAll = await api('GET', '/api/items?mine=1&status=all&pageSize=30', { token });
  assert.strictEqual(mineAll.status, 200);
  assert.ok(mineAll.data.list.length >= 6, 'mine=1 应返回自己的商品');
});
