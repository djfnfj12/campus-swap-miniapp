/* ===========================================================
 * 商品详情 / 订单确认 / 发布与编辑
 * =========================================================== */
'use strict';

/* ---------------- 商品详情 ---------------- */
App.route('item', {
  title: '商品详情',
  navStyle: 'white',
  async render(view, params) {
    const id = params.segments[1];
    view.innerHTML = `<div class="page" style="padding-top:0">${UI.gridSkeleton(1)}</div>`;

    let data;
    try {
      data = await API.get(`/items/${id}`);
    } catch (err) {
      view.innerHTML = UI.empty('🕳️', err.message, '<button class="btn soft" data-go="#/home">返回首页</button>');
      return;
    }
    const it = data.item;
    const login = API.isLogin;
    const imgs = it.images.length ? it.images : ['/img/logo.svg'];
    const statusTip = {
      trading: { cls: 'orange', txt: '该商品正在交易中' },
      sold: { cls: 'gray', txt: '该商品已售出' },
      offline: { cls: 'gray', txt: '该商品已下架' },
    }[it.status];

    view.innerHTML = `
      <div class="gallery">
        <div class="track" id="galTrack">
          ${imgs.map((s) => `<img src="${UI.esc(s)}" alt="${UI.esc(it.title)}">`).join('')}
        </div>
        ${imgs.length > 1 ? `<span class="counter" id="galCount">1 / ${imgs.length}</span>` : ''}
      </div>

      ${statusTip ? `<div class="detail-card" style="padding:10px 14px"><span class="tag ${statusTip.cls}">${statusTip.txt}</span></div>` : ''}

      <div class="detail-card">
        <div class="price-line">
          ${UI.price(it.price, 'big')}
          ${it.originalPrice ? `<span class="strike">原价 ¥${it.originalPrice}</span>` : ''}
          <span class="tag green" style="margin-left:auto">${UI.esc(it.condition)}</span>
        </div>
        <h2>${UI.esc(it.title)}</h2>
        <div class="kv">
          <span class="tag gray">${UI.esc(it.category)}</span>
          <span>📍 ${UI.esc(it.spot)}</span>
          <span>👀 ${it.viewCount} 次浏览</span>
          <span>❤ ${it.favCount} 人收藏</span>
          <span>🕒 ${UI.time(it.createdAt)} 发布</span>
        </div>
      </div>

      <div class="owner-card" data-go="#/user/${it.seller.id}">
        ${UI.avatar(it.seller.nickname)}
        <div class="grow">
          <div style="font-weight:600;font-size:15px">${UI.esc(it.seller.nickname)} ${it.seller.rating ? UI.stars(it.seller.rating) : ''}</div>
          <div class="muted" style="font-size:12px">${UI.esc(it.seller.college || '校友')}
            ${it.seller.ratingCount ? ` · ${it.seller.ratingCount} 条评价` : ' · 暂无评价'}</div>
        </div>
        <span class="tag">查看主页 ›</span>
      </div>

      <div class="desc-card">
        <h3>宝贝描述</h3>
        <p>${it.description ? UI.esc(it.description) : '卖家很懒，什么都没写～'}</p>
      </div>

      ${data.reviews.length ? `
      <div class="desc-card">
        <h3>买家评价（${data.reviews.length}）</h3>
        ${data.reviews.map((r) => `
          <div class="review-item">
            <div class="between">
              <div class="row gap8">${UI.avatar(r.buyer.nickname, 'sm')}<b style="font-size:13px">${UI.esc(r.buyer.nickname)}</b>${UI.stars(r.rating)}</div>
              <span class="muted" style="font-size:11px">${UI.time(r.createdAt)}</span>
            </div>
            <p style="margin:6px 0 0;font-size:13.5px;color:#33373f">${UI.esc(r.content || '（未填写评价内容）')}</p>
          </div>`).join('')}
      </div>` : ''}
      <div style="height:6px"></div>

      <div class="actionbar" id="actionbar"></div>`;

    // 图片计数
    const track = view.querySelector('#galTrack');
    if (track && imgs.length > 1) {
      track.addEventListener('scroll', () => {
        const i = Math.round(track.scrollLeft / track.clientWidth) + 1;
        view.querySelector('#galCount').textContent = `${i} / ${imgs.length}`;
      });
    }

    // 底部操作栏
    const bar = view.querySelector('#actionbar');
    if (data.isOwner) {
      bar.innerHTML = `
        <button class="ico-btn" id="btnFav">♡<span>收藏 ${it.favCount}</span></button>
        <button class="btn ghost grow" id="btnOffline">${it.status === 'on_sale' ? '下架商品' : '重新上架'}</button>
        <button class="btn grow" id="btnEdit">编辑商品</button>`;
      bar.querySelector('#btnEdit').onclick = () => { location.hash = `#/publish?id=${it.id}`; };
      bar.querySelector('#btnOffline').onclick = async () => {
        const onSale = it.status === 'on_sale';
        const ok = await UI.confirm({
          title: onSale ? '下架商品' : '重新上架',
          text: onSale ? '下架后其他同学将无法搜索到该商品。' : '上架后商品将重新出现在搜索结果中。',
          ok: onSale ? '下架' : '上架',
        });
        if (!ok) return;
        try {
          if (onSale) await API.del(`/items/${it.id}`);
          else await API.put(`/items/${it.id}`, { status: 'on_sale' });
          UI.toast(onSale ? '已下架' : '已上架');
          App.render();
        } catch (err) { UI.toast(err.message); }
      };
      bar.querySelector('#btnFav').onclick = () => UI.toast('这是你自己发布的商品哦');
    } else {
      bar.innerHTML = `
        <button class="ico-btn ${it.isFavorite ? 'on' : ''}" id="btnFav">
          ${it.isFavorite ? '♥' : '♡'}<span id="favTxt">收藏 ${it.favCount}</span>
        </button>
        <button class="ico-btn" id="btnChat">💬<span>联系卖家</span></button>
        ${statusTip && it.status !== 'on_sale'
          ? `<button class="btn ghost grow" disabled>${it.status === 'sold' ? '已售出' : '交易中'}</button>`
          : `<button class="btn grow lg" id="btnBuy">立即购买</button>`}`;

      bar.querySelector('#btnFav').onclick = async () => {
        if (!login) return App.needLogin();
        try {
          const r = it.isFavorite ? await API.del(`/items/${it.id}/favorite`) : await API.post(`/items/${it.id}/favorite`);
          it.isFavorite = r.favorited;
          it.favCount = r.favCount;
          bar.querySelector('#btnFav').classList.toggle('on', r.favorited);
          bar.querySelector('#btnFav').innerHTML = `${r.favorited ? '♥' : '♡'}<span>收藏 ${r.favCount}</span>`;
          UI.toast(r.favorited ? '已收藏' : '已取消收藏');
        } catch (err) { UI.toast(err.message); }
      };

      bar.querySelector('#btnChat').onclick = async () => {
        if (!login) return App.needLogin();
        try {
          const r = await API.post('/conversations', { itemId: it.id });
          location.hash = `#/chat/${r.conversation.id}`;
        } catch (err) { UI.toast(err.message); }
      };

      const buyBtn = bar.querySelector('#btnBuy');
      if (buyBtn) buyBtn.onclick = () => {
        if (!login) return App.needLogin();
        location.hash = `#/buy/${it.id}`;
      };
    }
  },
});

