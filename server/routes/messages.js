'use strict';
/** 消息模块路由：会话 / 聊天 / 已读回执 */
const { all, get, run, now } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { HttpError } = require('../lib/http');
const { str, num } = require('../lib/util');

function loadConv(id, uid) {
  const conv = get(`
    SELECT c.*,
           i.title AS item_title, i.images AS item_images, i.status AS item_status, i.price AS item_price,
           b.nickname AS buyer_nickname, b.avatar AS buyer_avatar,
           s.nickname AS seller_nickname, s.avatar AS seller_avatar
    FROM conversations c
    JOIN items i ON i.id = c.item_id
    JOIN users b ON b.id = c.buyer_id
    JOIN users s ON s.id = c.seller_id
    WHERE c.id = ?`, id);
  if (!conv) throw new HttpError(404, '会话不存在');
  if (conv.buyer_id !== uid && conv.seller_id !== uid) throw new HttpError(403, '无权访问该会话');
  return conv;
}

function convBrief(conv, uid) {
  const peer = conv.buyer_id === uid
    ? { id: conv.seller_id, nickname: conv.seller_nickname, avatar: conv.seller_avatar }
    : { id: conv.buyer_id, nickname: conv.buyer_nickname, avatar: conv.buyer_avatar };
  let images = [];
  try { images = JSON.parse(conv.item_images || '[]'); } catch (_) { /* ignore */ }
  const unread = Number(get(
    'SELECT COUNT(*) AS n FROM messages WHERE conv_id = ? AND sender_id != ? AND is_read = 0',
    conv.id, uid
  ).n);
  return {
    id: conv.id,
    itemId: conv.item_id,
    item: { id: conv.item_id, title: conv.item_title, image: images[0] || '', price: conv.item_price, status: conv.item_status },
    peer,
    lastMessage: conv.last_message,
    lastTime: conv.last_time,
    createdAt: conv.created_at,
    unread,
    role: conv.buyer_id === uid ? 'buyer' : 'seller',
  };
}

module.exports = (app) => {
  // 针对某商品发起（或命中）与卖家的会话
  app.post('/api/conversations', (ctx) => {
    const me = requireAuth(ctx);
    const itemId = num(ctx.body, 'itemId', { label: '商品', integer: true, min: 1 });
    const item = get('SELECT id, seller_id, status FROM items WHERE id = ?', itemId);
    if (!item || item.status === 'offline') throw new HttpError(404, '商品不存在或已下架');
    if (item.seller_id === me.id) throw new HttpError(400, '这是你发布的商品，无需向自己发起咨询');

    let conv = get('SELECT * FROM conversations WHERE item_id = ? AND buyer_id = ?', itemId, me.id);
    if (!conv) {
      const t = now();
      const r = run(
        'INSERT INTO conversations (item_id, buyer_id, seller_id, last_message, last_time, created_at) VALUES (?,?,?,?,?,?)',
        itemId, me.id, item.seller_id, '会话已创建', t, t
      );
      conv = get('SELECT * FROM conversations WHERE id = ?', r.lastInsertRowid);
    }
    ctx.json(200, { code: 200, conversation: convBrief(loadConv(conv.id, me.id), me.id) });
  });

  // 我的会话列表
  app.get('/api/conversations', (ctx) => {
    const me = requireAuth(ctx);
    const rows = all(`
      SELECT c.*,
             i.title AS item_title, i.images AS item_images, i.status AS item_status, i.price AS item_price,
             b.nickname AS buyer_nickname, b.avatar AS buyer_avatar,
             s.nickname AS seller_nickname, s.avatar AS seller_avatar
      FROM conversations c
      JOIN items i ON i.id = c.item_id
      JOIN users b ON b.id = c.buyer_id
      JOIN users s ON s.id = c.seller_id
      WHERE c.buyer_id = ? OR c.seller_id = ?
      ORDER BY c.last_time DESC, c.id DESC LIMIT 100`, me.id, me.id);
    const list = rows.map((r) => convBrief(r, me.id));
    ctx.json(200, { code: 200, list, totalUnread: list.reduce((a, b) => a + b.unread, 0) });
  });

  // 拉取聊天记录（支持 afterId 增量拉取）
  app.get('/api/conversations/:id/messages', (ctx) => {
    const me = requireAuth(ctx);
    const conv = loadConv(Number(ctx.params.id), me.id);
    const afterId = parseInt(ctx.query.afterId, 10) || 0;
    const limit = Math.min(100, Math.max(1, parseInt(ctx.query.limit, 10) || 50));

    const rows = afterId
      ? all('SELECT * FROM messages WHERE conv_id = ? AND id > ? ORDER BY id ASC LIMIT ?', conv.id, afterId, limit)
      : all('SELECT * FROM messages WHERE conv_id = ? ORDER BY id DESC LIMIT ?', conv.id, limit);

    ctx.json(200, {
      code: 200,
      conversation: convBrief(conv, me.id),
      list: rows.reverse().map((m) => ({
        id: m.id, content: m.content, kind: m.kind, createdAt: m.created_at,
        senderId: m.sender_id, fromMe: m.sender_id === me.id, isRead: !!m.is_read,
      })),
    });
  });

  // 发送消息
  app.post('/api/conversations/:id/messages', (ctx) => {
    const me = requireAuth(ctx);
    const conv = loadConv(Number(ctx.params.id), me.id);
    const content = str(ctx.body, 'content', { label: '消息内容', min: 1, max: 500 });
    const t = now();
    const r = run('INSERT INTO messages (conv_id, sender_id, content, kind, is_read, created_at) VALUES (?,?,?,?,0,?)',
      conv.id, me.id, content, 'text', t);
    run('UPDATE conversations SET last_message = ?, last_time = ? WHERE id = ?', content.slice(0, 60), t, conv.id);
    ctx.json(201, {
      code: 201,
      message: { id: r.lastInsertRowid, content, kind: 'text', createdAt: t, senderId: me.id, fromMe: true, isRead: false },
    });
  });

  // 已读回执
  app.post('/api/conversations/:id/read', (ctx) => {
    const me = requireAuth(ctx);
    const conv = loadConv(Number(ctx.params.id), me.id);
    run('UPDATE messages SET is_read = 1 WHERE conv_id = ? AND sender_id != ?', conv.id, me.id);
    ctx.json(200, { code: 200, message: '已读' });
  });
};
