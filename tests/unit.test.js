'use strict';
/**
 * 单元测试：认证与校验工具函数
 * 运行：npm run test:unit
 * 覆盖：
 *  - 口令散列与校验（scrypt + 定时比较）
 *  - Token 签发 / 解析 / 篡改 / 过期
 *  - 字符串 / 数值 / 枚举 / 分页参数校验
 *  - 图片 JSON 解析、公开用户脱敏
 */
const { test } = require('node:test');
const assert = require('node:assert');

process.env.QUIET = '1';
const { hashPassword, verifyPassword, createToken, parseToken } = require('../server/lib/auth');
const {
  str, num, pickOne, page, round2, parseImages, publicUser, CATEGORIES, CONDITIONS,
} = require('../server/lib/util');
const { HttpError } = require('../server/lib/http');

/** 断言某函数抛出 HttpError(400) 并返回消息 */
function assertBad(fn, keyword) {
  try {
    fn();
    assert.fail('应当抛出校验错误');
  } catch (e) {
    assert.ok(e instanceof HttpError, `应为 HttpError，实际 ${e.constructor.name}`);
    assert.strictEqual(e.status, 400);
    if (keyword) assert.ok(String(e.message).includes(keyword), `消息 "${e.message}" 应含 "${keyword}"`);
  }
}

/* ================= 口令散列 ================= */
test('UT-01 合法口令散列后可校验通过', () => {
  const stored = hashPassword('Abc12345');
  assert.notStrictEqual(stored, 'Abc12345', '不得存储明文');
  assert.match(stored, /^[0-9a-f]{32}\$[0-9a-f]{128}$/, '格式应为 salt$hash');
  assert.strictEqual(verifyPassword('Abc12345', stored), true);
});

test('UT-02 错误口令与空散列均被拒绝', () => {
  const stored = hashPassword('Abc12345');
  assert.strictEqual(verifyPassword('Ab12345', stored), false);
  assert.strictEqual(verifyPassword('Abc12345', ''), false);
  assert.strictEqual(verifyPassword('Abc12345', 'no-hash-format'), false);
  assert.strictEqual(verifyPassword('Abc12345', null), false);
});

test('UT-03 相同口令两次散列结果不同（随机盐）', () => {
  assert.notStrictEqual(hashPassword('same-pass'), hashPassword('same-pass'));
});

/* ================= Token ================= */
test('UT-04 Token 载荷与有效期正确', () => {
  const token = createToken(1024);
  const data = parseToken(token);
  assert.ok(data, '应能解析');
  assert.strictEqual(data.u, 1024);
  const ttl = data.e - Date.now();
  assert.ok(ttl > 6.9 * 86400e3 && ttl <= 7 * 86400e3, `有效期应约 7 天，实际 ${Math.round(ttl / 86400e3 * 100) / 100} 天`);
});

test('UT-05 签名被篡改时解析失败', () => {
  const token = createToken(1024);
  const [payload, sig] = token.split('.');
  // 篡改载荷但保留原签名
  const forged = Buffer.from(JSON.stringify({ u: 999, e: Date.now() + 86400e3 })).toString('base64url') + '.' + sig;
  assert.strictEqual(parseToken(forged), null);
  // 篡改签名
  assert.strictEqual(parseToken(payload + '.bad-signature'), null);
  // 伪造的完整 token
  assert.strictEqual(parseToken('eyJmYWtlIjp0cnVlfQ.forgedsignature'), null);
  assert.strictEqual(parseToken(''), null);
  assert.strictEqual(parseToken(null), null);
  assert.strictEqual(parseToken('no-dot-token'), null);
});

test('UT-06 过期 Token 被拒绝', () => {
  const crypto = require('node:crypto');
  // 构造一个已过期的载荷，用相同逻辑签名（直接用 createToken 的载荷格式手工拼装过期值）
  const payload = Buffer.from(JSON.stringify({ u: 1, e: Date.now() - 1000 })).toString('base64url');
  // 复用 auth 内部签名不可行，这里改为：签发后修改 e 字段必然破坏签名 → 用“过期且签名有效”的方式
  // 方案：auth.createToken 固定 7 天，无法直接造过期；改为验证 parseToken 对 e<now 的载荷拒绝逻辑
  // —— 通过重放篡改会先被签名校验拦下，因此这里验证签名有效但已过期的场景：
  const secret = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '..', 'data', 'secret.key'), 'utf8').trim();
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  assert.strictEqual(parseToken(`${payload}.${sig}`), null, '过期 Token 应返回 null');
});

