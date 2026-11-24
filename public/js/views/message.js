/* ===========================================================
 * 消息模块：会话列表 / 聊天详情
 * =========================================================== */
'use strict';

const ChatState = { timer: null, convId: null, lastId: 0 };

App.route('messages', {
  title: '消息',
  tab: true,
  activeTab: 'messages',
  auth: true,
  async render(view) {
    view.innerHTML = `<div style="padding-top:6px">${UI.gridSkeleton(1)}${UI.gridSkeleton(1)}</div>`;
    try {
      const data = await API.get('/conversations');
      if (!data.list.length) {
        view.innerHTML = UI.empty('💬', '暂无会话，去商品页找卖家聊聊吧',
          '<button class="btn soft" data-go="#/home">去逛逛</button>');
        return;
      }
      view.innerHTML = data.list.map((c) => `
        <div class="conv-item" data-go="#/chat/${c.id}">
          ${UI.avatar(c.peer.nickname)}
          <div class="mid">
            <div class="nm">${UI.esc(c.peer.nickname)}
              <span class="tag gray ellip" style="max-width:150px">${UI.esc(c.item.title)}</span>
            </div>
            <div class="sub ellip">${UI.esc(c.lastMessage || '开始聊天吧')}</div>
          </div>
          <div class="right">
            <div class="tm">${UI.time(c.lastTime)}</div>
            ${c.unread ? `<span class="unread">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
          </div>
        </div>`).join('');
    } catch (err) {
      view.innerHTML = UI.empty('⚠️', err.message, '<button class="btn soft" data-go="#/home">返回首页</button>');
    }
  },
});

App.route('chat', {
  title: '对话',
  navStyle: 'white',
  auth: true,
  async render(view, params) {
    if (ChatState.timer) clearInterval(ChatState.timer);
    const id = params.segments[1];
    ChatState.convId = id;

    view.innerHTML = `
      <div class="chat-page">
        <div class="chat-item-card" id="chatItem"><div class="skeleton" style="width:44px;height:44px"></div>
          <div class="skeleton grow" style="height:16px"></div></div>
        <div class="chat-scroll" id="chatScroll"><div class="loading-bar">加载中…</div></div>
        <div class="chat-input">
          <input id="msgInput" placeholder="和卖家聊聊吧…" maxlength="500">
          <button class="btn" id="btnSend">发送</button>
        </div>
      </div>`;

    let conv = null;
    const scroll = view.querySelector('#chatScroll');

    const paintItem = () => {
      view.querySelector('#chatItem').innerHTML = `
        <img src="${UI.esc(conv.item.image || '/img/logo.svg')}">
        <div class="grow">
          <div class="ellip" style="font-size:14px;font-weight:600">${UI.esc(conv.item.title)}</div>
          <div class="row gap8" style="margin-top:4px">${UI.price(conv.item.price)}
            <span class="tag ${conv.item.status === 'on_sale' ? 'green' : 'gray'}">
              ${{ on_sale: '在售', trading: '交易中', sold: '已售出', offline: '已下架' }[conv.item.status] || conv.item.status}
            </span></div>
        </div>
        <button class="btn soft sm" data-go="#/item/${conv.item.id}">查看</button>`;
    };

    const paint = (msgs) => {
      scroll.innerHTML = msgs.length ? msgs.map((m, i) => {
        const prev = msgs[i - 1];
        const showTime = !prev || (new Date(m.createdAt.replace(/-/g, '/')) - new Date(prev.createdAt.replace(/-/g, '/'))) > 5 * 60 * 1000;
        return `${showTime ? `<div class="chat-time">${UI.fullTime(m.createdAt)}</div>` : ''}
          <div class="chat-item ${m.fromMe ? 'me' : ''}">
            ${UI.avatar(m.fromMe ? API.user.nickname : conv.peer.nickname, 'sm')}
            <div class="bubble">${UI.esc(m.content)}</div>
          </div>`;
      }).join('') : `<div class="empty" style="padding:40px 10px"><div class="emoji">👋</div><p>打个招呼，开始交易吧</p></div>`;
      scroll.scrollTop = scroll.scrollHeight;
    };

    let msgs = [];
    try {
      const data = await API.get(`/conversations/${id}/messages`);
      conv = data.conversation;
      msgs = data.list;
      ChatState.lastId = msgs.length ? msgs[msgs.length - 1].id : 0;
      paintItem();
      paint(msgs);
      API.post(`/conversations/${id}/read`).then(() => App.refreshTabBadge()).catch(() => {});
    } catch (err) {
      scroll.innerHTML = UI.empty('⚠️', err.message, '<button class="btn soft" data-go="#/messages">返回消息列表</button>');
      return;
    }

    // 轮询新消息
    ChatState.timer = setInterval(async () => {
      if (!ChatState.lastId && ChatState.lastId !== 0) return;
      try {
        const data = await API.get(`/conversations/${ChatState.convId}/messages?afterId=${ChatState.lastId}`);
        if (data.list.length) {
          msgs = msgs.concat(data.list);
          ChatState.lastId = msgs[msgs.length - 1].id;
          paint(msgs);
          API.post(`/conversations/${ChatState.convId}/read`).catch(() => {});
          App.refreshTabBadge();
        }
      } catch (_) { /* 轮询失败静默重试 */ }
    }, 4000);

    const send = async () => {
      const input = view.querySelector('#msgInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try {
        const r = await API.post(`/conversations/${id}/messages`, { content: text });
        msgs.push(r.message);
        ChatState.lastId = r.message.id;
        paint(msgs);
      } catch (err) {
        UI.toast(err.message);
        input.value = text;
      }
    };
    view.querySelector('#btnSend').onclick = send;
    view.querySelector('#msgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  },
  onLeave() {
    if (ChatState.timer) { clearInterval(ChatState.timer); ChatState.timer = null; }
  },
});
