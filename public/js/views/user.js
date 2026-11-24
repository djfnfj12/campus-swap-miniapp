/* ===========================================================
 * 用户模块：个人中心 / 登录注册 / 设置 / 他人主页
 * =========================================================== */
'use strict';

/* ---------------- 个人中心 ---------------- */
App.route('profile', {
  title: '我的',
  tab: true,
  activeTab: 'profile',
  async render(view) {
    if (!API.isLogin) {
      view.innerHTML = `
        <div class="profile-head">
          <div class="pf">${UI.avatar('未登录', 'lg')}
            <div><div class="nm">未登录</div><div class="sb">登录后即可发布、收藏与交易</div></div>
          </div>
        </div>
        <div style="padding:26px 22px">
          <button class="btn block lg" data-go="#/login">登录 / 注册</button>
        </div>`;
      return;
    }

    const me = API.user;
    view.innerHTML = `
      <div class="profile-head">
        <div class="pf">
          ${UI.avatar(me.nickname, 'lg')}
          <div class="grow">
            <div class="nm">${UI.esc(me.nickname)}</div>
            <div class="sb">${UI.esc(me.studentId)} · ${UI.esc(me.college || '未填写学院')}</div>
          </div>
          <button class="btn sm" style="background:rgba(255,255,255,.22);color:#fff" data-go="#/settings">编辑资料</button>
        </div>
      </div>

      <div class="profile-stats" id="stats"></div>

      <div class="rows">
        <div class="row-item" data-go="#/orders?role=seller"><span class="ic">🛍️</span><span class="grow">我发布的 / 我卖出的</span><span class="val" id="stSold">-</span><span class="arrow">›</span></div>
        <div class="row-item" data-go="#/orders?role=buyer"><span class="ic">🛒</span><span class="grow">我买到的</span><span class="val" id="stBought">-</span><span class="arrow">›</span></div>
        <div class="row-item" data-go="#/favorites"><span class="ic">🤍</span><span class="grow">我的收藏</span><span class="val" id="stFav">-</span><span class="arrow">›</span></div>
        <div class="row-item" data-go="#/messages"><span class="ic">💬</span><span class="grow">消息会话</span><span class="val">›</span><span class="arrow">›</span></div>
      </div>

      <div class="rows">
        <div class="row-item" data-go="#/user/${me.id}"><span class="ic">👤</span><span class="grow">我的主页预览</span><span class="arrow">›</span></div>
        <div class="row-item" data-go="#/settings"><span class="ic">⚙️</span><span class="grow">账号设置</span><span class="arrow">›</span></div>
        <div class="row-item" id="btnLogout"><span class="ic">🚪</span><span class="grow" style="color:var(--danger)">退出登录</span></div>
      </div>
      <div style="text-align:center;color:var(--text-3);font-size:11.5px;padding:6px 0 18px">校园闲置物品交易小程序 v1.0.0</div>`;

    try {
      const { stats } = await API.get('/stats');
      const box = view.querySelector('#stats');
      if (box) {
        box.innerHTML = `
          <div class="st"><b>${stats.on_sale}</b><span>在售</span></div>
          <div class="st"><b>${stats.sold}</b><span>已卖出</span></div>
          <div class="st"><b>${stats.bought}</b><span>已买到</span></div>
          <div class="st"><b>${stats.favorites}</b><span>收藏</span></div>`;
      }
      const set = (sel, v) => { const el = view.querySelector(sel); if (el) el.textContent = v; };
      set('#stSold', `${stats.sold} 件`);
      set('#stBought', `${stats.bought} 件`);
      set('#stFav', `${stats.favorites} 件`);
    } catch (err) { UI.toast(err.message); }

    // 视图可能已被下一次渲染清空（竞态），判空防御
    const btnLogout = view.querySelector('#btnLogout');
    if (btnLogout) {
      btnLogout.onclick = async () => {
        const ok = await UI.confirm({ title: '退出登录', text: '确定要退出当前账号吗？', ok: '退出', danger: true });
        if (!ok) return;
        API.clearSession();
        UI.toast('已退出登录');
        location.hash = '#/home';
        App.render();
      };
    }
  },
});

