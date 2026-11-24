/* ===========================================================
 * 分类页：左侧类目导航 + 右侧商品列表
 * =========================================================== */
'use strict';

const CatState = { cats: [], current: '', condition: '', sort: 'new', page: 1, list: [], hasMore: false, loading: false };

async function loadCatFeed() {
  if (CatState.loading) return;
  CatState.loading = true;
  const box = document.getElementById('catFeed');
  if (box && CatState.page === 1) box.innerHTML = UI.gridSkeleton(4);

  try {
    const qs = new URLSearchParams({ page: String(CatState.page), pageSize: '10', sort: CatState.sort });
    if (CatState.current) qs.set('category', CatState.current);
    if (CatState.condition) qs.set('condition', CatState.condition);
    const data = await API.get(`/items?${qs}`);
    CatState.list = CatState.page > 1 ? CatState.list.concat(data.list) : data.list;
    CatState.hasMore = data.hasMore;
    CatState.page += 1;

    const el = document.getElementById('catFeed');
    if (!el) return;
    if (!CatState.list.length) {
      el.innerHTML = UI.empty('📦', '该分类下暂无在售商品',
        '<button class="btn soft" data-go="#/publish">发布第一件</button>');
      return;
    }
    el.innerHTML = `<div class="grid">${CatState.list.map(UI.card).join('')}</div>`
      + (CatState.hasMore ? '<div class="list-end">上拉加载更多</div>' : '<div class="list-end">— 已经到底啦 —</div>');
  } catch (err) {
    UI.toast(err.message);
  } finally {
    CatState.loading = false;
  }
}

App.route('category', {
  title: '分类',
  tab: true,
  activeTab: 'category',
  async render(view, params) {
    CatState.current = params.query.c || '';
    CatState.condition = params.query.cond || '';
    CatState.page = 1;
    CatState.list = [];

    try {
      const data = await API.get('/categories');
      CatState.cats = data.categories;
      CatState.conditions = data.conditions;
    } catch (err) { UI.toast(err.message); return; }

    // 兜底：未指定或非法分类时回落到第一个分类
    if (!CatState.cats.some((c) => c.name === CatState.current)) {
      CatState.current = CatState.cats.length ? CatState.cats[0].name : '';
    }

    view.innerHTML = `
      <div class="cat-page">
        <div class="cat-side" id="catSide"></div>
        <div class="cat-main">
          <div class="cat-head" id="catHead"></div>
          <div class="filters" id="condFilters"></div>
          <div id="catFeed" style="padding-top:10px"></div>
        </div>
      </div>`;

    const renderSide = () => {
      view.querySelector('#catSide').innerHTML = CatState.cats.map((c) => `
        <button class="${c.name === CatState.current ? 'on' : ''}" data-c="${UI.esc(c.name)}">
          ${UI.esc(c.name)}<br><small style="font-size:10px;opacity:.7">${c.count}</small>
        </button>`).join('');
      view.querySelectorAll('[data-c]').forEach((b) => {
        b.onclick = () => {
          CatState.current = b.dataset.c;
          CatState.condition = '';
          CatState.page = 1;
          CatState.list = [];
          renderSide();
          renderConds();
          loadCatFeed();
        };
      });
    };

    const renderConds = () => {
      view.querySelector('#catHead').textContent = `${CatState.current} · 在售 ${CatState.cats.find((c) => c.name === CatState.current)?.count || 0} 件`;
      view.querySelector('#condFilters').innerHTML =
        ['<button class="chip ' + (CatState.condition ? '' : 'on') + '" data-cond="">全部成色</button>']
          .concat((CatState.conditions || []).map((c) =>
            `<button class="chip ${CatState.condition === c ? 'on' : ''}" data-cond="${UI.esc(c)}">${UI.esc(c)}</button>`))
          .concat(['<button class="chip" id="sortChip">⇅ 综合</button>'])
          .join('');
      view.querySelectorAll('[data-cond]').forEach((b) => {
        b.onclick = () => {
          CatState.condition = b.dataset.cond;
          CatState.page = 1;
          CatState.list = [];
          renderConds();
          loadCatFeed();
        };
      });
      view.querySelector('#sortChip').onclick = async () => {
        const pick = await UI.sheet({ title: '排序方式', items: SORTS.map((s) => ({ label: s.label, key: s.key })) });
        if (!pick) return;
        CatState.sort = pick.key;
        CatState.page = 1;
        CatState.list = [];
        loadCatFeed();
      };
    };

    renderSide();
    renderConds();
    loadCatFeed();
  },
  onScroll(e) {
    const el = e.target;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 260) {
      if (CatState.hasMore && !CatState.loading) loadCatFeed();
    }
  },
});