/* ---------------- 订单确认页 ---------------- */
App.route('buy', {
  title: '确认下单',
  navStyle: 'white',
  async render(view, params) {
    const id = params.segments[1];
    let it;
    try {
      it = (await API.get(`/items/${id}`)).item;
    } catch (err) {
      view.innerHTML = UI.empty('🕳️', err.message, '<button class="btn soft" data-go="#/home">返回首页</button>');
      return;
    }

    view.innerHTML = `
      <div class="card" style="margin:12px;padding:13px;display:flex;gap:11px">
        <img src="${UI.esc(it.images[0] || '/img/logo.svg')}" style="width:66px;height:66px;border-radius:10px;object-fit:cover">
        <div class="grow">
          <div style="font-weight:600;font-size:14.5px;line-height:1.4">${UI.esc(it.title)}</div>
          <div class="between" style="margin-top:8px">${UI.price(it.price)}<span class="tag">${UI.esc(it.condition)}</span></div>
        </div>
      </div>

      <div class="form">
        <div class="field">
          <label>交易地点</label>
          <div class="ctrl">
            <input type="text" id="fSpot" maxlength="40" value="${UI.esc(it.spot)}" placeholder="与卖家约定的校内地点">
            <div class="hint">建议选择人多、有监控的公共区域，如食堂门口、图书馆大厅</div>
          </div>
        </div>
        <div class="field">
          <label>给卖家留言</label>
          <div class="ctrl"><input type="text" id="fNote" maxlength="100" placeholder="选填，例如方便交易的时间"></div>
        </div>
        <div class="field">
          <label>支付方式</label>
          <div class="ctrl"><div class="opt-group"><span class="opt on">当面付款（现金 / 转账）</span></div>
            <div class="hint">本平台为校园信息撮合平台，不代收款项</div></div>
        </div>
      </div>

      <div class="card" style="margin:12px;padding:14px">
        <div class="between" style="font-size:13.5px;color:var(--text-2)"><span>商品价格</span><span>¥${it.price.toFixed(2)}</span></div>
        <div class="between" style="font-size:13.5px;color:var(--text-2);margin-top:9px"><span>服务费</span><span>¥0.00</span></div>
        <div class="between" style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--line)">
          <span style="font-size:14px">合计</span>${UI.price(it.price, 'big')}
        </div>
      </div>

      <div class="actionbar">
        <div class="grow" style="font-size:13px;color:var(--text-2)">应付：<span class="price" style="font-size:19px">¥${it.price.toFixed(2)}</span></div>
        <button class="btn lg" id="btnSubmit" style="min-width:132px">提交订单</button>
      </div>`;

    view.querySelector('#btnSubmit').onclick = async (e) => {
      const btn = e.currentTarget;
      const ok = await UI.confirm({
        title: '确认下单',
        text: `将以 ¥${it.price.toFixed(2)} 购买「${it.title}」，下单后等待卖家确认。`,
        ok: '确认下单',
      });
      if (!ok) return;
      btn.disabled = true;
      btn.textContent = '提交中…';
      try {
        const r = await API.post('/orders', {
          itemId: it.id,
          spot: view.querySelector('#fSpot').value.trim(),
          note: view.querySelector('#fNote').value.trim(),
        });
        UI.toast('下单成功，等待卖家确认');
        location.hash = `#/order/${r.order.id}`;
      } catch (err) {
        UI.toast(err.message);
        btn.disabled = false;
        btn.textContent = '提交订单';
      }
    };
  },
});

