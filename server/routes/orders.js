'use strict';
/** 交易模块路由：下单 / 订单流转 / 评价 */
const { all, get, run, now } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { HttpError } = require('../lib/http');
const { num, str, round2 } = require('../lib/util');

const ORDER_STATUS = {
  pending: '待卖家确认',
  confirmed: '待当面交易',
  completed: '已完成',
  cancelled: '已取消',
};

/**
 * 状态机：
 *   pending  --卖家--> confirmed  --买家--> completed
 *   pending  --任一方--> cancelled
 *   confirmed--任一方--> cancelled
 */
const TRANSITIONS = {
  confirmed: ['seller'],
  completed: ['buyer'],
  cancelled: ['buyer', 'seller'],
};

function orderDTO(r, meId) {
  return {
    id: r.id,
    status: r.status,
    statusText: ORDER_STATUS[r.status],
    price: round2(r.price),
    spot: r.spot,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    role: r.buyer_id === meId ? 'buyer' : 'seller',
    item: {
      id: r.item_id, title: r.title, images: (() => { try { return JSON.parse(r.images || '[]'); } catch (_) { return []; } })(),
      category: r.category, status: r.item_status,
    },
    buyer: { id: r.buyer_id, nickname: r.buyer_nickname, avatar: r.buyer_avatar, studentId: r.buyer_sid },
    seller: { id: r.seller_id, nickname: r.seller_nickname, avatar: r.seller_avatar, studentId: r.seller_sid },
    reviewed: !!r.review_id,
    review: r.review_id ? { id: r.review_id, rating: r.review_rating, content: r.review_content } : null,
  };
}

const ORDER_SQL = `
  SELECT o.*, i.title, i.images, i.category, i.status AS item_status,
         b.nickname AS buyer_nickname, b.avatar AS buyer_avatar, b.student_id AS buyer_sid,
         s.nickname AS seller_nickname, s.avatar AS seller_avatar, s.student_id AS seller_sid,
         rv.id AS review_id, rv.rating AS review_rating, rv.content AS review_content
  FROM orders o
  JOIN items i  ON i.id = o.item_id
  JOIN users b  ON b.id = o.buyer_id
  JOIN users s  ON s.id = o.seller_id
  LEFT JOIN reviews rv ON rv.order_id = o.id`;

