'use strict';
/**
 * 认证与安全模块
 *  - 口令：scrypt 加盐哈希 + 定时安全比较
 *  - 会话：HMAC-SHA256 签名的无状态 Token（有效期 7 天）
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { get } = require('./db');
const { HttpError } = require('./http');

const SECRET_FILE = path.resolve(__dirname, '..', '..', 'data', 'secret.key');
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天

function loadSecret() {
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}
const SECRET = loadSecret();

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 64).toString('hex');
  return `${s}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes('$')) return false;
  const [salt, hash] = stored.split('$');
  const calc = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (calc.length !== expected.length) return false;
  return crypto.timingSafeEqual(calc, expected);
}

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function createToken(userId) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + TOKEN_TTL })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function parseToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (sign(payload) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.u || !data.e || data.e < Date.now()) return null;
    return data;
  } catch (_) {
    return null;
  }
}

/** 全局中间件：从 Authorization 头解析并装载当前用户（不强制登录） */
async function attachUser(ctx) {
  const header = ctx.req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (ctx.query.token || '');
  const data = parseToken(token);
  if (!data) return;
  const user = get('SELECT id, student_id, nickname, avatar, college, phone, bio, created_at FROM users WHERE id = ?', data.u);
  if (user) ctx.state.user = user;
}

/** 路由守卫：必须登录 */
function requireAuth(ctx) {
  if (!ctx.state.user) throw new HttpError(401, '请先登录后再操作');
  return ctx.state.user;
}

module.exports = { hashPassword, verifyPassword, createToken, parseToken, attachUser, requireAuth };
