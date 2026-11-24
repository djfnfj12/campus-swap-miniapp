/* ===========================================================
 * API 客户端：统一请求、鉴权头、错误处理、会话持久化
 * =========================================================== */
'use strict';

const API = {
  base: '/api',
  get token() { return localStorage.getItem('cs_token') || ''; },
  get user() {
    try { return JSON.parse(localStorage.getItem('cs_user') || 'null'); }
    catch (_) { return null; }
  },

  saveSession(token, user) {
    localStorage.setItem('cs_token', token);
    localStorage.setItem('cs_user', JSON.stringify(user));
    if (typeof App !== 'undefined') App.refreshTabBadge();
  },
  updateUser(user) { localStorage.setItem('cs_user', JSON.stringify(user)); },
  clearSession() {
    localStorage.removeItem('cs_token');
    localStorage.removeItem('cs_user');
  },
  get isLogin() { return !!this.token && !!this.user; },

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let res;
    try {
      res = await fetch(this.base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (_) {
      const e = new Error('网络连接失败，请检查服务是否已启动');
      e.network = true;
      throw e;
    }

    let data = {};
    try { data = await res.json(); } catch (_) { /* 非 JSON 响应 */ }

    if (res.status === 401 && this.token) {
      this.clearSession();
      if (!location.hash.startsWith('#/login')) {
        UI.toast('登录已过期，请重新登录');
        location.hash = '#/login';
      }
    }
    if (!res.ok) {
      const e = new Error(data.message || `请求失败（${res.status}）`);
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body || {}); },
  put(path, body) { return this.request('PUT', path, body || {}); },
  del(path, body) { return this.request('DELETE', path, body || {}); },
};
