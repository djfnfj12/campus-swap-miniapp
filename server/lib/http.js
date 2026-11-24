'use strict';
/**
 * 极简 Web 框架：路由 + 中间件 + 静态资源。
 * 零第三方依赖，等价于 Express 的核心子集。
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

const MAX_BODY = 8 * 1024 * 1024; // 上传图片以 base64 走 JSON，上限 8MB

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 将 "/item/:id" 编译为正则 + 参数名列表 */
function compile(pattern) {
  const keys = [];
  const source = '/' + pattern
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp('^' + source + '$'), keys };
}

class App {
  constructor({ publicDir }) {
    this.publicDir = path.resolve(publicDir);
    this.middlewares = [];
    this.routes = [];
  }

  /** 全局中间件：use(fn) ，fn(ctx) 为 async */
  use(fn) {
    this.middlewares.push(fn);
    return this;
  }

  /** 注册路由：on('GET', '/api/items', handler1, handler2) */
  on(method, pattern, ...handlers) {
    this.routes.push({ method: method.toUpperCase(), ...compile(pattern), handlers, pattern });
    return this;
  }

  get(p, ...h) { return this.on('GET', p, ...h); }
  post(p, ...h) { return this.on('POST', p, ...h); }
  put(p, ...h) { return this.on('PUT', p, ...h); }
  del(p, ...h) { return this.on('DELETE', p, ...h); }

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch (_) {
      pathname = url.pathname;
    }

    const ctx = {
      req,
      res,
      url,
      path: pathname,
      method: req.method.toUpperCase(),
      query: Object.fromEntries(url.searchParams),
      params: {},
      body: {},
      state: {},
      json(status, data) {
        if (res.writableEnded) return;
        const buf = Buffer.from(JSON.stringify(data));
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': buf.length,
          'Cache-Control': 'no-store',
        });
        res.end(buf);
      },
      send(status, buffer, type) {
        if (res.writableEnded) return;
        res.writeHead(status, { 'Content-Type': type, 'Content-Length': buffer.length });
        res.end(buffer);
      },
    };

    try {
      for (const mw of this.middlewares) {
        await mw(ctx);
        if (res.writableEnded) return;
      }

      if (pathname.startsWith('/api/')) {
        await this.#dispatch(ctx);
        if (!res.writableEnded) ctx.json(404, { code: 404, message: '接口不存在' });
        return;
      }

      await this.#static(ctx);
    } catch (err) {
      if (res.writableEnded) return;
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('[ERROR]', ctx.method, ctx.path, err);
      ctx.json(status, { code: status, message: status === 500 ? '服务器内部错误' : err.message });
    }
  }

  async #dispatch(ctx) {
    const path = ctx.path.length > 1 ? ctx.path.replace(/\/+$/, '') : ctx.path;
    for (const route of this.routes) {
      if (route.method !== ctx.method) continue;
      const m = route.regex.exec(path);
      if (!m) continue;
      route.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });
      for (const handler of route.handlers) {
        await handler(ctx);
        if (ctx.res.writableEnded) return;
      }
      return;
    }
    throw new HttpError(404, '接口不存在');
  }

  async #static(ctx) {
    let rel = ctx.path === '/' ? '/index.html' : ctx.path;
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.resolve(this.publicDir, '.' + rel);

    // 防目录穿越
    if (file !== this.publicDir && !file.startsWith(this.publicDir + path.sep)) {
      throw new HttpError(403, '禁止访问');
    }

    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // SPA 兜底：未命中的前端路径回落到 index.html（hash 路由由前端接管）
      file = path.join(this.publicDir, 'index.html');
      if (!fs.existsSync(file)) throw new HttpError(404, '资源不存在');
    }

    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const buf = fs.readFileSync(file);
    ctx.res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buf.length,
      // 开发期不缓存，避免改完代码刷新后仍命中旧版本
      'Cache-Control': 'no-store',
    });
    ctx.res.end(buf);
  }

  listen(port, host = '127.0.0.1') {
    const server = http.createServer((req, res) => this.handle(req, res));
    server.on('listening', () => {
      const actual = server.address().port;
      if (process.env.QUIET !== '1') {
        console.log('');
        console.log('  ┌──────────────────────────────────────────────┐');
        console.log('  │  校园闲置物品交易小程序 已启动                 │');
        console.log('  │  本机访问: http://localhost:' + String(actual).padEnd(5) + '                │');
        console.log('  └──────────────────────────────────────────────┘');
        console.log('');
      }
    });
    server.listen(port, host);
    server.on('clientError', (err, socket) => {
      if (err.code === 'ECONNRESET' || !socket.writable) return;
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });
    return server;
  }
}

/** 解析 JSON 请求体 */
async function parseBody(ctx) {
  if (ctx.method === 'GET' || ctx.method === 'HEAD' || ctx.method === 'DELETE') return;
  const chunks = [];
  let size = 0;
  for await (const chunk of ctx.req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, '请求体过大（图片请控制在 5MB 以内）');
    chunks.push(chunk);
  }
  if (!size) return;
  const raw = Buffer.concat(chunks).toString('utf8');
  const ct = ctx.req.headers['content-type'] || '';
  if (ct.includes('application/json')) {
    try {
      ctx.body = JSON.parse(raw);
    } catch (_) {
      throw new HttpError(400, '请求体不是合法的 JSON');
    }
    if (ctx.body === null || typeof ctx.body !== 'object') ctx.body = {};
  } else {
    ctx.body = { raw };
  }
}

module.exports = { App, HttpError, parseBody };
