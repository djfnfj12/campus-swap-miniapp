'use strict';
/** 商品模块路由：分类 / 检索 / 详情 / 发布 / 修改 / 下架 / 收藏 */
const { all, get, run, now } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { HttpError } = require('../lib/http');
const {
  CATEGORIES, CONDITIONS, str, num, pickOne, page, round2, parseImages,
  publicUser, toItemDTO, RATING_SUBQUERY, requireOwner,
} = require('../lib/util');

const ITEM_SQL = `
  SELECT i.*, u.nickname AS seller_nickname, u.avatar AS seller_avatar, u.college AS seller_college,
         ${RATING_SUBQUERY},
         (SELECT COUNT(*) FROM favorites f WHERE f.item_id = i.id) AS fav_count,
         (SELECT COUNT(*) FROM favorites f WHERE f.item_id = i.id AND f.user_id = @uid) AS fav_flag
  FROM items i JOIN users u ON u.id = i.seller_id`;

function validateImages(images) {
  if (images === undefined) return undefined;
  if (!Array.isArray(images)) throw new HttpError(400, 'images 必须是数组');
  const list = images.filter((s) => typeof s === 'string' && s.trim() !== '').slice(0, 6);
  for (const img of list) {
    if (img.length > 500_000) throw new HttpError(400, '单张图片过大，请先压缩');
    const ok = img.startsWith('/uploads/') || img.startsWith('/img/') || img.startsWith('data:image/') || /^https?:\/\//.test(img);
    if (!ok) throw new HttpError(400, '图片地址不合法');
  }
  return JSON.stringify(list);
}