/* ---------------- 登录 / 注册 ---------------- */
App.route('login', {
  title: '登录',
  navStyle: 'white',
  hideTab: true,
  async render(view) {
    let mode = 'login';
    const paint = () => {
      view.innerHTML = `
        <div class="login-hero">
          <img src="/img/logo.svg" alt="logo">
          <h2>校园闲置</h2>
          <p>让闲置流转起来，做校园里的循环生活</p>
        </div>
        <div class="seg" style="margin:8px 22px 0">
          <button class="${mode === 'login' ? 'on' : ''}" data-m="login">登录</button>
          <button class="${mode === 'register' ? 'on' : ''}" data-m="register">注册</button>
        </div>
        <div class="form" style="margin-top:14px">
          <div class="field"><label>学号</label><div class="ctrl">
            <input type="text" id="fSid" maxlength="20" placeholder="4-20 位字母或数字" autocomplete="username"></div></div>
          <div class="field"><label>密码</label><div class="ctrl">
            <input type="password" id="fPwd" maxlength="32" placeholder="至少 6 位" autocomplete="current-password"></div></div>
          ${mode === 'register' ? `
          <div class="field"><label>昵称</label><div class="ctrl">
            <input type="text" id="fNick" maxlength="16" placeholder="2-16 个字符"></div></div>
          <div class="field"><label>学院</label><div class="ctrl">
            <input type="text" id="fCollege" maxlength="24" placeholder="选填，如：计算机学院"></div></div>` : ''}
        </div>
        <div class="login-ops">
          <button class="btn block lg" id="btnSubmit">${mode === 'login' ? '登 录' : '注册并登录'}</button>
          <div class="link-line">${mode === 'login' ? '还没有账号？<a data-m="register">立即注册</a>' : '已有账号？<a data-m="login">去登录</a>'}</div>
          <div class="demo-tip">
            <b>演示账号</b>：20230101 / 20230103 等，密码统一 <b>123456</b><br>
            （张小满 · 王大锤 · 李子墨 · 陈雨桐）
          </div>
        </div>`;

      view.querySelectorAll('[data-m]').forEach((el) => {
        el.onclick = () => { mode = el.dataset.m; paint(); };
      });
      view.querySelector('#btnSubmit').onclick = submit;
      view.querySelector('#fPwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    };

    const submit = async () => {
      const btn = view.querySelector('#btnSubmit');
      const sid = view.querySelector('#fSid').value.trim();
      const pwd = view.querySelector('#fPwd').value;
      if (!sid) return UI.toast('请输入学号');
      if (pwd.length < 6) return UI.toast('密码至少 6 位');

      const body = { studentId: sid, password: pwd };
      if (mode === 'register') {
        const nick = view.querySelector('#fNick').value.trim();
        if (nick.length < 2) return UI.toast('昵称至少 2 个字符');
        body.nickname = nick;
        body.college = view.querySelector('#fCollege').value.trim();
      }

      btn.disabled = true;
      btn.textContent = '请稍候…';
      try {
        const r = mode === 'login' ? await API.post('/auth/login', body) : await API.post('/auth/register', body);
        API.saveSession(r.token, r.user);
        UI.toast(r.message);
        location.hash = '#/profile';
        App.render();
      } catch (err) {
        UI.toast(err.message);
        btn.disabled = false;
        btn.textContent = mode === 'login' ? '登 录' : '注册并登录';
      }
    };

    paint();
    setTimeout(() => {
      const sid = view.querySelector('#fSid');
      if (sid) sid.focus();
    }, 150);
  },
});

/* ---------------- 账号设置 ---------------- */
App.route('settings', {
  title: '账号设置',
  navStyle: 'white',
  auth: true,
  async render(view) {
    const me = await API.get('/me').then((r) => r.user).catch(() => API.user);
    view.innerHTML = `
      <div class="form">
        <div class="field"><label>昵称</label><div class="ctrl"><input type="text" id="sNick" maxlength="16" value="${UI.esc(me.nickname)}"></div></div>
        <div class="field"><label>学院</label><div class="ctrl"><input type="text" id="sCollege" maxlength="24" value="${UI.esc(me.college || '')}" placeholder="如：计算机学院"></div></div>
        <div class="field"><label>手机号</label><div class="ctrl"><input type="text" id="sPhone" maxlength="20" value="${UI.esc(me.phone || '')}" placeholder="选填，方便当面交易"></div></div>
        <div class="field"><label>个人简介</label><div class="ctrl"><input type="text" id="sBio" maxlength="60" value="${UI.esc(me.bio || '')}" placeholder="一句话介绍自己"></div></div>
        <div class="field"><label>学号</label><div class="ctrl"><input type="text" value="${UI.esc(me.studentId)}" disabled style="color:var(--text-3)"></div></div>
      </div>
      <div style="padding:4px 12px"><button class="btn block lg" id="btnSave">保存资料</button></div>

      <div class="section-title">安全</div>
      <div class="form">
        <div class="field"><label>原密码</label><div class="ctrl"><input type="password" id="sOld" placeholder="请输入原密码"></div></div>
        <div class="field"><label>新密码</label><div class="ctrl"><input type="password" id="sNew" placeholder="至少 6 位"><div class="hint">留空则不修改密码</div></div></div>
      </div>
      <div style="padding:4px 12px"><button class="btn block ghost lg" id="btnPwd">修改密码</button></div>
      <div style="height:24px"></div>`;

    view.querySelector('#btnSave').onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const r = await API.put('/me', {
          nickname: view.querySelector('#sNick').value.trim(),
          college: view.querySelector('#sCollege').value.trim(),
          phone: view.querySelector('#sPhone').value.trim(),
          bio: view.querySelector('#sBio').value.trim(),
        });
        API.updateUser(r.user);
        UI.toast('资料已保存');
        App.render();
      } catch (err) { UI.toast(err.message); }
      finally { btn.disabled = false; }
    };

    view.querySelector('#btnPwd').onclick = async () => {
      const oldPwd = view.querySelector('#sOld').value;
      const newPwd = view.querySelector('#sNew').value;
      if (!oldPwd) return UI.toast('请输入原密码');
      if (newPwd && newPwd.length < 6) return UI.toast('新密码至少 6 位');
      if (!newPwd) return UI.toast('请输入新密码');
      try {
        await API.put('/me/password', { oldPassword: oldPwd, newPassword: newPwd });
        UI.toast('密码已修改，请重新登录');
        API.clearSession();
        location.hash = '#/login';
        App.render();
      } catch (err) { UI.toast(err.message); }
    };
  },
});