/* ---------------- 发布 / 编辑商品 ---------------- */
const SAMPLE_IMAGES = [
  '/img/item-phone.svg', '/img/item-laptop.svg', '/img/item-headphone.svg', '/img/item-book.svg',
  '/img/item-notes.svg', '/img/item-lamp.svg', '/img/item-desk.svg', '/img/item-jacket.svg',
  '/img/item-shoes.svg', '/img/item-ukulele.svg', '/img/item-makeup.svg', '/img/item-plant.svg',
];

App.route('publish', {
  title: '发布闲置',
  tab: true,
  activeTab: 'publish',
  async render(view, params) {
    const editId = params.query.id || '';
    let origin = null;
    if (editId) {
      try { origin = (await API.get(`/items/${editId}`)).item; } catch (err) { UI.toast(err.message); }
    }

    const catData = await API.get('/categories');
    const cats = catData.categories;
    const state = {
      images: origin ? origin.images.slice() : [],
      category: origin ? origin.category : '',
      condition: origin ? origin.condition : '99新',
    };

    view.innerHTML = `
      <div class="section-title" style="margin-top:12px">${editId ? '编辑商品' : '发布你的闲置'}</div>
      <div class="form">
        <div class="field" style="display:block">
          <label style="width:auto;display:block;margin-bottom:10px">商品图片（最多 6 张，首图为封面）</label>
          <div class="img-picker" id="picker"></div>
          <input type="file" id="fileInput" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
          <div class="hint" style="margin-top:8px">支持直接上传本地图片，或从示例图库中选择</div>
        </div>

        <div class="field">
          <label>标题</label>
          <div class="ctrl">
            <input type="text" id="fTitle" maxlength="30" placeholder="一句话说清品牌型号、转手原因" value="${UI.esc(origin ? origin.title : '')}">
            <div class="hint">建议 8-30 字，例如「iPhone 13 128G 95新 无拆修」</div>
          </div>
        </div>

        <div class="field">
          <label>分类</label>
          <div class="ctrl"><div class="opt-group" id="catOpts">
            ${cats.map((c) => `<button class="opt ${state.category === c.name ? 'on' : ''}" data-v="${UI.esc(c.name)}">${UI.esc(c.name)}</button>`).join('')}
          </div></div>
        </div>

        <div class="field">
          <label>成色</label>
          <div class="ctrl"><div class="opt-group" id="condOpts">
            ${catData.conditions.map((c) => `<button class="opt ${state.condition === c ? 'on' : ''}" data-v="${UI.esc(c)}">${UI.esc(c)}</button>`).join('')}
          </div></div>
        </div>

        <div class="field">
          <label>售价</label>
          <div class="ctrl">
            <div class="row gap8"><span class="price big"><span class="cur">¥</span></span>
            <input type="number" id="fPrice" min="0.01" max="99999" step="0.01" placeholder="0.00" value="${origin ? origin.price : ''}"></div>
          </div>
        </div>

        <div class="field">
          <label>原价</label>
          <div class="ctrl"><input type="number" id="fOrig" min="0" max="999999" step="0.01" placeholder="选填，让买家看到折扣力度" value="${origin && origin.originalPrice ? origin.originalPrice : ''}"></div>
        </div>

        <div class="field">
          <label>宝贝描述</label>
          <div class="ctrl">
            <textarea id="fDesc" maxlength="500" placeholder="入手渠道、使用时长、有无瑕疵、配件是否齐全…">${origin ? UI.esc(origin.description) : ''}</textarea>
            <div class="hint"><span id="descCount">0</span>/500</div>
          </div>
        </div>

        <div class="field">
          <label>交易地点</label>
          <div class="ctrl"><input type="text" id="fSpot" maxlength="40" placeholder="如：三食堂门口 / 图书馆一楼" value="${UI.esc(origin ? origin.spot : '')}"></div>
        </div>
      </div>

      <div class="actionbar">
        <button class="btn ghost lg" id="btnDraft" style="flex:0 0 auto">存草稿</button>
        <button class="btn lg grow" id="btnPublish">${editId ? '保存修改' : '立即发布'}</button>
      </div>`;

    /* ---- 图片选择 ---- */
    const picker = view.querySelector('#picker');
    const fileInput = view.querySelector('#fileInput');
    const renderPicker = () => {
      let html = state.images.map((src, i) => `
        <div class="img-cell"><img src="${UI.esc(src)}"><button class="del" data-del="${i}">×</button></div>`).join('');
      if (state.images.length < 6) {
        html += `<button class="img-cell add" id="addImg"><b>＋</b>上传图片</button>`;
        html += `<button class="img-cell add" id="sampleImg" style="border-style:dashed"><b>🖼</b>示例图</button>`;
      }
      picker.innerHTML = html;
      picker.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = () => { state.images.splice(Number(b.dataset.del), 1); renderPicker(); };
      });
      const add = view.querySelector('#addImg');
      if (add) add.onclick = () => fileInput.click();
      const sample = view.querySelector('#sampleImg');
      if (sample) sample.onclick = async () => {
        const pick = await UI.sheet({
          title: '选择示例图片',
          items: SAMPLE_IMAGES.map((s) => ({ label: s.replace('/img/', '').replace('.svg', ''), value: s })),
        });
        if (pick && pick.value) { state.images.push(pick.value); renderPicker(); }
      };
    };
    renderPicker();

    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) return UI.toast('图片不能超过 4MB');
      UI.toast('上传中…', 800);
      const dataUrl = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => resolve(null);
        r.readAsDataURL(file);
      });
      if (!dataUrl) return UI.toast('图片读取失败');
      try {
        const r = await API.post('/upload', { dataUrl });
        state.images.push(r.url);
        renderPicker();
        UI.toast('上传成功');
      } catch (err) { UI.toast(err.message); }
    };

    /* ---- 选项组 ---- */
    const bindOpts = (sel, key) => {
      view.querySelectorAll(`${sel} [data-v]`).forEach((b) => {
        b.onclick = () => {
          state[key] = b.dataset.v;
          view.querySelectorAll(`${sel} [data-v]`).forEach((x) => x.classList.toggle('on', x === b));
        };
      });
    };
    bindOpts('#catOpts', 'category');
    bindOpts('#condOpts', 'condition');

    const desc = view.querySelector('#fDesc');
    const cnt = view.querySelector('#descCount');
    cnt.textContent = String(desc.value.length);
    desc.addEventListener('input', () => { cnt.textContent = String(desc.value.length); });

    /* ---- 提交 ---- */
    const gather = () => ({
      title: view.querySelector('#fTitle').value.trim(),
      category: state.category,
      condition: state.condition,
      price: view.querySelector('#fPrice').value,
      originalPrice: view.querySelector('#fOrig').value,
      description: desc.value.trim(),
      spot: view.querySelector('#fSpot').value.trim(),
      images: state.images,
    });

    const validate = (d) => {
      if (d.images.length === 0) return '请至少上传 1 张商品图片';
      if (d.title.length < 2) return '标题至少 2 个字';
      if (!d.category) return '请选择商品分类';
      if (!d.price || Number(d.price) <= 0) return '请填写有效的售价';
      if (d.originalPrice && Number(d.originalPrice) < Number(d.price)) return '原价不能低于售价';
      return '';
    };

    view.querySelector('#btnPublish').onclick = async (e) => {
      const btn = e.currentTarget;
      const d = gather();
      const err = validate(d);
      if (err) return UI.toast(err);
      if (!API.isLogin) return App.needLogin();
      btn.disabled = true;
      btn.textContent = '提交中…';
      try {
        const r = editId ? await API.put(`/items/${editId}`, d) : await API.post('/items', d);
        UI.toast(editId ? '已保存修改' : '发布成功');
        location.hash = `#/item/${r.item.id}`;
      } catch (ex) {
        UI.toast(ex.message);
        btn.disabled = false;
        btn.textContent = editId ? '保存修改' : '立即发布';
      }
    };

    view.querySelector('#btnDraft').onclick = () => {
      localStorage.setItem('cs_draft', JSON.stringify(gather()));
      UI.toast('草稿已保存在本机');
    };

    // 恢复草稿（仅新增时）
    if (!editId) {
      try {
        const draft = JSON.parse(localStorage.getItem('cs_draft') || 'null');
        if (draft && draft.title) {
          view.querySelector('#fTitle').value = draft.title;
          view.querySelector('#fPrice').value = draft.price || '';
          view.querySelector('#fOrig').value = draft.originalPrice || '';
          desc.value = draft.description || '';
          view.querySelector('#fSpot').value = draft.spot || '';
          if (draft.images && draft.images.length) { state.images = draft.images; renderPicker(); }
          cnt.textContent = String(desc.value.length);
          UI.toast('已为你恢复上次的草稿');
        }
      } catch (_) { /* ignore */ }
    }
  },
});
