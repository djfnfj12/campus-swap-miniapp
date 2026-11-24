'use strict';
const { HttpError } = require('./http');
const { get } = require('./db');

const CATEGORIES = ['数码电器', '教材书籍', '生活用品', '服饰鞋包', '运动户外', '美妆个护', '乐器手办', '其他'];
const CONDITIONS = ['全新', '99新', '95新', '9成新', '8成新'];

function bad(msg) {
  throw new HttpError(400, msg);
}

/** 读取并校验字符串字段 */
function str(body, key, { label = key, required = true, min = 0, max = 200, def = '' } = {}) {
  const raw = body[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    if (required) bad(`请填写${label}`);
    return def;
  }
  const v = String(raw).trim();
  if (v.length < min) bad(`${label}至少 ${min} 个字符`);
  if (v.length > max) bad(`${label}不能超过 ${max} 个字符`);
  return v;
}

/** 读取并校验数值字段 */
function num(body, key, { label = key, required = true, min = -Infinity, max = Infinity, def = 0, integer = false } = {}) {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === '') {
    if (required) bad(`请填写${label}`);
    return def;
  }
  const v = Number(raw);
  if (!Number.isFinite(v)) bad(`${label}必须是数字`);
  if (integer && !Number.isInteger(v)) bad(`${label}必须是整数`);
  if (v < min) bad(`${label}不能小于 ${min}`);
  if (v > max) bad(`${label}不能大于 ${max}`);
  return v;
}

function pickOne(body, key, list, { label = key, def = null, required = true } = {}) {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (required) bad(`请选择${label}`);
    return def;
  }
  if (!list.includes(v)) bad(`${label}取值不合法`);
  return v;
}

/** 分页参数 */
function page(query, { size = 12, maxSize = 30 } = {}) {
  const p = Math.max(1, parseInt(query.page, 10) || 1);
  const s = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || size));
  return { p, s, offset: (p - 1) * s };
}

function round2(v) {
  return Math.round(Number(v) * 100) / 100;
}

function parseImages(text) {
  try {
    const arr = JSON.parse(text || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

/** 对外暴露的用户摘要（永远不带口令散列） */
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    studentId: u.student_id,
    nickname: u.nickname,
    avatar: u.avatar,
    college: u.college,
    phone: u.phone,
    bio: u.bio,
    createdAt: u.created_at,
  };
}

/** 商品行 → DTO（含卖家摘要、收藏数、收藏标记） */
function toItemDTO(row, uid) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    price: round2(row.price),
    originalPrice: row.original_price === null ? null : round2(row.original_price),
    condition: row.condition,
    images: parseImages(row.images),
    spot: row.spot,
    status: row.status,
    viewCount: row.view_count,
    favCount: row.fav_count || 0,
    isFavorite: !!row.fav_flag,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    seller: {
      id: row.seller_id,
      nickname: row.seller_nickname,
      avatar: row.seller_avatar,
      college: row.seller_college,
      rating: row.seller_rating === undefined ? null : row.seller_rating,
      ratingCount: row.seller_rating_count === undefined ? 0 : row.seller_rating_count,
    },
  };
}

const RATING_SUBQUERY = `
  (SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.seller_id = u.id) AS seller_rating,
  (SELECT COUNT(*)             FROM reviews r WHERE r.seller_id = u.id) AS seller_rating_count
`;

function requireOwner(item, user) {
  if (!item) throw new HttpError(404, '商品不存在或已下架');
  if (item.seller_id !== user.id) throw new HttpError(403, '无权操作他人的商品');
  return item;
}

function exists(table, where, ...params) {
  return !!get(`SELECT 1 AS x FROM ${table} WHERE ${where}`, ...params);
}

module.exports = {
  CATEGORIES,
  CONDITIONS,
  bad,
  str,
  num,
  pickOne,
  page,
  round2,
  parseImages,
  publicUser,
  toItemDTO,
  RATING_SUBQUERY,
  requireOwner,
  exists,
};
