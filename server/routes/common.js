'use strict';
/** 通用模块：健康检查 / 未读数 / 图片上传 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { get } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { HttpError } = require('../lib/http');

const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
const MAX_SIZE = 4 * 1024 * 1024; // 解码后 4MB

module.exports = (app) => {
  app.get('/api/health', (ctx) => {
    ctx.json(200, { code: 200, status: 'ok', time: new Date().toISOString(), service: 'campus-swap-api' });
  });

  /** 未读消息数（供标签栏徽标轮询） */
  app.get('/api/unread', (ctx) => {
    const me = requireAuth(ctx);
    const row = get(`
      SELECT COUNT(*) AS n
      FROM messages m
      JOIN conversations c ON c.id = m.conv_id
      WHERE (c.buyer_id = ? OR c.seller_id = ?) AND m.sender_id != ? AND m.is_read = 0`,
      me.id, me.id, me.id);
    ctx.json(200, { code: 200, count: Number(row.n) });
  });

  /**
   * 图片上传（JSON + base64，避免引入 multipart 解析依赖）
   * body: { dataUrl: "data:image/png;base64,xxxx" }
   */
  app.post('/api/upload', (ctx) => {
    requireAuth(ctx);
    const dataUrl = String(ctx.body.dataUrl || '');
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
    if (!m) throw new HttpError(400, '仅支持 PNG / JPG / WebP / GIF 图片');

    const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
    if (!buf.length) throw new HttpError(400, '图片内容为空');
    if (buf.length > MAX_SIZE) throw new HttpError(413, '图片不能超过 4MB');

    const name = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${MIME_EXT[m[1]]}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    ctx.json(201, { code: 201, message: '上传成功', url: `/uploads/${name}` });
  });
};
