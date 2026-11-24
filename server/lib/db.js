'use strict';
/**
 * 数据访问层 (Data Access Layer)
 * 使用 Node.js 内置的 node:sqlite 驱动，零第三方依赖。
 * 对外只暴露 all / get / run 三个原子操作，业务 SQL 一律写在 routes 中。
 */
const fs = require('node:fs');
const path = require('node:path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  console.error('[FATAL] 当前 Node.js 不支持内置模块 node:sqlite，需要 Node.js >= 22.13。');
  console.error('        请执行 `node -v` 确认版本后升级 Node.js 再重试。');
  console.error('        ' + err.message);
  process.exit(1);
}

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'campus-swap.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    TEXT    NOT NULL UNIQUE,
  nickname      TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  avatar        TEXT    NOT NULL DEFAULT '',
  college       TEXT    NOT NULL DEFAULT '',
  phone         TEXT    NOT NULL DEFAULT '',
  bio           TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  category       TEXT    NOT NULL,
  price          REAL    NOT NULL,
  original_price REAL,
  condition      TEXT    NOT NULL DEFAULT '99新',
  images         TEXT    NOT NULL DEFAULT '[]',
  spot           TEXT    NOT NULL DEFAULT '校内当面交易',
  status         TEXT    NOT NULL DEFAULT 'on_sale',
  view_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_status_cat ON items(status, category);
CREATE INDEX IF NOT EXISTS idx_items_seller     ON items(seller_id);
CREATE INDEX IF NOT EXISTS idx_items_created    ON items(created_at DESC);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES items(id)  ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL REFERENCES items(id)  ON DELETE CASCADE,
  buyer_id   INTEGER NOT NULL REFERENCES users(id),
  seller_id  INTEGER NOT NULL REFERENCES users(id),
  price      REAL    NOT NULL,
  spot       TEXT    NOT NULL DEFAULT '',
  note       TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'pending',
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_buyer  ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_item   ON orders(item_id);

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id   INTEGER NOT NULL,
  seller_id  INTEGER NOT NULL,
  rating     INTEGER NOT NULL,
  content    TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews(seller_id);

CREATE TABLE IF NOT EXISTS conversations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id      INTEGER NOT NULL REFERENCES items(id)  ON DELETE CASCADE,
  buyer_id     INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  seller_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  last_message TEXT    NOT NULL DEFAULT '',
  last_time    TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL,
  UNIQUE (item_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_buyer  ON conversations(buyer_id, last_time DESC);
CREATE INDEX IF NOT EXISTS idx_conv_seller ON conversations(seller_id, last_time DESC);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_id    INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id  INTEGER NOT NULL,
  content    TEXT    NOT NULL,
  kind       TEXT    NOT NULL DEFAULT 'text',
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conv_id, id);
`;

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 3000;');
db.exec(SCHEMA);

/**
 * 绑定参数归一化：
 *  - 支持 all(sql, {...}) 命名参数（自动剔除 SQL 中未引用的键，避免驱动报"未知参数"）
 *  - 支持 all(sql, a, b, c) 位置参数
 */
function normalize(sql, params) {
  const first = params[0];
  const isPlainObject = params.length === 1 && first !== null
    && typeof first === 'object'
    && !Array.isArray(first)
    && !(first instanceof Uint8Array)
    && !(first instanceof Date);
  if (isPlainObject) {
    const bound = {};
    for (const key of Object.keys(first)) {
      if (new RegExp('[@:$]' + key + '(?![A-Za-z0-9_])').test(sql)) {
        bound[key] = first[key] === undefined ? null : first[key];
      }
    }
    return [bound];
  }
  return params.map((v) => (v === undefined ? null : v));
}

/** 查询多行 */
function all(sql, ...params) {
  return db.prepare(sql).all(...normalize(sql, params));
}
/** 查询单行，无结果返回 undefined */
function get(sql, ...params) {
  return db.prepare(sql).get(...normalize(sql, params));
}
/** 写入，返回 { changes, lastInsertRowid }（统一为 Number，避免 BigInt 溢出到业务层） */
function run(sql, ...params) {
  const r = db.prepare(sql).run(...normalize(sql, params));
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

/** 统一时间格式：2026-09-29 12:00:00 */
function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 金额保留两位小数 */
function money(v) {
  return Math.round(Number(v) * 100) / 100;
}

function close() {
  try { db.close(); } catch (_) { /* ignore */ }
}

module.exports = { db, all, get, run, now, money, close, DB_FILE };
