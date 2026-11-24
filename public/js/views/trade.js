/* ===========================================================
 * 交易模块：订单列表 / 订单详情 / 收藏夹
 * =========================================================== */
'use strict';

const OrderState = { role: 'buyer', status: 'all', page: 1, list: [], hasMore: false, loading: false };

const STATUS_TIP = {
  pending: '等待卖家确认',
  confirmed: '已约好，当面交易中',
  completed: '交易完成',
  cancelled: '订单已取消',
};

function orderCard(o, opts = {}) {
  const img = (o.item.images && o.item.images[0]) || '/img/logo.svg';
  const other = o.role === 'buyer' ? o.seller : o.buyer;
  const ops = [];
  if (opts.withOps) {
    if (o.role === 'seller' && o.status === 'pending') {
      ops.push(`<button class="btn ghost sm" data-op="cancelled" data-id="${o.id}">拒绝</button>`);
      ops.push(`<button class="btn sm" data-op="confirmed" data-id="${o.id}">确认接单</button>`);
    }
    if (o.role === 'seller' && o.status === 'confirmed') {
      ops.push(`<button class="btn ghost sm" data-op="cancelled" data-id="${o.id}">取消订单</button>`);
    }
    if (o.role === 'buyer' && o.status === 'pending') {
      ops.push(`<button class="btn ghost sm" data-op="cancelled" data-id="${o.id}">取消订单</button>`);
    }
    if (o.role === 'buyer' && o.status === 'confirmed') {
      ops.push(`<button class="btn ok sm" data-op="completed" data-id="${o.id}">确认收货</button>`);
    }
    if (o.role === 'buyer' && o.status === 'completed' && !o.reviewed) {
      ops.push(`<button class="btn sm" data-review="${o.id}">评价卖家</button>`);
    }
    ops.push(`<button class="btn ghost sm" data-go="#/order/${o.id}">详情</button>`);
  }
  return `
    <div class="order-card">
      <div class="order-head">
        <span>${o.role === 'buyer' ? '我买到的 · 卖家 ' : '我卖出的 · 买家 '}<b>${UI.esc(other.nickname)}</b></span>
        <span class="st ${o.status}">${UI.esc(o.statusText)}</span>
      </div>
      <div class="order-body" data-go="#/item/${o.item.id}">
        <img src="${UI.esc(img)}" alt="">
        <div class="grow">
          <div class="t ellip">${UI.esc(o.item.title)}</div>
          <div class="muted" style="font-size:12px">📍 ${UI.esc(o.spot || '当面交易')}</div>
          <div class="between" style="margin-top:7px">${UI.price(o.price)}<span class="muted" style="font-size:11px">${UI.time(o.createdAt)}</span></div>
        </div>
      </div>
      ${ops.length ? `<div class="order-foot"><span class="muted" style="font-size:12px">单号 #${o.id}</span><div class="ops">${ops.join('')}</div></div>` : ''}
    </div>`;
}

async function loadOrders() {
  if (OrderState.loading) return;
  OrderState.loading = true;
  const box = document.getElementById('orderList');
  if (box && OrderState.page === 1) box.innerHTML = `<div class="order-card"><div class="order-body skeleton" style="height:70px"></div></div>`;
  try {
    const qs = new URLSearchParams({ role: OrderState.role, status: OrderState.status, page: String(OrderState.page), pageSize: '10' });
    const data = await API.get(`/orders?${qs}`);
    OrderState.list = OrderState.page > 1 ? OrderState.list.concat(data.list) : data.list;
    OrderState.hasMore = data.hasMore;
    OrderState.page += 1;
    const el = document.getElementById('orderList');
    if (!el) return;
    if (!OrderState.list.length) {
      el.innerHTML = UI.empty(OrderState.role === 'buyer' ? '🛒' : '💰',
        OrderState.role === 'buyer' ? '还没有买到东西，去逛逛吧' : '还没有卖出东西，先发布一件闲置',
        `<button class="btn soft" data-go="${OrderState.role === 'buyer' ? '#/home' : '#/publish'}">${OrderState.role === 'buyer' ? '去逛逛' : '去发布'}</button>`);
      return;
    }
    el.innerHTML = OrderState.list.map((o) => orderCard(o, { withOps: true })).join('')
      + (OrderState.hasMore ? '<div class="list-end">上拉加载更多</div>' : '<div class="list-end">— 已经到底啦 —</div>');
  } catch (err) {
    UI.toast(err.message);
  } finally {
    OrderState.loading = false;
  }
}

/** 订单状态流转的统一入口 */
async function applyOrderOp(orderId, status) {
  const labels = { confirmed: '确认接单', completed: '确认收货', cancelled: '取消订单' };
  const ok = await UI.confirm({
    title: labels[status] || '操作',
    text: status === 'completed' ? '确认收到商品后订单将完成，且不可撤销。' : '确定执行该操作吗？',
    ok: labels[status] || '确定',
    danger: status === 'cancelled',
  });
  if (!ok) return;
  try {
    const r = await API.post(`/orders/${orderId}/status`, { status });
    UI.toast(r.message);
    App.render();
  } catch (err) { UI.toast(err.message); }
}

/** 评价对话框 */
async function reviewOrder(orderId) {
  let rating = 5;
  await UI.dialog({
    title: '评价这次交易',
    html: `
      <div id="starPick" style="font-size:30px;letter-spacing:6px;margin:6px 0 12px;user-select:none">
        ${[1, 2, 3, 4, 5].map((i) => `<span data-s="${i}" style="cursor:pointer;color:${i <= rating ? 'var(--gold)' : '#dfe2e8'}">★</span>`).join('')}
      </div>
      <p style="text-align:left;margin-bottom:6px">说说卖家的服务与商品吧（选填）</p>
      <textarea id="rvText" maxlength="120" placeholder="商品与描述相符吗？卖家好说话吗？"
        style="width:100%;height:74px;border:1px solid var(--line);border-radius:10px;padding:9px;font-size:13.5px;resize:none;outline:none"></textarea>`,
    okText: '提交评价',
    onOpen(root) {
      root.querySelector('#starPick').onclick = (e) => {
        const s = e.target.dataset.s;
        if (!s) return;
        rating = Number(s);
        root.querySelectorAll('#starPick [data-s]').forEach((el) => {
          el.style.color = Number(el.dataset.s) <= rating ? 'var(--gold)' : '#dfe2e8';
        });
      };
    },
    async onOk(root) {
      try {
        const r = await API.post(`/orders/${orderId}/review`, {
          rating,
          content: root.querySelector('#rvText').value.trim(),
        });
        UI.toast(r.message);
        setTimeout(() => App.render(), 300);
      } catch (err) {
        UI.toast(err.message);
        return false;
      }
      return true;
    },
  });
}

App.route('orders', {
  title: '我的订单',
  navStyle: 'white',
  async render(view, params) {
    if (params.query.role === 'seller' || params.query.role === 'buyer') OrderState.role = params.query.role;
    if (params.query.status) OrderState.status = params.query.status;
    OrderState.page = 1;
    OrderState.list = [];
    view.innerHTML = `
      <div class="seg" id="roleSeg">
        <button class="${OrderState.role === 'buyer' ? 'on' : ''}" data-r="buyer">我买到的</button>
        <button class="${OrderState.role === 'seller' ? 'on' : ''}" data-r="seller">我卖出的</button>
      </div>
      <div class="filters" id="stFilters"></div>
      <div id="orderList" style="padding-top:4px"></div>`;

    const stList = [
      { k: 'all', t: '全部' }, { k: 'pending', t: '待确认' },
      { k: 'confirmed', t: '待交易' }, { k: 'completed', t: '已完成' }, { k: 'cancelled', t: '已取消' },
    ];
    const renderFilters = () => {
      view.querySelector('#stFilters').innerHTML = stList
        .map((s) => `<button class="chip ${OrderState.status === s.k ? 'on' : ''}" data-st="${s.k}">${s.t}</button>`).join('');
      view.querySelectorAll('[data-st]').forEach((b) => {
        b.onclick = () => {
          OrderState.status = b.dataset.st;
          OrderState.page = 1;
          OrderState.list = [];
          renderFilters();
          loadOrders();
        };
      });
    };
    view.querySelectorAll('[data-r]').forEach((b) => {
      b.onclick = () => {
        OrderState.role = b.dataset.r;
        OrderState.page = 1;
        OrderState.list = [];
        view.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b));
        loadOrders();
      };
    });
    view.onclick = (e) => {
      const op = e.target.closest('[data-op]');
      if (op) { e.stopPropagation(); applyOrderOp(op.dataset.id, op.dataset.op); return; }
      const rv = e.target.closest('[data-review]');
      if (rv) { e.stopPropagation(); reviewOrder(rv.dataset.review); }
    };

    renderFilters();
    loadOrders();
  },
  onScroll(e) {
    const el = e.target;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 260 && OrderState.hasMore && !OrderState.loading) loadOrders();
  },
});

/* ---------------- 订单详情 ---------------- */
App.route('order', {
  title: '订单详情',
  navStyle: 'white',
  async render(view, params) {
    const id = params.segments[1];
    let data;
    try { data = await API.get(`/orders/${id}`); } catch (err) {
      view.innerHTML = UI.empty('🧾', err.message, '<button class="btn soft" data-go="#/orders">返回订单列表</button>');
      return;
    }
    const o = data.order;
    const steps = [
      { k: 'pending', t: '已下单', d: '等待卖家确认' },
      { k: 'confirmed', t: '已确认', d: '约定当面交易' },
      { k: 'completed', t: '已完成', d: '双方交易结束' },
    ];
    const cancelIndex = o.status === 'cancelled' ? 1 : -1;
    const curIdx = o.status === 'completed' ? 2 : o.status === 'confirmed' ? 1 : o.status === 'pending' ? 0 : cancelIndex;

    view.innerHTML = `
      <div class="card" style="margin:12px;padding:16px;background:${o.status === 'completed' ? '#eafaf1' : o.status === 'cancelled' ? '#f4f5f8' : 'var(--brand-soft)'}">
        <div style="font-size:17px;font-weight:700" class="${o.status === 'pending' || o.status === 'confirmed' ? '' : ''}">${UI.esc(o.statusText)}</div>
        <div class="muted" style="font-size:12.5px;margin-top:5px">${UI.esc(STATUS_TIP[o.status])}</div>
      </div>

      <div class="card" style="margin:12px;padding:6px 4px">
        ${steps.map((s, i) => `
          <div class="row gap8" style="padding:9px 14px;opacity:${i <= curIdx && o.status !== 'cancelled' ? 1 : .38}">
            <span style="width:10px;height:10px;border-radius:50%;background:${i <= curIdx && o.status !== 'cancelled' ? 'var(--ok)' : '#d5d9e0'}"></span>
            <div class="grow"><b style="font-size:14px">${s.t}</b><div class="muted" style="font-size:11.5px">${s.d}</div></div>
            <span class="muted" style="font-size:11px">${i === 0 ? UI.fullTime(o.createdAt) : ''}</span>
          </div>`).join('')}
        ${o.status === 'cancelled' ? `
          <div class="row gap8" style="padding:9px 14px">
            <span style="width:10px;height:10px;border-radius:50%;background:var(--danger)"></span>
            <div class="grow"><b style="font-size:14px">已取消</b><div class="muted" style="font-size:11.5px">订单终止于 ${UI.fullTime(o.updatedAt)}</div></div>
          </div>` : ''}
      </div>

      <div class="order-card" style="margin:0 12px 12px">
        <div class="order-body" data-go="#/item/${o.item.id}" style="cursor:pointer">
          <img src="${UI.esc(o.item.images[0] || '/img/logo.svg')}">
          <div class="grow">
            <div class="t">${UI.esc(o.item.title)}</div>
            <div class="between">${UI.price(o.price)}<span class="tag gray">${UI.esc(o.item.category)}</span></div>
          </div>
        </div>
        <div style="padding:12px 13px;border-top:1px dashed var(--line);font-size:13px;color:var(--text-2);line-height:2">
          <div class="between"><span>交易地点</span><span style="color:var(--text)">${UI.esc(o.spot || '—')}</span></div>
          <div class="between"><span>买家</span><span style="color:var(--text)">${UI.esc(o.buyer.nickname)}（${UI.esc(o.buyer.studentId)}）</span></div>
          <div class="between"><span>卖家</span><span style="color:var(--text)">${UI.esc(o.seller.nickname)}（${UI.esc(o.seller.studentId)}）</span></div>
          ${o.note ? `<div class="between"><span>留言</span><span style="color:var(--text)">${UI.esc(o.note)}</span></div>` : ''}
          <div class="between"><span>下单时间</span><span style="color:var(--text)">${UI.fullTime(o.createdAt)}</span></div>
          <div class="between"><span>订单编号</span><span style="color:var(--text)">CS${String(o.id).padStart(8, '0')}</span></div>
        </div>
      </div>

      ${o.review ? `
        <div class="card" style="margin:0 12px 12px;padding:13px">
          <div class="between"><b style="font-size:13.5px">我的评价</b>${UI.stars(o.review.rating)}</div>
          <p style="margin:8px 0 0;font-size:13.5px;color:#33373f">${UI.esc(o.review.content || '（未填写内容）')}</p>
        </div>` : ''}

      <div class="actionbar" id="orderOps"></div>`;

    const ops = view.querySelector('#orderOps');
    const buttons = [];
    if (o.role === 'seller' && o.status === 'pending') {
      buttons.push(`<button class="btn ghost" data-op="cancelled" data-id="${o.id}">拒绝订单</button>`);
      buttons.push(`<button class="btn grow" data-op="confirmed" data-id="${o.id}">确认接单</button>`);
    } else if (o.role === 'seller' && o.status === 'confirmed') {
      buttons.push(`<button class="btn ghost grow" data-op="cancelled" data-id="${o.id}">取消订单</button>`);
    } else if (o.role === 'buyer' && o.status === 'pending') {
      buttons.push(`<button class="btn ghost grow" data-op="cancelled" data-id="${o.id}">取消订单</button>`);
    } else if (o.role === 'buyer' && o.status === 'confirmed') {
      buttons.push(`<button class="btn ok grow lg" data-op="completed" data-id="${o.id}">确认收货，完成交易</button>`);
    } else if (o.role === 'buyer' && o.status === 'completed' && !o.reviewed) {
      buttons.push(`<button class="btn grow lg" data-review="${o.id}">评价卖家</button>`);
    } else {
      buttons.push(`<button class="btn ghost grow" data-go="#/home">返回首页</button>`);
    }
    ops.innerHTML = buttons.join('');

    ops.addEventListener('click', (e) => {
      const op = e.target.closest('[data-op]');
      if (op) return applyOrderOp(op.dataset.id, op.dataset.op);
      const rv = e.target.closest('[data-review]');
      if (rv) reviewOrder(rv.dataset.review);
    });
  },
});

/* ---------------- 收藏夹 ---------------- */
const FavState = { page: 1, list: [], hasMore: false, loading: false };

async function loadFavs() {
  if (FavState.loading) return;
  FavState.loading = true;
  const box = document.getElementById('favList');
  if (box && FavState.page === 1) box.innerHTML = UI.gridSkeleton();
  try {
    const data = await API.get(`/favorites?page=${FavState.page}&pageSize=10`);
    FavState.list = FavState.page > 1 ? FavState.list.concat(data.list) : data.list;
    FavState.hasMore = data.hasMore;
    FavState.page += 1;
    const el = document.getElementById('favList');
    if (!el) return;
    el.innerHTML = FavState.list.length
      ? `<div class="grid">${FavState.list.map(UI.card).join('')}</div>
         ${FavState.hasMore ? '<div class="list-end">上拉加载更多</div>' : '<div class="list-end">— 已经到底啦 —</div>'}`
      : UI.empty('🤍', '还没有收藏任何商品', '<button class="btn soft" data-go="#/home">去逛逛</button>');
  } catch (err) { UI.toast(err.message); }
  finally { FavState.loading = false; }
}

App.route('favorites', {
  title: '我的收藏',
  navStyle: 'white',
  async render(view) {
    FavState.page = 1;
    FavState.list = [];
    view.innerHTML = `<div id="favList" style="padding-top:12px"></div>`;
    loadFavs();
  },
  onScroll(e) {
    const el = e.target;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 260 && FavState.hasMore && !FavState.loading) loadFavs();
  },
});
