'use strict';
/** 认证模块路由：注册 / 登录 / 当前用户 */
const { all, get, run, now } = require('../lib/db');
const { hashPassword, verifyPassword, createToken, requireAuth } = require('../lib/auth');
const { HttpError } = require('../lib/http');
const { str, bad, publicUser } = require('../lib/util');

const STUDENT_ID = /^[A-Za-z0-9]{4,20}$/;

module.exports = (app) => {
  // 注册
  app.post('/api/auth/register', (ctx) => {
    const studentId = str(ctx.body, 'studentId', { label: '学号', min: 4, max: 20 });
    if (!STUDENT_ID.test(studentId)) bad('学号只能包含 4-20 位字母或数字');

    const nickname = str(ctx.body, 'nickname', { label: '昵称', min: 2, max: 16 });
    const password = str(ctx.body, 'password', { label: '密码', min: 6, max: 32 });
    const college = str(ctx.body, 'college', { label: '学院', required: false, max: 24, def: '' });
    const phone = str(ctx.body, 'phone', { label: '手机号', required: false, max: 20, def: '' });
    if (phone && !/^[0-9\- ]{6,20}$/.test(phone)) bad('手机号格式不正确');

    if (get('SELECT id FROM users WHERE student_id = ?', studentId)) {
      throw new HttpError(409, '该学号已注册，请直接登录');
    }

    const r = run(
      'INSERT INTO users (student_id, nickname, password_hash, avatar, college, phone, bio, created_at) VALUES (?,?,?,?,?,?,?,?)',
      studentId, nickname, hashPassword(password), '', college, phone, '', now()
    );

    const user = get('SELECT * FROM users WHERE id = ?', r.lastInsertRowid);
    ctx.json(201, { code: 201, message: '注册成功', token: createToken(user.id), user: publicUser(user) });
  });

  // 登录
  app.post('/api/auth/login', (ctx) => {
    const studentId = str(ctx.body, 'studentId', { label: '学号', min: 1, max: 20 });
    const password = str(ctx.body, 'password', { label: '密码', min: 1, max: 32 });

    const user = get('SELECT * FROM users WHERE student_id = ?', studentId);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, '学号或密码错误');
    }
    ctx.json(200, { code: 200, message: '登录成功', token: createToken(user.id), user: publicUser(user) });
  });

  // 当前登录用户
  app.get('/api/me', (ctx) => {
    const me = requireAuth(ctx);
    const fresh = get('SELECT * FROM users WHERE id = ?', me.id);
    ctx.json(200, { code: 200, user: publicUser(fresh) });
  });

  // 修改资料
  app.put('/api/me', (ctx) => {
    const me = requireAuth(ctx);
    const nickname = str(ctx.body, 'nickname', { label: '昵称', required: false, min: 2, max: 16, def: me.nickname });
    const college = str(ctx.body, 'college', { label: '学院', required: false, max: 24, def: me.college });
    const phone = str(ctx.body, 'phone', { label: '手机号', required: false, max: 20, def: me.phone });
    const bio = str(ctx.body, 'bio', { label: '个人简介', required: false, max: 60, def: me.bio });
    const avatar = str(ctx.body, 'avatar', { label: '头像', required: false, max: 500, def: me.avatar });

    run('UPDATE users SET nickname=?, college=?, phone=?, bio=?, avatar=? WHERE id=?',
      nickname, college, phone, bio, avatar, me.id);
    const fresh = get('SELECT * FROM users WHERE id = ?', me.id);
    ctx.json(200, { code: 200, message: '资料已更新', user: publicUser(fresh) });
  });

  // 修改密码
  app.put('/api/me/password', (ctx) => {
    const me = requireAuth(ctx);
    const oldPwd = str(ctx.body, 'oldPassword', { label: '原密码' });
    const newPwd = str(ctx.body, 'newPassword', { label: '新密码', min: 6, max: 32 });
    const user = get('SELECT * FROM users WHERE id = ?', me.id);
    if (!verifyPassword(oldPwd, user.password_hash)) throw new HttpError(401, '原密码错误');
    run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(newPwd), me.id);
    ctx.json(200, { code: 200, message: '密码已修改，请重新登录' });
  });

  // 个人统计：我发布的 / 我卖出 / 我买到 / 收藏 / 累计成交额
  app.get('/api/stats', (ctx) => {
    const me = requireAuth(ctx);
    const row = get(`
      SELECT
        (SELECT COUNT(*) FROM items   WHERE seller_id = ? AND status IN ('on_sale','trading')) AS on_sale,
        (SELECT COUNT(*) FROM items   WHERE seller_id = ? AND status = 'sold')                  AS sold,
        (SELECT COUNT(*) FROM orders  WHERE buyer_id  = ? AND status = 'completed')             AS bought,
        (SELECT COUNT(*) FROM favorites WHERE user_id = ?)                                      AS favorites,
        (SELECT COALESCE(SUM(price),0) FROM orders WHERE seller_id = ? AND status = 'completed') AS revenue,
        (SELECT COUNT(*) FROM orders  WHERE seller_id = ? AND status = 'pending')               AS pending
    `, me.id, me.id, me.id, me.id, me.id, me.id);
    ctx.json(200, { code: 200, stats: row });
  });

  // 公开的用户主页
  app.get('/api/users/:id', (ctx) => {
    const uid = Number(ctx.params.id);
    const user = get(`
      SELECT u.*,
        (SELECT ROUND(AVG(rating),1) FROM reviews r WHERE r.seller_id=u.id) AS rating,
        (SELECT COUNT(*)            FROM reviews r WHERE r.seller_id=u.id) AS rating_count
      FROM users u WHERE u.id = ?`, uid);
    if (!user) throw new HttpError(404, '用户不存在');
    const items = all(`
      SELECT i.*, u.nickname AS seller_nickname, u.avatar AS seller_avatar, u.college AS seller_college,
             (SELECT COUNT(*) FROM favorites f WHERE f.item_id=i.id) AS fav_count,
             0 AS fav_flag
      FROM items i JOIN users u ON u.id=i.seller_id
      WHERE i.seller_id = ? AND i.status IN ('on_sale','sold')
      ORDER BY i.created_at DESC LIMIT 30`, uid);
    ctx.json(200, {
      code: 200,
      user: { ...publicUser(user), rating: user.rating, ratingCount: user.rating_count },
      items: items.map((r) => ({ ...require('../lib/util').toItemDTO(r, null) })),
    });
  });
};
