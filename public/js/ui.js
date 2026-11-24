/* ===========================================================
 * UI 基础设施：DOM 工具 / Toast / 对话框 / 导航栏 / 商品卡片
 * =========================================================== */
'use strict';

const UI = {
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  price(v, cls = '') {
    const n = Number(v) || 0;
    const txt = Number.isInteger(n) ? String(n) : n.toFixed(2);
    return `<span class="price ${cls}"><span class="cur">¥</span>${txt}</span>`;
  },

  avatar(name, size = '') {
    const ch = UI.esc((name || '?').trim().charAt(0));
    let h = 0;
    for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `<span class="avatar ${size}" style="background:linear-gradient(135deg,hsl(${h},72%,58%),hsl(${(h + 48) % 360},72%,48%))">${ch}</span>`;
  },

  /** 相对时间：今天显示 HH:MM，昨天显示 昨天，更早显示 M月D日 */
  time(text) {
    if (!text) return '';
    const d = new Date(String(text).replace(/-/g, '/'));
    if (Number.isNaN(d.getTime())) return String(text);
    const now = new Date();
    const diff = now - d;
    const pad = (n) => String(n).padStart(2, '0');
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (diff < 48 * 3600 * 1000) return '昨天';
    if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  },

  fullTime(text) {
    const d = new Date(String(text).replace(/-/g, '/'));
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  toast(msg, ms = 1800) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._t);
    this._t = setTimeout(() => el.classList.remove('show'), ms);
  },

  /** 确认对话框，返回 Promise<boolean> */
  confirm({ title = '提示', text = '', ok = '确定', cancel = '取消', danger = false } = {}) {
    return new Promise((resolve) => {
      const mask = document.getElementById('modal');
      mask.innerHTML = `
        <div class="modal">
          <div class="m-body"><h4>${UI.esc(title)}</h4>${text ? `<p>${text}</p>` : ''}</div>
          <div class="m-ops">
            <button data-act="cancel">${UI.esc(cancel)}</button>
            <button data-act="ok" class="${danger ? 'danger' : 'primary'}">${UI.esc(ok)}</button>
          </div>
        </div>`;
      mask.hidden = false;
      const done = (v) => { mask.hidden = true; mask.innerHTML = ''; resolve(v); };
      mask.onclick = (e) => {
        const act = e.target.dataset.act;
        if (act === 'ok') done(true);
        else if (act === 'cancel') done(false);
        else if (e.target === mask) done(false);
      };
    });
  },

  /** 底部动作面板（用于选择类交互） */
  sheet({ title = '', items = [] }) {
    return new Promise((resolve) => {
      const mask = document.getElementById('modal');
      mask.innerHTML = `
        <div class="modal" style="width:100%;max-width:340px">
          <div class="m-body" style="padding:16px">
            ${title ? `<h4 style="text-align:left;margin-bottom:12px">${UI.esc(title)}</h4>` : ''}
            <div class="opt-group">${items.map((it, i) => `<button class="opt" data-i="${i}" style="width:100%;text-align:left">${UI.esc(it.label)}</button>`).join('')}</div>
          </div>
          <div class="m-ops"><button data-act="cancel">取消</button></div>
        </div>`;
      mask.hidden = false;
      const done = (v) => { mask.hidden = true; mask.innerHTML = ''; resolve(v); };
      mask.onclick = (e) => {
        if (e.target.dataset.act === 'cancel' || e.target === mask) return done(null);
        const btn = e.target.closest('[data-i]');
        if (btn) done(items[Number(btn.dataset.i)]);
      };
    });
  },

  empty(emoji, text, btnHtml = '') {
    return `<div class="empty"><div class="emoji">${emoji}</div><p>${UI.esc(text)}</p>${btnHtml}</div>`;
  },

  gridSkeleton(n = 6) {
    return `<div class="grid">${Array.from({ length: n }, () => `
      <div class="goods"><div class="thumb skeleton"></div>
      <div class="body"><div class="skeleton" style="height:14px"></div><div class="skeleton" style="height:14px;width:60%"></div>
      <div class="skeleton" style="height:20px;width:45%"></div></div></div>`).join('')}</div>`;
  },

  /** 商品卡片 HTML */
  card(item) {
    const img = (item.images && item.images[0]) || '/img/logo.svg';
    const statusMap = { on_sale: '', trading: '交易中', sold: '已售出', offline: '已下架' };
    const st = statusMap[item.status];
    return `
      <article class="goods" data-go="#/item/${item.id}">
        <div class="thumb">
          <img src="${UI.esc(img)}" alt="" loading="lazy">
          ${st ? `<span class="status">${st}</span>` : ''}
        </div>
        <div class="body">
          <div class="t">${UI.esc(item.title)}</div>
          <div class="meta">
            <span class="tag">${UI.esc(item.condition)}</span>
            <span class="tag gray">${UI.esc(item.category)}</span>
          </div>
          <div class="foot">
            <div>${UI.price(item.price, 'big')}
              ${item.originalPrice ? `<span class="strike">¥${item.originalPrice}</span>` : ''}</div>
            <div class="fav">♡ ${item.favCount || 0}</div>
          </div>
          <div class="owner">${UI.avatar(item.seller.nickname, 'sm')}<span class="ellip grow">${UI.esc(item.seller.nickname)}</span></div>
        </div>
      </article>`;
  },

  stars(n) {
    const v = Number(n) || 0;
    return `<span class="stars">${'★'.repeat(Math.round(v))}${'☆'.repeat(5 - Math.round(v))}</span>`;
  },

  /**
   * 通用对话框（支持自定义表单）
   * onOk(root) 返回 false 时保持打开（用于表单校验），否则关闭
   */
  dialog({ title = '提示', html = '', okText = '确定', cancelText = '取消', onOk = null, onOpen = null }) {
    return new Promise((resolve) => {
      const mask = document.getElementById('modal');
      mask.innerHTML = `
        <div class="modal">
          <div class="m-body"><h4>${UI.esc(title)}</h4>${html}</div>
          <div class="m-ops">
            <button data-act="cancel">${UI.esc(cancelText)}</button>
            <button data-act="ok" class="primary">${UI.esc(okText)}</button>
          </div>
        </div>`;
      mask.hidden = false;
      const root = mask.querySelector('.modal');
      if (onOpen) onOpen(root);
      const close = (v) => { mask.hidden = true; mask.innerHTML = ''; resolve(v); };
      mask.onclick = async (e) => {
        const act = e.target.dataset.act;
        if (act === 'cancel') return close(null);
        if (act === 'ok') {
          let pass = true;
          if (onOk) pass = (await onOk(root)) !== false;
          if (pass) close(true);
          return;
        }
        if (e.target === mask) close(null);
      };
      const first = mask.querySelector('input,textarea');
      if (first) setTimeout(() => first.focus(), 80);
    });
  },
};