module.exports = (app) => {
  // 下单
  app.post('/api/orders', (ctx) => {
    const me = requireAuth(ctx);
    const itemId = num(ctx.body, 'itemId', { label: '商品', integer: true, min: 1 });
    const spot = str(ctx.body, 'spot', { label: '交易地点', required: false, max: 40, def: '' });
    const note = str(ctx.body, 'note', { label: '留言', required: false, max: 100, def: '' });

    const item = get('SELECT * FROM items WHERE id = ?', itemId);
    if (!item || item.status === 'offline') throw new HttpError(404, '商品不存在或已下架');
    if (item.seller_id === me.id) throw new HttpError(400, '不能购买自己发布的商品');
    if (item.status !== 'on_sale') throw new HttpError(400, '该商品已被其他同学下单，请看看别的吧');

    const dup = get(`SELECT id FROM orders WHERE item_id = ? AND buyer_id = ? AND status IN ('pending','confirmed')`, itemId, me.id);
    if (dup) throw new HttpError(400, '你已有该商品的进行中订单');

    const t = now();
    const r = run(
      `INSERT INTO orders (item_id, buyer_id, seller_id, price, spot, note, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,'pending',?,?)`,
      item.id, me.id, item.seller_id, item.price, spot || item.spot, note, t, t
    );
    run(`UPDATE items SET status='trading', updated_at=? WHERE id=?`, t, item.id);

    const row = get(`${ORDER_SQL} WHERE o.id = ?`, r.lastInsertRowid);
    ctx.json(201, { code: 201, message: '下单成功，等待卖家确认', order: orderDTO(row, me.id) });
  });

  // 订单列表（role=buyer|seller，默认我买到的）
  app.get('/api/orders', (ctx) => {
    const me = requireAuth(ctx);
    const role = ctx.query.role === 'seller' ? 'seller' : 'buyer';
    const status = ctx.query.status && ctx.query.status !== 'all' ? ctx.query.status : null;
    const params = { uid: me.id };
    let cond = role === 'seller' ? 'o.seller_id = @uid' : 'o.buyer_id = @uid';
    if (status) {
      cond += ' AND o.status = @st';
      params.st = status;
    }
    const total = Number(get(`SELECT COUNT(*) AS n FROM orders o WHERE ${cond}`, params).n);
    const p = Math.max(1, parseInt(ctx.query.page, 10) || 1);
    const s = Math.min(30, Math.max(1, parseInt(ctx.query.pageSize, 10) || 10));
    const rows = all(`${ORDER_SQL} WHERE ${cond} ORDER BY o.id DESC LIMIT @lim OFFSET @off`,
      { ...params, lim: s, off: (p - 1) * s });
    ctx.json(200, {
      code: 200, list: rows.map((r) => orderDTO(r, me.id)), total,
      page: p, pageSize: s, hasMore: (p - 1) * s + rows.length < total,
      statusMap: ORDER_STATUS,
    });
  });

  // 订单详情
  app.get('/api/orders/:id', (ctx) => {
    const me = requireAuth(ctx);
    const row = get(`${ORDER_SQL} WHERE o.id = ?`, Number(ctx.params.id));
    if (!row) throw new HttpError(404, '订单不存在');
    if (row.buyer_id !== me.id && row.seller_id !== me.id) throw new HttpError(403, '无权查看该订单');
    ctx.json(200, { code: 200, order: orderDTO(row, me.id), statusMap: ORDER_STATUS });
  });

  // 订单状态流转
  app.post('/api/orders/:id/status', (ctx) => {
    const me = requireAuth(ctx);
    const next = str(ctx.body, 'status', { label: '目标状态' });
    if (!TRANSITIONS[next]) throw new HttpError(400, '不支持的订单状态');

    const row = get(`${ORDER_SQL} WHERE o.id = ?`, Number(ctx.params.id));
    if (!row) throw new HttpError(404, '订单不存在');
    if (row.buyer_id !== me.id && row.seller_id !== me.id) throw new HttpError(403, '无权操作该订单');

    const role = row.buyer_id === me.id ? 'buyer' : 'seller';
    if (!TRANSITIONS[next].includes(role)) throw new HttpError(403, `该操作只能由${TRANSITIONS[next].map((x) => (x === 'buyer' ? '买家' : '卖家')).join('或')}发起`);

    const legal = { pending: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'], completed: [], cancelled: [] }[row.status];
    if (!legal || !legal.includes(next)) throw new HttpError(400, `订单当前状态「${ORDER_STATUS[row.status]}」不能变更为「${ORDER_STATUS[next]}」`);

    const t = now();
    run('UPDATE orders SET status=?, updated_at=? WHERE id=?', next, t, row.id);
    if (next === 'cancelled') run(`UPDATE items SET status='on_sale', updated_at=? WHERE id=?`, t, row.item_id);
    if (next === 'completed') run(`UPDATE items SET status='sold', updated_at=? WHERE id=?`, t, row.item_id);

    const fresh = get(`${ORDER_SQL} WHERE o.id = ?`, row.id);
    ctx.json(200, { code: 200, message: `订单${ORDER_STATUS[next]}`, order: orderDTO(fresh, me.id) });
  });

  // 买家评价（仅已完成订单，一次机会）
  app.post('/api/orders/:id/review', (ctx) => {
    const me = requireAuth(ctx);
    const row = get(`${ORDER_SQL} WHERE o.id = ?`, Number(ctx.params.id));
    if (!row) throw new HttpError(404, '订单不存在');
    if (row.buyer_id !== me.id) throw new HttpError(403, '只有买家可以评价');
    if (row.status !== 'completed') throw new HttpError(400, '订单完成后才能评价');
    if (row.review_id) throw new HttpError(400, '该订单已评价');

    const rating = num(ctx.body, 'rating', { label: '评分', integer: true, min: 1, max: 5 });
    const content = str(ctx.body, 'content', { label: '评价内容', required: false, max: 120, def: '' });
    run('INSERT INTO reviews (order_id, buyer_id, seller_id, rating, content, created_at) VALUES (?,?,?,?,?,?)',
      row.id, row.buyer_id, row.seller_id, rating, content, now());
    const fresh = get(`${ORDER_SQL} WHERE o.id = ?`, row.id);
    ctx.json(200, { code: 200, message: '评价已提交', order: orderDTO(fresh, me.id) });
  });

  // 我收到的评价
  app.get('/api/reviews', (ctx) => {
    const me = requireAuth(ctx);
    const rows = all(`
      SELECT r.*, u.nickname AS buyer_nickname, u.avatar AS buyer_avatar, i.title AS item_title
      FROM reviews r JOIN users u ON u.id = r.buyer_id
      LEFT JOIN orders o ON o.id = r.order_id
      LEFT JOIN items i ON i.id = o.item_id
      WHERE r.seller_id = ? ORDER BY r.id DESC LIMIT 50`, me.id);
    ctx.json(200, {
      code: 200,
      list: rows.map((r) => ({
        id: r.id, rating: r.rating, content: r.content, createdAt: r.created_at,
        itemTitle: r.item_title, buyer: { nickname: r.buyer_nickname, avatar: r.buyer_avatar },
      })),
    });
  });
};

module.exports.ORDER_STATUS = ORDER_STATUS;