/* ---------------- 他人主页 ---------------- */
App.route('user', {
  title: '个人主页',
  navStyle: 'white',
  async render(view, params) {
    const id = params.segments[1];
    let data;
    try { data = await API.get(`/users/${id}`); } catch (err) {
      view.innerHTML = UI.empty('👤', err.message, '<button class="btn soft" data-go="#/home">返回首页</button>');
      return;
    }
    const u = data.user;
    const isMe = API.user && API.user.id === u.id;
    view.innerHTML = `
      <div class="profile-head" style="padding-bottom:44px">
        <div class="pf">
          ${UI.avatar(u.nickname, 'lg')}
          <div class="grow">
            <div class="nm">${UI.esc(u.nickname)} ${u.rating ? UI.stars(u.rating) : ''}</div>
            <div class="sb">${UI.esc(u.studentId)} · ${UI.esc(u.college || '校友')}</div>
            ${u.bio ? `<div class="sb">✍️ ${UI.esc(u.bio)}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="profile-stats">
        <div class="st"><b>${data.items.filter((i) => i.status === 'on_sale').length}</b><span>在售</span></div>
        <div class="st"><b>${data.items.filter((i) => i.status === 'sold').length}</b><span>已售</span></div>
        <div class="st"><b>${u.rating || '-'}</b><span>评分</span></div>
        <div class="st"><b>${u.ratingCount || 0}</b><span>评价数</span></div>
      </div>
      <div class="section-title" style="margin-left:14px">TA 的闲置 ${isMe ? '<span class="more">这是你自己哦</span>' : ''}</div>
      ${data.items.length
        ? `<div class="grid">${data.items.map(UI.card).join('')}</div>`
        : UI.empty('📦', 'TA 还没有发布商品')}
      <div style="height:20px"></div>`;
  },
});
