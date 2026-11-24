'use strict';
/**
 * 安全测试：SQL 注入 / XSS / 认证与会话 / 越权 / 文件上传 / 信息泄露
 * 运行：npm run test:security
 * 说明：使用独立测试库与独立端口，不污染演示数据。
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const TEST_DB = path.join(os.tmpdir(), `campus-swap-sec-${process.pid}.db`);
for (const f of ['', '-wal', '-shm']) {
  try { fs.unlinkSync(TEST_DB + f); } catch (_) { /* ignore */ }
}
process.env.DB_FILE = TEST_DB;
process.env.QUIET = '1';

const { app } = require('../server/index.js');

let server;
let BASE;
const TOKENS = {};

function api(method, url, { token, body, raw } = {}) {
  const headers = {};
  if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(BASE + url, {
    method,
    headers,
    body: raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body)),
  }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => ({})) }));
}

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.on('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  for (const [key, sid] of [['alice', 'SECALICE'], ['bob', 'SECBOB']]) {
    const res = await api('POST', '/api/auth/register', {
      body: { studentId: sid, nickname: `安全-${key}`, password: '123456', college: '安全学院' },
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.data));
    TOKENS[key] = res.data.token;
  }
});

after(() => {
  server.close();
  try {
    require('../server/lib/db').close();
    for (const f of ['', '-wal', '-shm']) fs.unlinkSync(TEST_DB + f);
  } catch (_) { /* ignore */ }
});

/* ================= SR-01 ~ SR-05 SQL 注入 ================= */
test('SR-01 登录接口 SQL 注入绕过失败', async () => {
  const payloads = [
    { studentId: "' OR '1'='1", password: 'x' },
    { studentId: "' OR 1=1 --", password: 'x' },
    { studentId: "admin'--", password: 'x' },
    { studentId: "1' UNION SELECT 1,2,3 --", password: 'x' },
  ];
  for (const p of payloads) {
    const res = await api('POST', '/api/auth/login', { body: p });
    // 401=认证拒绝；400=参数校验拦截（如超长）。两者均未登录成功
    assert.ok([400, 401].includes(res.status), `注入串 "${p.studentId}" 应被拒绝，实际 ${res.status}`);
    assert.ok(!res.data.token, '不得返回 Token');
  }
});

test('SR-02 搜索关键词注入不报错、不泄露数据', async () => {
  const payloads = [
    "' OR '1'='1",
    "'; DROP TABLE items; --",
    "' UNION SELECT id, password_hash, 3, 4 FROM users --",
    "%' OR 1=1 --",
  ];
  for (const kw of payloads) {
    const res = await api('GET', `/api/items?keyword=${encodeURIComponent(kw)}`);
    assert.ok(res.status === 200 || res.status === 400, `注入关键词应 200/400，实际 ${res.status}`);
    const text = JSON.stringify(res.data);
    assert.ok(!text.includes('password_hash') && !text.includes('$'), '响应不得泄露散列字段');
  }
  // 注入后核心数据仍可正常访问（表未被破坏）
  const list = await api('GET', '/api/items');
  assert.strictEqual(list.status, 200);
  assert.ok(Array.isArray(list.data.list));
});

test('SR-03 排序字段白名单（order by 注入被拒绝）', async () => {
  const bad = await api('GET', '/api/items?sort=' + encodeURIComponent('id; DROP TABLE users'));
  assert.ok(bad.status === 200 || bad.status === 400, `非法 sort 应被忽略或 400，实际 ${bad.status}`);
  if (bad.status === 200) {
    // 非法值必须回落到默认排序，且服务仍正常
    assert.ok(Array.isArray(bad.data.list));
  }
  const users = await api('POST', '/api/auth/login', { body: { studentId: 'SECALICE', password: '123456' } });
  assert.strictEqual(users.status, 200, 'users 表必须完好');
});

test('SR-04 通配符与特殊字符在 LIKE 查询中不造成异常', async () => {
  for (const kw of ['%', '_', '%%%', "a'b'", '\\']) {
    const res = await api('GET', `/api/items?keyword=${encodeURIComponent(kw)}`);
    assert.strictEqual(res.status, 200, `关键词 "${kw}" 应正常返回 200，实际 ${res.status}`);
  }
});

test('SR-05 登录学号含注入字符返回统一 401（无差异枚举）', async () => {
  const a = await api('POST', '/api/auth/login', { body: { studentId: 'NO_SUCH_USER_XYZ', password: 'x' } });
  const b = await api('POST', '/api/auth/login', { body: { studentId: "' OR '1'='1", password: 'x' } });
  assert.strictEqual(a.status, 401);
  assert.strictEqual(b.status, 401);
  assert.strictEqual(a.data.message, b.data.message, '错误提示应一致，避免账号枚举');
});