module.exports = (app) => {
  // 分类目录（含在售数量）
  app.get('/api/categories', (ctx) => {
    const rows = all(`SELECT category, COUNT(*) AS n FROM items WHERE status = 'on_sale' GROUP BY category`);
    const map = Object.fromEntries(rows.map((r) => [r.category, r.n]));
    ctx.json(200, {
      code: 200,
      categories: CATEGORIES.map((name) => ({ name, count: map[name] || 0 })),
      conditions: CONDITIONS,
    });
  });

  // 商品列表 / 多条件检索
  app.get('/api/items', (ctx) => {
    const uid = ctx.state.user ? ctx.state.user.id : 0;
    const q = ctx.query;
    const where = [];
    const params = { uid };

    if (q.mine === '1') {
      const me = requireAuth(ctx);
      where.push('i.seller_id = @seller');
      params.seller = me.id;
      if (q.status && q.status !== 'all') {
        where.push('i.status = @status');
        params.status = q.status;
      }
    } else if (q.sellerId) {
      where.push('i.seller_id = @seller', "i.status IN ('on_sale','sold')");
      params.seller = Number(q.sellerId) || 0;
    } else {
      where.push("i.status = 'on_sale'");
    }

    if (q.keyword) {
      where.push('(i.title LIKE @kw OR i.description LIKE @kw)');
      params.kw = `%${String(q.keyword).trim().slice(0, 40)}%`;
    }
    if (q.category) {
      where.push('i.category = @cat');
      params.cat = q.category;
    }
    if (q.condition) {
      where.push('i.condition = @cond');
      params.cond = q.condition;
    }
    if (q.minPrice !== undefined && q.minPrice !== '') {
      where.push('i.price >= @minP');
      params.minP = Number(q.minPrice) || 0;
    }
    if (q.maxPrice !== undefined && q.maxPrice !== '') {
      where.push('i.price <= @maxP');
      params.maxP = Number(q.maxPrice) || Number.MAX_SAFE_INTEGER;
    }

    const orderBy = {
      new: 'i.created_at DESC, i.id DESC',
      price_asc: 'i.price ASC, i.id DESC',
      price_desc: 'i.price DESC, i.id DESC',
      hot: 'i.view_count DESC, i.id DESC',
    }[q.sort] || 'i.created_at DESC, i.id DESC';

    const cond = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = Number(get(`SELECT COUNT(*) AS n FROM items i ${cond}`, params).n);
    const { p, s, offset } = page(q);
    const rows = all(`${ITEM_SQL} ${cond} ORDER BY ${orderBy} LIMIT @lim OFFSET @off`, { ...params, lim: s, off: offset });

    ctx.json(200, {
      code: 200, list: rows.map((r) => toItemDTO(r, uid)), total,
      page: p, pageSize: s, hasMore: offset + rows.length < total,
    });
  });

  // 商品详情
  app.get('/api/items/:id', (ctx) => {
    const uid = ctx.state.user ? ctx.state.user.id : 0;
    const id = Number(ctx.params.id);
    const row = get(`${ITEM_SQL} WHERE i.id = @id`, { id, uid });
    if (!row || (row.status === 'offline' && row.seller_id !== uid)) {
      throw new HttpError(404, '商品不存在或已下架');
    }
    run('UPDATE items SET view_count = view_count + 1 WHERE id = ?', id);

    const dto = toItemDTO(row, uid);
    dto.viewCount += 1;

    // 卖家最近评价
    const reviews = all(`
      SELECT r.rating, r.content, r.created_at, u.nickname AS buyer_nickname, u.avatar AS buyer_avatar
      FROM reviews r JOIN users u ON u.id = r.buyer_id
      WHERE r.seller_id = ? ORDER BY r.id DESC LIMIT 5`, row.seller_id)
      .map((r) => ({ rating: r.rating, content: r.content, createdAt: r.created_at, buyer: { nickname: r.buyer_nickname, avatar: r.buyer_avatar } }));

    // 当前用户对该商品的进行中订单
    let activeOrder = null;
    if (uid) {
      const o = get(`SELECT id, status FROM orders WHERE item_id = ? AND buyer_id = ? AND status IN ('pending','confirmed') ORDER BY id DESC`, id, uid);
      if (o) activeOrder = { id: o.id, status: o.status };
    }

    ctx.json(200, { code: 200, item: dto, seller: dto.seller, reviews, activeOrder, isOwner: row.seller_id === uid });
  });

  // 发布商品
  app.post('/api/items', (ctx) => {
    const me = requireAuth(ctx);
    const title = str(ctx.body, 'title', { label: '标题', min: 2, max: 30 });
    const category = pickOne(ctx.body, 'category', CATEGORIES, { label: '分类' });
    const condition = pickOne(ctx.body, 'condition', CONDITIONS, { label: '成色' });
    const price = num(ctx.body, 'price', { label: '价格', min: 0.01, max: 99999 });
    const originalPriceRaw = ctx.body.originalPrice;
    const originalPrice = originalPriceRaw === undefined || originalPriceRaw === '' ? null : num(ctx.body, 'originalPrice', { label: '原价', min: 0, max: 999999 });
    const description = str(ctx.body, 'description', { label: '描述', required: false, max: 500, def: '' });
    const spot = str(ctx.body, 'spot', { label: '交易地点', required: false, max: 40, def: '校内当面交易' });
    const images = validateImages(ctx.body.images);
    if (images === '[]') throw new HttpError(400, '请至少上传 1 张商品图片');
    if (originalPrice !== null && originalPrice < price) throw new HttpError(400, '原价不能低于售价');

    const t = now();
    const r = run(
      `INSERT INTO items (seller_id, title, description, category, price, original_price, condition, images, spot, status, view_count, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,'on_sale',0,?,?)`,
      me.id, title, description, category, price, originalPrice, condition, images || '[]', spot, t, t
    );
    const row = get(`${ITEM_SQL} WHERE i.id = @id`, { id: r.lastInsertRowid, uid: me.id });
    ctx.json(201, { code: 201, message: '发布成功', item: toItemDTO(row, me.id) });
  });

  // 修改商品（含上架/下架/标记售出）
  app.put('/api/items/:id', (ctx) => {
    const me = requireAuth(ctx);
    const item = get('SELECT * FROM items WHERE id = ?', Number(ctx.params.id));
    requireOwner(item, me);

    const title = str(ctx.body, 'title', { label: '标题', required: false, min: 2, max: 30, def: item.title });
    const category = pickOne(ctx.body, 'category', CATEGORIES, { label: '分类', required: false, def: item.category });
    const condition = pickOne(ctx.body, 'condition', CONDITIONS, { label: '成色', required: false, def: item.condition });
    const price = num(ctx.body, 'price', { label: '价格', required: false, min: 0.01, max: 99999, def: item.price });
    const description = str(ctx.body, 'description', { label: '描述', required: false, max: 500, def: item.description });
    const spot = str(ctx.body, 'spot', { label: '交易地点', required: false, max: 40, def: item.spot });
    const images = validateImages(ctx.body.images);
    const status = ctx.body.status !== undefined
      ? pickOne(ctx.body, 'status', ['on_sale', 'offline', 'sold'], { label: '状态' })
      : item.status;

    run(`UPDATE items SET title=?, category=?, condition=?, price=?, description=?, spot=?, images=?, status=?, updated_at=? WHERE id=?`,
      title, category, condition, price, description, spot, images || item.images, status, now(), item.id);

    const row = get(`${ITEM_SQL} WHERE i.id = @id`, { id: item.id, uid: me.id });
    ctx.json(200, { code: 200, message: '商品已更新', item: toItemDTO(row, me.id) });
  });

  // 下架（软删除）
  app.del('/api/items/:id', (ctx) => {
    const me = requireAuth(ctx);
    const item = get('SELECT * FROM items WHERE id = ?', Number(ctx.params.id));
    requireOwner(item, me);
    const active = get(`SELECT id FROM orders WHERE item_id = ? AND status IN ('pending','confirmed')`, item.id);
    if (active) throw new HttpError(400, '该商品存在进行中的订单，请先处理订单再下架');
    run(`UPDATE items SET status='offline', updated_at=? WHERE id=?`, now(), item.id);
    ctx.json(200, { code: 200, message: '商品已下架' });
  });

  // 收藏 / 取消收藏
  app.post('/api/items/:id/favorite', (ctx) => {
    const me = requireAuth(ctx);
    const item = get('SELECT id FROM items WHERE id = ?', Number(ctx.params.id));
    if (!item) throw new HttpError(404, '商品不存在');
    run('INSERT OR IGNORE INTO favorites (user_id, item_id, created_at) VALUES (?,?,?)', me.id, item.id, now());
    const n = get('SELECT COUNT(*) AS n FROM favorites WHERE item_id = ?', item.id).n;
    ctx.json(200, { code: 200, favorited: true, favCount: Number(n) });
  });

  app.del('/api/items/:id/favorite', (ctx) => {
    const me = requireAuth(ctx);
    run('DELETE FROM favorites WHERE user_id = ? AND item_id = ?', me.id, Number(ctx.params.id));
    const n = get('SELECT COUNT(*) AS n FROM favorites WHERE item_id = ?', Number(ctx.params.id)).n;
    ctx.json(200, { code: 200, favorited: false, favCount: Number(n) });
  });

  // 我的收藏
  app.get('/api/favorites', (ctx) => {
    const me = requireAuth(ctx);
    const { p, s, offset } = page(ctx.query, { size: 20 });
    const total = Number(get('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?', me.id).n);
    const rows = all(`
      SELECT i.*, u.nickname AS seller_nickname, u.avatar AS seller_avatar, u.college AS seller_college,
             ${RATING_SUBQUERY},
             (SELECT COUNT(*) FROM favorites f WHERE f.item_id=i.id) AS fav_count,
             1 AS fav_flag
      FROM favorites f
      JOIN items i ON i.id = f.item_id
      JOIN users u ON u.id = i.seller_id
      WHERE f.user_id = @uid AND i.status != 'offline'
      ORDER BY f.created_at DESC LIMIT @lim OFFSET @off`, { uid: me.id, lim: s, off: offset });
    ctx.json(200, { code: 200, list: rows.map((r) => toItemDTO(r, me.id)), total, page: p, pageSize: s, hasMore: offset + rows.length < total });
  });
};

module.exports.validateImages = validateImages;
module.exports.ITEM_SQL = ITEM_SQL;
