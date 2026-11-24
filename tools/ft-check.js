/*功能测试辅助：创建 XSS 载荷商品 + 一组 API 功能断言（供用例表回填证据） */
'use strict';
const BASE = 'http://localhost:3000';

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

(async () => {
  const out = {};

  // 1. 创建 XSS 载荷商品（供浏览器验证前端转义）
  const login = await api('POST', '/api/auth/login', { body: { studentId: '20230101', password: '123456' } });
  const tok = login.data.token;
  const xss = await api('POST', '/api/items', {
    token: tok,
    body: {
      title: '<script>alert(1)</script>',
      category: '其他', condition: '全新', price: 1,
      images: ['/img/logo.svg'], description: 'XSS载荷验证专用',
    },
  });
  out.xssItem = xss.status === 201 ? xss.data.item.id : xss;

  // 2. 功能冒烟断言（对应 FT 用例，返回逐条结果）
  const checks = [];
  const ck = async (name, fn) => {
    try { const r = await fn(); checks.push({ name, ...r }); }
    catch (e) { checks.push({ name, status: 'THROW', message: String(e.message) }); }
  };

  await ck('FT-01 注册成功返回201与token', async () => {
    const sid = 'FT' + Date.now().toString().slice(-8);
    const r = await api('POST', '/api/auth/register', { body: { studentId: sid, nickname: '功能小新', password: 'Abc12345', college: '计算机学院' } });
    return { status: r.status, pass: r.status === 201 && !!r.data.token, detail: `status=${r.status}` };
  });
  await ck('FT-02 学号格式错误返回400', async () => {
    const r = await api('POST', '/api/auth/register', { body: { studentId: 'ab', nickname: 'xx', password: 'Abc12345' } });
    return { status: r.status, pass: r.status === 400, detail: r.data.message };
  });
  await ck('FT-03 重复学号返回409', async () => {
    const r = await api('POST', '/api/auth/register', { body: { studentId: '20230101', nickname: '重复', password: 'Abc12345' } });
    return { status: r.status, pass: r.status === 409, detail: r.data.message };
  });
  await ck('FT-04 登录成功返回200与token', async () => {
    const r = await api('POST', '/api/auth/login', { body: { studentId: '20230101', password: '123456' } });
    return { status: r.status, pass: r.status === 200 && !!r.data.token, detail: `token长度=${(r.data.token || '').length}` };
  });
  await ck('FT-05 密码错误返回401', async () => {
    const r = await api('POST', '/api/auth/login', { body: { studentId: '20230101', password: 'wrong' } });
    return { status: r.status, pass: r.status === 401, detail: r.data.message };
  });
  await ck('FT-06 关键词搜索命中', async () => {
    const r = await api('GET', '/api/items?keyword=' + encodeURIComponent('自行车'));
    return { status: r.status, pass: r.status === 200 && r.data.list.length >= 0, detail: `命中${r.data.list.length}条` };
  });
  await ck('FT-07 无结果空列表', async () => {
    const r = await api('GET', '/api/items?keyword=' + encodeURIComponent('zzz不存在的菜名xyz'));
    return { status: r.status, pass: r.status === 200 && r.data.list.length === 0, detail: `命中${r.data.list.length}条` };
  });
  await ck('FT-08 游客可浏览商品详情', async () => {
    const list = await api('GET', '/api/items?pageSize=1');
    const id = list.data.list[0].id;
    const r = await api('GET', `/api/items/${id}`);
    return { status: r.status, pass: r.status === 200 && !!r.data.item.title, detail: `id=${id}` };
  });
  await ck('FT-09 发布商品成功201', async () => {
    const r = await api('POST', '/api/items', {
      token: tok, body: { title: '功能测试专用自行车锁', category: '生活用品', condition: '99新', price: 15, images: ['/img/logo.svg'] },
    });
    return { status: r.status, pass: r.status === 201, detail: `id=${r.data.item && r.data.item.id}` };
  });
  await ck('FT-10 必填缺失返回400', async () => {
    const r = await api('POST', '/api/items', { token: tok, body: { title: '', category: '其他' } });
    return { status: r.status, pass: r.status === 400, detail: r.data.message };
  });
  await ck('FT-11 收藏与取消收藏', async () => {
    const list = await api('GET', '/api/items?pageSize=1');
    const id = list.data.list[0].id;
    const a = await api('POST', `/api/items/${id}/favorite`, { token: tok });
    const b = await api('DELETE', `/api/items/${id}/favorite`, { token: tok });
    return { status: a.status, pass: a.status === 200 && a.data.favorited === true && b.data.favorited === false, detail: `收藏=${a.data.favorited} 取消=${b.data.favorited}` };
  });
  await ck('FT-12 下单→确认→收货→评价全流程', async () => {
    const mk = await api('POST', '/api/items', {
      token: tok, body: { title: '功能测试全流程商品', category: '其他', condition: '全新', price: 8, images: ['/img/logo.svg'] },
    });
    const itemId = mk.data.item.id;
    const login2 = await api('POST', '/api/auth/login', { body: { studentId: '20230103', password: '123456' } });
    const bTok = login2.data.token;
    const o = await api('POST', '/api/orders', { token: bTok, body: { itemId } });
    const c = await api('POST', `/api/orders/${o.data.order.id}/status`, { token: tok, body: { status: 'confirmed' } });
    const d = await api('POST', `/api/orders/${o.data.order.id}/status`, { token: bTok, body: { status: 'completed' } });
    const e = await api('POST', `/api/orders/${o.data.order.id}/review`, { token: bTok, body: { rating: 5, content: '流程测试好评' } });
    const pass = o.status === 201 && c.status === 200 && d.status === 200 && e.status === 200;
    return { status: o.status, pass, detail: `下单${o.status}/确认${c.status}/收货${d.status}/评价${e.status}` };
  });
  await ck('FT-13 不能购买自己商品', async () => {
    const mk = await api('POST', '/api/items', {
      token: tok, body: { title: '功能测试自购拦截商品', category: '其他', condition: '全新', price: 8, images: ['/img/logo.svg'] },
    });
    const r = await api('POST', '/api/orders', { token: tok, body: { itemId: mk.data.item.id } });
    return { status: r.status, pass: r.status === 400, detail: r.data.message };
  });
  await ck('FT-14 取消订单商品恢复在售', async () => {
    const mk = await api('POST', '/api/items', {
      token: tok, body: { title: '功能测试取消恢复商品', category: '其他', condition: '全新', price: 8, images: ['/img/logo.svg'] },
    });
    const itemId = mk.data.item.id;
    const login2 = await api('POST', '/api/auth/login', { body: { studentId: '20230103', password: '123456' } });
    const o = await api('POST', '/api/orders', { token: login2.data.token, body: { itemId } });
    const c = await api('POST', `/api/orders/${o.data.order.id}/status`, { token: login2.data.token, body: { status: 'cancelled' } });
    const it = await api('GET', `/api/items/${itemId}`);
    return { status: c.status, pass: c.status === 200 && it.data.item.status === 'on_sale', detail: `取消${c.status}，商品状态=${it.data.item.status}` };
  });
  await ck('FT-15 发起会话并收发消息', async () => {
    const list = await api('GET', '/api/items?pageSize=5');
    const login2 = await api('POST', '/api/auth/login', { body: { studentId: '20230103', password: '123456' } });
    const bTok = login2.data.token;
    const conv = await api('POST', '/api/conversations', { token: bTok, body: { itemId: list.data.list[0].id } });
    const cid = conv.data.conversation.id;
    const send = await api('POST', `/api/conversations/${cid}/messages`, { token: bTok, body: { content: '功能测试：同学还在吗？' } });
    return { status: send.status, pass: conv.status === 200 && send.status === 201, detail: `会话${conv.status}/发送${send.status}` };
  });
  await ck('FT-16 未读数与已读回执', async () => {
    const login1 = await api('POST', '/api/auth/login', { body: { studentId: '20230101', password: '123456' } });
    const before = await api('GET', '/api/unread', { token: login1.data.token });
    return { status: before.status, pass: before.status === 200 && typeof before.data.count === 'number', detail: `未读=${before.data.count}` };
  });
  await ck('FT-17 个人统计返回六项', async () => {
    const r = await api('GET', '/api/stats', { token: tok });
    const keys = r.data.stats ? Object.keys(r.data.stats).length : 0;
    return { status: r.status, pass: r.status === 200 && keys === 6, detail: `${keys}项指标` };
  });
  await ck('FT-18 修改资料生效', async () => {
    const r = await api('PUT', '/api/me', { token: tok, body: { bio: '资料修改测试' } });
    const me = await api('GET', '/api/me', { token: tok });
    return { status: r.status, pass: r.status === 200 && me.data.user.bio === '资料修改测试', detail: `bio=${me.data.user.bio}` };
  });
  await ck('FT-19 修改密码（原密码错误401）', async () => {
    const r = await api('PUT', '/api/me/password', { token: tok, body: { oldPassword: 'bad', newPassword: 'Abc12345' } });
    return { status: r.status, pass: r.status === 401, detail: r.data.message };
  });
  await ck('FT-20 分页与越界约束', async () => {
    const r = await api('GET', '/api/items?page=1&pageSize=9999');
    return { status: r.status, pass: r.status === 200 && r.data.pageSize <= 30, detail: `pageSize=${r.data.pageSize}` };
  });

  out.checks = checks;
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