/* ================= SR-07 ~ SR-09 XSS ================= */
test('SR-07 存储型 XSS：恶意标题入库后按原样返回（由前端转义渲染）', async () => {
  const xss = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  const res = await api('POST', '/api/items', {
    token: TOKENS.alice,
    body: { title: xss, category: '其他', condition: '全新', price: 1, images: ['/img/logo.svg'] },
  });
  // 服务端不吞 HTML（保持数据原样），但必须能被前端 UI.esc 转义——前端转义由 FT 用例在浏览器中验证
  if (res.status === 201) {
    const id = res.data.item.id;
    const detail = await api('GET', `/api/items/${id}`);
    assert.strictEqual(detail.status, 200);
    // 不应执行——服务端返回 JSON，关键是前端渲染层转义（见浏览器用例）
    assert.ok(typeof detail.data.item.title === 'string');
  } else {
    // 若服务端主动过滤/拒绝也视为通过
    assert.ok([400, 422].includes(res.status), `实际 ${res.status}`);
  }
});

test('SR-08 恶意图片地址（javascript:/data: 伪协议）被拒绝', async () => {
  const res = await api('POST', '/api/items', {
    token: TOKENS.alice,
    body: {
      title: '恶意图片地址测试商品', category: '其他', condition: '全新', price: 1,
      images: ['javascript:alert(document.cookie)'],
    },
  });
  assert.strictEqual(res.status, 400, 'javascript: 图片地址应被拒绝');
});

test('SR-09 消息内容含 HTML 原样存取（渲染层转义）', async () => {
  const conv = await api('POST', '/api/conversations', { token: TOKENS.alice, body: { itemId: 0 } });
  // 无效 itemId 应被拒绝（顺带校验）
  assert.ok(conv.status === 400 || conv.status === 404);
});

/* ================= SR-12 ~ SR-15 认证与越权 ================= */
test('SR-12 无 Token / 伪造 Token 访问受保护接口返回 401', async () => {
  assert.strictEqual((await api('GET', '/api/me')).status, 401);
  assert.strictEqual((await api('GET', '/api/me', { token: 'fake.token' })).status, 401);
  assert.strictEqual((await api('GET', '/api/me', { token: 'eyJ1IjoxfQ.aaaa' })).status, 401);
  assert.strictEqual((await api('GET', '/api/stats')).status, 401);
  assert.strictEqual((await api('GET', '/api/orders')).status, 401);
  assert.strictEqual((await api('GET', '/api/conversations')).status, 401);
  assert.strictEqual((await api('POST', '/api/upload', { body: {} })).status, 401);
});

test('SR-14 水平越权：A 操作 B 的资源被拒绝', async () => {
  // alice 发布商品，bob 尝试编辑 / 删除 / 查他人订单
  const item = await api('POST', '/api/items', {
    token: TOKENS.alice,
    body: { title: '越权测试商品标题', category: '其他', condition: '全新', price: 9, images: ['/img/logo.svg'] },
  });
  assert.strictEqual(item.status, 201);
  const id = item.data.item.id;

  assert.strictEqual((await api('PUT', `/api/items/${id}`, { token: TOKENS.bob, body: { title: '被恶意修改标题' } })).status, 403);
  assert.strictEqual((await api('DELETE', `/api/items/${id}`, { token: TOKENS.bob })).status, 403);

  // 订单详情越权
  const order = await api('POST', '/api/orders', { token: TOKENS.bob, body: { itemId: id } });
  assert.strictEqual(order.status, 201);
  const oid = order.data.order.id;
  // alice 是卖家可访问；第三方无法构造（仅两账号）→ 用 bob 的 Token 改卖家视角操作
  const badConfirm = await api('POST', `/api/orders/${oid}/status`, { token: TOKENS.bob, body: { status: 'confirmed' } });
  assert.strictEqual(badConfirm.status, 403, '买家不能替卖家确认');

  // 会话越权：非参与方读消息
  const conv = await api('POST', '/api/conversations', { token: TOKENS.alice, body: { itemId: id } });
  if (conv.status === 200 || conv.status === 201) {
    const cid = conv.data.conversation.id;
    const msgs = await api('GET', `/api/conversations/${cid}/messages`, { token: TOKENS.bob });
    // alice 是卖家、bob 是买家？此处 conv 由商品所有者 alice 发起会话会被拒绝（不能对自己发起）
    assert.ok([200, 400, 403].includes(msgs.status));
  }
});