/* ================= 参数校验 ================= */
test('UT-07 字符串字段：必填 / 长度 / 默认值', () => {
  assertBad(() => str({}, 'title', { label: '标题' }), '请填写标题');
  assertBad(() => str({ title: '  ' }, 'title', { label: '标题' }), '请填写标题');
  assertBad(() => str({ title: '短' }, 'title', { min: 2, label: '标题' }), '至少 2');
  assertBad(() => str({ title: 'x'.repeat(300) }, 'title', { max: 200, label: '标题' }), '不能超过 200');
  assert.strictEqual(str({ title: '  自行车  ' }, 'title', { min: 2 }).trim(), '自行车');
  // 非必填缺省返回 def
  assert.strictEqual(str({}, 'college', { required: false, def: '' }), '');
});

test('UT-08 数值字段：类型 / 范围 / 整数', () => {
  assertBad(() => num({ price: 'abc' }, 'price'), '必须是数字');
  assertBad(() => num({ price: 0 }, 'price', { min: 0.01 }), '不能小于');
  assertBad(() => num({ price: 1e9 }, 'price', { max: 100000 }), '不能大于');
  assertBad(() => num({ page: 1.5 }, 'page', { integer: true, required: false }), '必须是整数');
  assert.strictEqual(num({ price: 66.5 }, 'price', { min: 0.01 }), 66.5);
  assertBad(() => num({}, 'price', { label: '价格' }), '请填写价格');
});

test('UT-09 枚举字段：白名单校验', () => {
  assertBad(() => pickOne({ category: '不存在的分类' }, 'category', CATEGORIES, { label: '分类' }), '取值不合法');
  assertBad(() => pickOne({ condition: '全新未拆' }, 'condition', CONDITIONS, { label: '成色' }), '取值不合法');
  assert.strictEqual(pickOne({ category: '数码电器' }, 'category', CATEGORIES), '数码电器');
  assertBad(() => pickOne({}, 'category', CATEGORIES, { label: '分类' }), '请选择');
});

test('UT-10 分页参数越界归一', () => {
  // page=0 → 1；pageSize 超上限 → 30
  const a = page({ page: '0', pageSize: '9999' });
  assert.strictEqual(a.p, 1);
  assert.strictEqual(a.s, 30);
  assert.strictEqual(a.offset, 0);
  // 负数 / 非数字
  const b = page({ page: '-5', pageSize: 'abc' });
  assert.strictEqual(b.p, 1);
  assert.strictEqual(b.s, 12, '非法 pageSize 回落默认 12');
  // 正常值
  const c = page({ page: '3', pageSize: '10' });
  assert.deepStrictEqual({ p: c.p, s: c.s, offset: c.offset }, { p: 3, s: 10, offset: 20 });
  // pageSize 最小为 1
  assert.strictEqual(page({ pageSize: '-3' }).s, 1);
});

/* ================= 工具函数 ================= */
test('UT-11 金额四舍五入到 2 位', () => {
  assert.strictEqual(round2(66), 66);
  assert.strictEqual(round2(66.666), 66.67);
  assert.strictEqual(round2('9.999'), 10);
});

test('UT-12 图片 JSON 解析容错', () => {
  assert.deepStrictEqual(parseImages('["/img/a.png"]'), ['/img/a.png']);
  assert.deepStrictEqual(parseImages(''), []);
  assert.deepStrictEqual(parseImages('not-json'), []);
  assert.deepStrictEqual(parseImages('{"a":1}'), [], '非数组返回空');
});

test('UT-13 公开用户对象不含口令散列', () => {
  const u = { id: 1, student_id: '20230101', nickname: '张小满', password_hash: 'salt$hash', avatar: '', college: '', phone: '', bio: '', created_at: '2026-01-01' };
  const pub = publicUser(u);
  assert.ok(!('password_hash' in pub));
  assert.ok(!JSON.stringify(pub).includes('salt$hash'));
  assert.strictEqual(pub.studentId, '20230101');
  assert.strictEqual(publicUser(null), null);
});
