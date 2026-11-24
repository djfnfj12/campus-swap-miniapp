/* ===========================================================
 * 应用外壳：哈希路由 / 导航栏 / 标签栏 / 全局事件
 * =========================================================== */
'use strict';

const TAB_ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
  category: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
  messages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4V5z"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0115 0"/></svg>',
  publish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
};

const TABS = [
  { key: 'home', label: '首页', hash: '#/home' },
  { key: 'category', label: '分类', hash: '#/category' },
  { key: 'publish', label: '发布', hash: '#/publish', center: true },
  { key: 'messages', label: '消息', hash: '#/messages', badge: true },
  { key: 'profile', label: '我的', hash: '#/profile' },
];

const App = {
  routes: {},
  current: null,
  unread: 0,

  route(name, def) { this.routes[name] = def; return this; },

  parse() {
    const raw = (location.hash || '').replace(/^#/, '') || '/home';
    const [path, qs] = raw.split('?');
    const segments = path.split('/').filter(Boolean);
    const query = {};
    new URLSearchParams(qs || '').forEach((v, k) => { query[k] = v; });
    return { name: segments[0] || 'home', segments, query, raw };
  },

  go(hash) { location.hash = hash; },

  needLogin(tip = '请先登录后再操作') {
    UI.toast(tip);
    location.hash = '#/login';
  },

  /** 渲染当前路由 */
  async render() {
    const params = this.parse();
    const def = this.routes[params.name] || this.routes.home;

    // 离开上一个路由（清理定时器等）
    if (this.current && this.current.def && typeof this.current.def.onLeave === 'function') {
      try { this.current.def.onLeave(); } catch (_) { /* ignore */ }
    }

    const view = document.getElementById('view');
    if (view._onScroll) { view.removeEventListener('scroll', view._onScroll); view._onScroll = null; }
    view.onclick = null;
    view.innerHTML = '';

    // 登录守卫
    if (def.auth && !API.isLogin) {
      this.paintNav({ title: '需要登录', white: true, back: true });
      document.getElementById('tabbar').style.display = 'none';
      view.innerHTML = `
        <div class="empty" style="padding-top:70px">
          <div class="emoji">🔐</div>
          <p>登录后才能使用该功能</p>
          <button class="btn" data-go="#/login">去登录</button>
          <button class="btn ghost" style="margin-left:8px" data-go="#/home">先逛逛</button>
        </div>`;
      this.current = { name: params.name, def };
      return;
    }

    // 导航栏
    this.paintNav({
      title: def.title || '校园闲置',
      white: def.navStyle === 'white',
      back: !def.tab,
      capsule: !!def.tab,
    });

    // 标签栏
    const tabbar = document.getElementById('tabbar');
    tabbar.style.display = def.tab ? 'flex' : 'none';
    this.paintTab(def.activeTab);
    document.getElementById('statusbar')?.classList.toggle('on-white', def.navStyle === 'white');

    view.scrollTop = 0;
    this.current = { name: params.name, def };

    try {
      await def.render(view, params);
    } catch (err) {
      console.error(err);
      view.innerHTML = UI.empty('⚠️', err.message || '页面渲染失败',
        '<button class="btn soft" data-retry="1">重试</button>');
      const retry = view.querySelector('[data-retry]');
      if (retry) retry.onclick = () => App.render();
    }

    if (def.onScroll) {
      view._onScroll = (e) => def.onScroll(e);
      view.addEventListener('scroll', view._onScroll, { passive: true });
    }
    this.refreshTabBadge();
  },

  paintNav({ title, white, back, capsule }) {
    const nav = document.getElementById('navbar');
    nav.classList.toggle('white', !!white);
    nav.innerHTML = `
      ${back
        ? `<button class="nav-back" id="navBack" aria-label="返回">${TAB_ICONS.back}</button>`
        : '<span class="nav-left-space"></span>'}
      <span class="nav-title">${UI.esc(title)}</span>
      ${capsule
        ? `<span class="capsule"><i></i><u></u></span>`
        : `<button class="nav-action" id="navHome">首页</button>`}`;

    const backBtn = nav.querySelector('#navBack');
    if (backBtn) {
      backBtn.onclick = () => {
        if (history.length > 1) history.back();
        else location.hash = '#/home';
      };
    }
    const homeBtn = nav.querySelector('#navHome');
    if (homeBtn) homeBtn.onclick = () => { location.hash = '#/home'; };
  },

  paintTab(activeKey) {
    const tabbar = document.getElementById('tabbar');
    tabbar.innerHTML = TABS.map((t) => {
      if (t.center) {
        return `<div class="tab-item tab-publish ${activeKey === t.key ? 'active' : ''}" data-tab="${t.hash}">
          <div class="pub-btn">${TAB_ICONS.publish}</div><span>发布</span></div>`;
      }
      const badge = t.badge && this.unread > 0
        ? `<span class="badge">${this.unread > 99 ? '99+' : this.unread}</span>` : '';
      return `<div class="tab-item ${activeKey === t.key ? 'active' : ''}" data-tab="${t.hash}">
        ${TAB_ICONS[t.key]}<span>${t.label}</span>${badge}</div>`;
    }).join('');
    tabbar.querySelectorAll('[data-tab]').forEach((el) => {
      el.onclick = () => { location.hash = el.dataset.tab; };
    });
  },

  /** 拉取未读消息数并刷新标签徽标 */
  async refreshTabBadge() {
    if (!API.isLogin) { this.unread = 0; this.paintTab(this.current && this.current.def ? this.current.def.activeTab : null); return; }
    try {
      const r = await API.get('/unread');
      this.unread = r.count || 0;
    } catch (_) { this.unread = 0; }
    this.paintTab(this.current && this.current.def ? this.current.def.activeTab : null);
  },
};

/* ---------- 全局事件 ---------- */
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    e.preventDefault();
    location.hash = go.dataset.go;
  }
});

window.addEventListener('hashchange', () => App.render());

/* ---------- 状态栏时钟 ---------- */
function tickClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const d = new Date();
  el.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ---------- 启动 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  tickClock();
  setInterval(tickClock, 20000);
  if (!location.hash) location.hash = '#/home';
  App.render();
  console.log('%c校园闲置物品交易小程序', 'color:#2b8cff;font-weight:bold;font-size:14px');
  console.log('演示账号：20230101 / 20230103，密码 123456');
});