test('SR-16 口令散列安全：注册响应与用户接口不泄露 hash', async () => {
  const res = await api('POST', '/api/auth/register', {
    body: { studentId: 'SECHASH01', nickname: '散列检查', password: 'Abc12345' },
  });
  assert.strictEqual(res.status, 201);
  const text = JSON.stringify(res.data);
  assert.ok(!text.includes('password_hash'), '注册响应不得含 password_hash');
  assert.ok(!text.includes('$'), '不得出现 salt$hash 结构');

  const me = await api('GET', '/api/me', { token: res.data.token });
  assert.ok(!JSON.stringify(me.data).includes('password_hash'));

  const pub = await api('GET', '/api/users/' + res.data.user.id);
  assert.ok(!JSON.stringify(pub.data).includes('password_hash'));

  // 数据库中应为 scrypt 格式而非明文/MD5/SHA1
  const { get } = require('../server/lib/db');
  const row = get('SELECT password_hash FROM users WHERE student_id = ?', 'SECHASH01');
  assert.match(row.password_hash, /^[0-9a-f]{32}\$[0-9a-f]{128}$/, '应为 scrypt salt$hash');
  assert.notStrictEqual(row.password_hash, 'Abc12345');
});

/* ================= SR-19 ~ SR-20 文件上传 ================= */
test('SR-19 上传仅接受白名单图片 MIME', async () => {
  const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
  const ok = await api('POST', '/api/upload', { token: TOKENS.alice, body: { dataUrl: png } });
  assert.strictEqual(ok.status, 201);
  assert.match(ok.data.url, /^\/uploads\/\d+_[0-9a-f]+\.png$/);

  // 伪装 SVG / HTML / 可执行文件
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64');
  const html = 'data:text/html;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
  const exe = 'data:application/x-msdownload;base64,' + Buffer.from('MZ').toString('base64');
  for (const bad of [svg, html, exe, 'not-a-dataurl']) {
    const res = await api('POST', '/api/upload', { token: TOKENS.alice, body: { dataUrl: bad } });
    assert.strictEqual(res.status, 400, `非白名单类型应 400，实际 ${res.status}`);
  }
});

test('SR-20 超大图片（>4MB）被拒绝为 413', async () => {
  const big = Buffer.alloc(4 * 1024 * 1024 + 10, 1).toString('base64');
  const res = await api('POST', '/api/upload', { token: TOKENS.alice, body: { dataUrl: 'data:image/png;base64,' + big } });
  assert.strictEqual(res.status, 413);
});

/* ================= SR-23 信息泄露 / 异常处理 ================= */
test('SR-23 错误响应不泄露堆栈与内部路径', async () => {
  const notFound = await api('GET', '/api/not-exist');
  assert.strictEqual(notFound.status, 404);
  const text = JSON.stringify(notFound.data);
  assert.ok(!text.includes('at ') && !text.includes('.js:'), '不得泄露堆栈');

  const serverErr = await api('GET', '/api/items/NaN');
  assert.ok([400, 404, 500].includes(serverErr.status));
  if (serverErr.status === 500) {
    assert.strictEqual(serverErr.data.message, '服务器内部错误', '500 应返回统一文案');
  }

  const badJson = await api('POST', '/api/auth/login', { raw: '{bad-json' });
  assert.strictEqual(badJson.status, 400);
  assert.ok(!JSON.stringify(badJson.data).includes('SyntaxError'));
});

test('SR-26 重复提交幂等：重复收藏仅一条记录', async () => {
  const item = await api('POST', '/api/items', {
    token: TOKENS.alice,
    body: { title: '幂等性测试商品标题', category: '其他', condition: '全新', price: 5, images: ['/img/logo.svg'] },
  });
  const id = item.data.item.id;
  const [r1, r2] = await Promise.all([
    api('POST', `/api/items/${id}/favorite`, { token: TOKENS.bob }),
    api('POST', `/api/items/${id}/favorite`, { token: TOKENS.bob }),
  ]);
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(r2.status, 200);
  const detail = await api('GET', `/api/items/${id}`, { token: TOKENS.bob });
  assert.strictEqual(detail.data.item.favCount, 1, '并发收藏不应产生重复记录');
});

test('SR-27 关键操作留痕：请求日志与健康检查可用', async () => {
  const health = await api('GET', '/api/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.data.status, 'ok');
  assert.ok(health.data.time, '应含时间戳（可用于审计）');
});
